// ─────────────────────────────────────────────────────────────────────────────
// Module facturation — calculs, génération de numéro, snapshot, PDF
// Phase 1
// ─────────────────────────────────────────────────────────────────────────────
import PDFDocument from "pdfkit";
import type { Invoice, InvoiceItem, User } from "@shared/schema-active";

export interface InvoiceItemDraft {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface InvoiceTotals {
  subtotalCents: number; // HT
  vatCents: number;
  totalCents: number; // TTC
}

/** Calcule les totaux HT/TVA/TTC à partir des lignes. */
export function computeInvoiceTotals(
  items: InvoiceItemDraft[],
  vatEnabled: boolean,
  vatRate: number, // *100 (ex 2000 = 20%)
): InvoiceTotals {
  const subtotalCents = items.reduce((sum, it) => {
    const qty = Math.max(0, Math.floor(it.quantity || 0));
    const unit = Math.max(0, Math.floor(it.unitPriceCents || 0));
    return sum + qty * unit;
  }, 0);
  const vatCents = vatEnabled
    ? Math.round((subtotalCents * Math.max(0, vatRate)) / 10000)
    : 0;
  return {
    subtotalCents,
    vatCents,
    totalCents: subtotalCents + vatCents,
  };
}

/** Calcule le total HT pour une ligne. */
export function computeItemTotal(qty: number, unitPriceCents: number): number {
  return Math.max(0, Math.floor(qty)) * Math.max(0, Math.floor(unitPriceCents));
}

/** Snapshot praticienne sérialisé dans la facture (figé). */
export interface PractitionerSnapshot {
  name: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  siret?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  iban?: string | null;
  bic?: string | null;
  vatEnabled: boolean;
  vatRate: number;
  legalMention?: string | null;
  paymentTerms?: string | null;
  logoBase64?: string | null;
}

export function buildPractitionerSnapshot(u: User): PractitionerSnapshot {
  const a = u as any;
  return {
    name: u.name,
    email: u.email,
    phone: u.phone,
    companyName: a.billingCompanyName ?? null,
    siret: a.billingSiret ?? null,
    address: a.billingAddress ?? null,
    postalCode: a.billingPostalCode ?? null,
    city: a.billingCity ?? null,
    country: a.billingCountry ?? "France",
    iban: a.billingIban ?? null,
    bic: a.billingBic ?? null,
    vatEnabled: !!a.billingVatEnabled,
    vatRate: typeof a.billingVatRate === "number" ? a.billingVatRate : 2000,
    legalMention: a.billingLegalMention ?? null,
    paymentTerms: a.billingPaymentTerms ?? null,
    logoBase64: a.billingLogoBase64 ?? null,
  };
}

/** Mention légale par défaut pour praticienne non assujettie à la TVA (micro-BNC). */
export const DEFAULT_LEGAL_MENTION_NO_VAT =
  "TVA non applicable, art. 293 B du CGI.";

/** Format prix en centimes → "12,50 €" */
export function formatPriceCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${(abs / 100).toFixed(2).replace(".", ",")} €`;
}

/** Format pourcentage stocké *100 → "20 %" ou "5,5 %" */
export function formatVatRate(rateX100: number): string {
  const v = rateX100 / 100;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
  return `${s} %`;
}

/** Formate une date ms en "08/05/2026" */
export function formatDateFR(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Bucharest",
  });
}

/** Année locale à partir d'une date ms (Europe/Bucharest). */
export function getYearFromMs(ms: number, tz = "Europe/Bucharest"): number {
  const d = new Date(ms);
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    year: "numeric",
  });
  return Number(fmt.format(d));
}

/**
 * Construit le numéro FACT-YYYY-XXXX (4 chiffres minimum).
 */
export function buildInvoiceNumber(year: number, value: number): string {
  return `FACT-${year}-${String(value).padStart(4, "0")}`;
}

/** Label humain d'un mode de paiement. */
export function paymentMethodLabel(m: string | null | undefined): string {
  switch (m) {
    case "cash": return "Espèces";
    case "check": return "Chèque";
    case "transfer": return "Virement";
    case "card": return "Carte bancaire";
    default: return "—";
  }
}

/** Label humain d'un statut de facture. */
export function invoiceStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "draft": return "Brouillon";
    case "sent": return "Envoyée";
    case "paid": return "Payée";
    case "cancelled": return "Annulée";
    default: return s || "—";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Génération PDF
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_GREEN = "#1b4332";
const COLOR_GREEN_LIGHT = "#52796f";
const COLOR_BG_SOFT = "#f7faf9";
const COLOR_BORDER = "#d6e0dc";
const COLOR_TEXT = "#1a1a1a";
const COLOR_MUTED = "#6b7a76";

/**
 * Génère un buffer PDF d'une facture.
 * Utilise le snapshot praticienne stocké (figé), pas le user actuel.
 */
export async function generateInvoicePdf(
  invoice: Invoice,
  items: InvoiceItem[],
  snapshot: PractitionerSnapshot,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: `Facture ${invoice.number}`,
          Author: snapshot.companyName || snapshot.name,
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (e) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftX = doc.page.margins.left;
      const rightX = doc.page.width - doc.page.margins.right;

      // ── HEADER : bandeau vert ──
      doc.rect(0, 0, doc.page.width, 90).fill(COLOR_GREEN);

      // Logo (à gauche dans le bandeau)
      let logoBottom = 0;
      if (snapshot.logoBase64) {
        try {
          const base64 = snapshot.logoBase64.replace(/^data:image\/\w+;base64,/, "");
          const buf = Buffer.from(base64, "base64");
          doc.image(buf, leftX, 18, { fit: [120, 54] });
          logoBottom = 72;
        } catch { /* logo invalide, on saute */ }
      } else {
        doc
          .fillColor("#ffffff")
          .font("Helvetica-Bold")
          .fontSize(22)
          .text(snapshot.companyName || snapshot.name, leftX, 32, {
            width: 300,
          });
      }

      // Titre FACTURE à droite
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(28)
        .text("FACTURE", leftX, 28, { width: pageWidth, align: "right" });
      doc
        .fillColor("#ffffff")
        .font("Helvetica")
        .fontSize(11)
        .text(invoice.number, leftX, 60, { width: pageWidth, align: "right" });

      // ── INFOS PRATICIENNE / CLIENT ──
      let y = 110;
      doc.fillColor(COLOR_TEXT);

      // Bloc gauche : praticienne
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_GREEN).text("ÉMETTEUR", leftX, y);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_TEXT)
        .text(snapshot.companyName || snapshot.name, leftX, y + 16);
      doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
      let yLeft = y + 32;
      if (snapshot.address) { doc.text(snapshot.address, leftX, yLeft, { width: 240 }); yLeft += 14; }
      if (snapshot.postalCode || snapshot.city) {
        doc.text(`${snapshot.postalCode || ""} ${snapshot.city || ""}`.trim(), leftX, yLeft);
        yLeft += 14;
      }
      if (snapshot.country) { doc.text(snapshot.country, leftX, yLeft); yLeft += 14; }
      if (snapshot.email) { doc.text(snapshot.email, leftX, yLeft); yLeft += 14; }
      if (snapshot.phone) { doc.text(snapshot.phone, leftX, yLeft); yLeft += 14; }
      if (snapshot.siret) { doc.text(`SIRET : ${snapshot.siret}`, leftX, yLeft); yLeft += 14; }

      // Bloc droit : client
      const rightBlockX = leftX + pageWidth / 2 + 20;
      const rightBlockW = pageWidth / 2 - 20;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_GREEN).text("FACTURÉ À", rightBlockX, y);
      const clientName = `${invoice.clientFirstName || ""} ${invoice.clientLastName || ""}`.trim();
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_TEXT)
        .text(clientName || "—", rightBlockX, y + 16, { width: rightBlockW });
      doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
      let yRight = y + 32;
      if (invoice.clientAddress) { doc.text(invoice.clientAddress, rightBlockX, yRight, { width: rightBlockW }); yRight += 14; }
      if (invoice.clientPostalCode || invoice.clientCity) {
        doc.text(`${invoice.clientPostalCode || ""} ${invoice.clientCity || ""}`.trim(), rightBlockX, yRight);
        yRight += 14;
      }
      if (invoice.clientEmail) { doc.text(invoice.clientEmail, rightBlockX, yRight, { width: rightBlockW }); yRight += 14; }

      y = Math.max(yLeft, yRight) + 20;

      // ── DATES ──
      doc.rect(leftX, y, pageWidth, 36).fill(COLOR_BG_SOFT).stroke(COLOR_BORDER);
      doc.fillColor(COLOR_GREEN).font("Helvetica-Bold").fontSize(9);
      doc.text("DATE D'ÉMISSION", leftX + 16, y + 8);
      doc.text("ÉCHÉANCE", leftX + pageWidth / 3 + 16, y + 8);
      doc.text("STATUT", leftX + (pageWidth * 2) / 3 + 16, y + 8);
      doc.fillColor(COLOR_TEXT).font("Helvetica").fontSize(11);
      doc.text(formatDateFR(invoice.issueDate), leftX + 16, y + 20);
      doc.text(invoice.dueDate ? formatDateFR(invoice.dueDate) : "À réception", leftX + pageWidth / 3 + 16, y + 20);
      doc.text(invoiceStatusLabel(invoice.status), leftX + (pageWidth * 2) / 3 + 16, y + 20);
      y += 56;

      // ── TABLE DES LIGNES ──
      const colDescX = leftX;
      const colQtyX = leftX + pageWidth - 280;
      const colUnitX = leftX + pageWidth - 200;
      const colTotalX = leftX + pageWidth - 100;

      // Header table
      doc.rect(leftX, y, pageWidth, 28).fill(COLOR_GREEN);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
      doc.text("Description", colDescX + 12, y + 9);
      doc.text("Qté", colQtyX, y + 9, { width: 40, align: "center" });
      doc.text("Prix unit. HT", colUnitX, y + 9, { width: 80, align: "right" });
      doc.text("Total HT", colTotalX, y + 9, { width: 90, align: "right" });
      y += 28;

      // Lignes
      doc.fillColor(COLOR_TEXT).font("Helvetica").fontSize(10);
      for (const it of items) {
        const lineHeight = Math.max(
          22,
          doc.heightOfString(it.description, { width: colQtyX - colDescX - 24 }) + 8,
        );
        // alterner background
        if ((items.indexOf(it) % 2) === 1) {
          doc.rect(leftX, y, pageWidth, lineHeight).fill(COLOR_BG_SOFT);
          doc.fillColor(COLOR_TEXT);
        }
        doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
        doc.text(it.description, colDescX + 12, y + 6, { width: colQtyX - colDescX - 24 });
        doc.text(String(it.quantity), colQtyX, y + 6, { width: 40, align: "center" });
        doc.text(formatPriceCents(it.unitPriceCents), colUnitX, y + 6, { width: 80, align: "right" });
        doc.text(formatPriceCents(it.totalCents), colTotalX, y + 6, { width: 90, align: "right" });
        y += lineHeight;

        // Saut de page si on s'approche du bas
        if (y > doc.page.height - 200) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      }

      // ── TOTAUX (bloc droit) ──
      y += 16;
      const totBoxX = leftX + pageWidth - 240;
      const totBoxW = 240;
      doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);

      const drawTotalRow = (label: string, value: string, bold = false, big = false) => {
        if (bold) doc.font("Helvetica-Bold"); else doc.font("Helvetica");
        doc.fontSize(big ? 13 : 10);
        doc.text(label, totBoxX, y, { width: 130, align: "right" });
        doc.text(value, totBoxX + 130, y, { width: 110, align: "right" });
        y += big ? 22 : 18;
      };

      drawTotalRow("Sous-total HT", formatPriceCents(invoice.subtotalCents));
      if (invoice.vatEnabled) {
        drawTotalRow(`TVA (${formatVatRate(invoice.vatRate)})`, formatPriceCents(invoice.vatCents));
      }
      // Ligne séparatrice
      doc.moveTo(totBoxX, y + 2).lineTo(totBoxX + totBoxW, y + 2).strokeColor(COLOR_GREEN).lineWidth(1).stroke();
      y += 8;
      drawTotalRow("TOTAL", formatPriceCents(invoice.totalCents), true, true);

      // ── PAIEMENT (si payé) ──
      y += 10;
      if (invoice.status === "paid") {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_GREEN);
        doc.text(
          `✓ Payée le ${formatDateFR(invoice.paidAt)}${invoice.paymentMethod ? ` — ${paymentMethodLabel(invoice.paymentMethod)}` : ""}`,
          leftX, y,
        );
        y += 18;
      }

      // ── NOTES ──
      if (invoice.notes) {
        y += 8;
        doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_GREEN).text("Notes", leftX, y);
        y += 14;
        doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT)
          .text(invoice.notes, leftX, y, { width: pageWidth });
        y += doc.heightOfString(invoice.notes, { width: pageWidth }) + 8;
      }

      // ── PIED DE PAGE : conditions + IBAN + mention légale ──
      const footerY = doc.page.height - 130;
      doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(8.5);

      let fy = footerY;
      if (snapshot.paymentTerms) {
        doc.text(snapshot.paymentTerms, leftX, fy, { width: pageWidth });
        fy += doc.heightOfString(snapshot.paymentTerms, { width: pageWidth }) + 4;
      }
      if (snapshot.iban) {
        const ibanLine = `IBAN : ${snapshot.iban}${snapshot.bic ? `   •   BIC : ${snapshot.bic}` : ""}`;
        doc.text(ibanLine, leftX, fy, { width: pageWidth });
        fy += 14;
      }

      // Mention légale (TVA non applicable ou autre)
      const legal = snapshot.legalMention
        || (!snapshot.vatEnabled ? DEFAULT_LEGAL_MENTION_NO_VAT : "");
      if (legal) {
        doc.fillColor(COLOR_GREEN_LIGHT).font("Helvetica-Oblique").fontSize(8.5);
        doc.text(legal, leftX, fy, { width: pageWidth });
      }

      // Numéro de page (toujours en bas)
      doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(8);
      doc.text(
        `Facture ${invoice.number} — page 1`,
        leftX,
        doc.page.height - doc.page.margins.bottom + 10,
        { width: pageWidth, align: "center" },
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Génère le HTML d'un email d'envoi de facture. */
export function renderInvoiceEmail(opts: {
  invoiceNumber: string;
  totalCents: number;
  practitionerName: string;
  clientFirstName?: string | null;
  notes?: string | null;
  fromEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const subject = `Facture ${opts.invoiceNumber} — ${opts.practitionerName}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; background:#f7faf9; font-family: -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1a1a1a; }
  .wrap { max-width:560px; margin:0 auto; padding:24px 16px; }
  .card { background:#fff; border-radius:12px; padding:32px 28px; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
  h1 { color:#1b4332; font-size:20px; margin:0 0 16px; }
  p { font-size:15px; line-height:1.55; margin:0 0 12px; }
  .info { background:#f7faf9; border-left:3px solid #1b4332; padding:14px 16px; border-radius:6px; margin:16px 0; font-size:14px; }
  .footer { font-size:12px; color:#6b7a76; text-align:center; margin-top:24px; }
</style></head><body>
<div class="wrap"><div class="card">
  <h1>Bonjour ${escapeHtml(opts.clientFirstName || "")},</h1>
  <p>Veuillez trouver ci-jointe la facture <strong>${escapeHtml(opts.invoiceNumber)}</strong>.</p>
  <div class="info">
    <p><strong>Montant total :</strong> ${formatPriceCents(opts.totalCents)}</p>
  </div>
  ${opts.notes ? `<p>${escapeHtml(opts.notes)}</p>` : ""}
  <p>Bien cordialement,<br>${escapeHtml(opts.practitionerName)}</p>
</div>
<div class="footer">Email automatique — Naturo Pro</div>
</div></body></html>`;
  const text = [
    `Bonjour ${opts.clientFirstName || ""},`,
    ``,
    `Veuillez trouver ci-jointe la facture ${opts.invoiceNumber}.`,
    `Montant total : ${formatPriceCents(opts.totalCents)}`,
    opts.notes ? `\n${opts.notes}` : "",
    ``,
    `Bien cordialement,`,
    opts.practitionerName,
  ].filter(Boolean).join("\n");
  return { subject, html, text };
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
