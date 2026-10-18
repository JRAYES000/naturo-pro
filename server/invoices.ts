// ─────────────────────────────────────────────────────────────────────────────
// Module facturation — calculs, génération de numéro, snapshot, PDF
// Phase 1
// ─────────────────────────────────────────────────────────────────────────────
import type { Invoice, InvoiceItem, User } from "@shared/schema-active";
import { APP_TZ } from "./timezone";
import {
  buildInvoiceDocument, facturxXmlFor, FRANCHISE_MENTION,
  type PractitionerSnapshot, type VatRegime,
} from "./einvoicing/document";
import { renderInvoicePdf } from "./einvoicing/pdf";

export type { PractitionerSnapshot } from "./einvoicing/document";

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

/** Snapshot praticienne figé dans la facture (rafraîchi à l'émission). */
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
    legalForm: a.billingLegalForm ?? null,
    vatNumber: a.billingVatNumber ?? null,
    vatRegime: (a.billingVatRegime as VatRegime | null) ?? null,
    vatOnDebits: !!a.billingVatOnDebits,
    rcs: a.billingRcs ?? null,
    shareCapital: a.billingShareCapital ?? null,
    mediatorName: a.billingMediatorName ?? null,
    mediatorUrl: a.billingMediatorUrl ?? null,
  };
}

/** Mention légale par défaut pour praticienne non assujettie à la TVA (micro-BNC). */
export const DEFAULT_LEGAL_MENTION_NO_VAT = `${FRANCHISE_MENTION}.`;

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
    timeZone: APP_TZ,
  });
}

/**
 * Année locale à partir d'une date ms.
 * Détermine le millésime du numéro de facture : une facture émise le 31 décembre
 * à 23h30 heure de Paris doit porter l'année qui s'achève, pas la suivante.
 */
export function getYearFromMs(ms: number, tz = APP_TZ): number {
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
export function invoiceNumberPrefix(year: number): string {
  return `FACT-${year}-`;
}

export function buildInvoiceNumber(year: number, value: number): string {
  return `${invoiceNumberPrefix(year)}${String(value).padStart(4, "0")}`;
}

/**
 * Numérotation des devis (Lot 4) : séquence indépendante DEVIS-YYYY-XXX,
 * volontairement hors du préfixe FACT- pour ne jamais polluer la séquence
 * légale des factures (nextInvoiceCounter scanne par préfixe).
 */
export function devisNumberPrefix(year: number): string {
  return `DEVIS-${year}-`;
}

export function buildDevisNumber(year: number, value: number): string {
  return `${devisNumberPrefix(year)}${String(value).padStart(3, "0")}`;
}

/** Prochain numéro de devis déduit des numéros existants (max + 1). */
export function nextDevisSeq(existingNumbers: string[], year: number): number {
  const prefix = devisNumberPrefix(year);
  let max = 0;
  for (const n of existingNumbers) {
    if (!n.startsWith(prefix)) continue;
    const v = Number(n.slice(prefix.length));
    if (Number.isInteger(v) && v > max) max = v;
  }
  return max + 1;
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

/**
 * PDF d'une facture, d'un avoir ou d'un devis (PDF/A-3b, voir einvoicing/pdf.ts).
 * Utilise le snapshot praticienne stocké (figé), pas le user actuel. Une facture ou
 * un avoir ÉMIS embarque son XML Factur-X EN 16931 ; un brouillon ou un devis non.
 */
export async function generateInvoicePdf(
  invoice: Invoice,
  items: InvoiceItem[],
  snapshot: PractitionerSnapshot,
  credited?: Pick<Invoice, "number" | "issueDate"> | null,
): Promise<Buffer> {
  const doc = buildInvoiceDocument(invoice, items, snapshot, credited);
  const facturxXml = doc.kind !== "quote" && !doc.draft ? facturxXmlFor(doc) : null;
  return renderInvoicePdf(doc, { facturxXml });
}

/** XML Factur-X (CII EN 16931) d'une facture ou d'un avoir émis. */
export function generateFacturxXml(
  invoice: Invoice,
  items: InvoiceItem[],
  snapshot: PractitionerSnapshot,
  credited?: Pick<Invoice, "number" | "issueDate"> | null,
): string {
  return facturxXmlFor(buildInvoiceDocument(invoice, items, snapshot, credited));
}

/** Génère le HTML d'un email d'envoi de facture. */
export function renderInvoiceEmail(opts: {
  invoiceNumber: string;
  totalCents: number;
  practitionerName: string;
  clientFirstName?: string | null;
  notes?: string | null;
  fromEmail?: string | null;
  isDevis?: boolean;
  isAvoir?: boolean;
  /** Lot 2b — lien public : accepter le devis ou régler la facture en ligne. */
  actionUrl?: string | null;
  actionLabel?: string | null;
}): { subject: string; html: string; text: string } {
  const docLabel = opts.isDevis ? "Devis" : opts.isAvoir ? "Avoir" : "Facture";
  const article = opts.isDevis ? "le devis" : opts.isAvoir ? "l'avoir" : "la facture";
  const subject = `${docLabel} ${opts.invoiceNumber} — ${opts.practitionerName}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; background:#f7faf9; font-family: -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1a1a1a; }
  .wrap { max-width:560px; margin:0 auto; padding:24px 16px; }
  .card { background:#fff; border-radius:12px; padding:32px 28px; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
  h1 { color:#1b4332; font-size:20px; margin:0 0 16px; }
  p { font-size:15px; line-height:1.55; margin:0 0 12px; }
  .info { background:#f7faf9; border-left:3px solid #1b4332; padding:14px 16px; border-radius:6px; margin:16px 0; font-size:14px; }
  .footer { font-size:12px; color:#6b7a76; text-align:center; margin-top:24px; }
  .btn { display:inline-block; background:#186749; color:#fff !important; text-decoration:none; font-weight:700; padding:12px 20px; border-radius:10px; }
</style></head><body>
<div class="wrap"><div class="card">
  <h1>Bonjour ${escapeHtml(opts.clientFirstName || "")},</h1>
  <p>Veuillez trouver ci-joint ${article} <strong>${escapeHtml(opts.invoiceNumber)}</strong>.</p>
  <div class="info">
    <p><strong>Montant total :</strong> ${formatPriceCents(Math.abs(opts.totalCents))}</p>
  </div>
  ${opts.actionUrl ? `<p style="margin:20px 0"><a class="btn" href="${escapeHtml(opts.actionUrl)}">${escapeHtml(opts.actionLabel || "Voir le document")}</a></p>` : ""}
  ${opts.notes ? `<p>${escapeHtml(opts.notes)}</p>` : ""}
  <p>Bien cordialement,<br>${escapeHtml(opts.practitionerName)}</p>
</div>
<div class="footer">Email automatique — Naturo Pro</div>
</div></body></html>`;
  const text = [
    `Bonjour ${opts.clientFirstName || ""},`,
    ``,
    `Veuillez trouver ci-joint ${article} ${opts.invoiceNumber}.`,
    `Montant total : ${formatPriceCents(Math.abs(opts.totalCents))}`,
    opts.actionUrl ? `\n${opts.actionLabel || "Voir le document"} : ${opts.actionUrl}` : "",
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
