// ─────────────────────────────────────────────────────────────────────────────
// Rendu PDF des factures, avoirs et devis.
//
// PDF/A-3b (archivage), polices Noto Sans incorporées, mentions obligatoires de la
// réforme 2026. Une facture ou un avoir émis embarque son XML Factur-X
// (factur-x.xml, relation « Data ») : le fichier est alors un Factur-X EN 16931.
// ─────────────────────────────────────────────────────────────────────────────
import PDFDocument from "pdfkit";
import { invoiceFonts } from "./fonts";
import {
  B2B_NOTES, FRANCHISE_MENTION, isProfessionalBuyer, sellerDisplayName,
  type InvoiceDocument,
} from "./document";
import { formatSiren } from "./identifiers";

const GREEN = "#1b4332";
const BG_SOFT = "#f7faf9";
const BORDER = "#d6e0dc";
const TEXT = "#1a1a1a";
const MUTED = "#6b7a76";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "espèces", check: "chèque", transfer: "virement", card: "carte bancaire",
};
const CATEGORY_LABELS: Record<string, string> = {
  services: "Prestation de services",
  goods: "Livraison de biens",
  mixed: "Prestation de services et livraison de biens",
};

/** « 1 234,50 € » — espace fine insécable absente de la police : espace insécable simple. */
export function euroText(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${cents < 0 ? "-" : ""}${euros},${String(abs % 100).padStart(2, "0")} €`;
}

export function dateText(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris",
  });
}

function rateText(p: number): string {
  return `${String(Math.round(p * 100) / 100).replace(".", ",")} %`;
}

/** Retire ce que le XMP de pdfkit n'échappe pas (titre, auteur). */
function xmpSafe(s: string): string {
  return s.replace(/&/g, " et ").replace(/[<>"]/g, " ").replace(/\s+/g, " ").trim();
}

const FACTURX_XMP = (level: string) => `
        <rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">
          <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property><rdf:Seq>
              <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description></rdf:li>
              <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The type of the hybrid document in capital letters, e.g. INVOICE or ORDER</pdfaProperty:description></rdf:li>
              <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description></rdf:li>
              <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description></rdf:li>
            </rdf:Seq></pdfaSchema:property>
          </rdf:li></rdf:Bag></pdfaExtension:schemas>
        </rdf:Description>
        <rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about="">
          <fx:DocumentType>INVOICE</fx:DocumentType>
          <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
          <fx:Version>1.0</fx:Version>
          <fx:ConformanceLevel>${level}</fx:ConformanceLevel>
        </rdf:Description>`;

export interface RenderOptions {
  /** XML CII à joindre : le PDF devient un Factur-X. */
  facturxXml?: string | null;
  /** Date de création du fichier (tests : rendu reproductible). */
  createdAt?: Date;
}

export function renderInvoicePdf(d: InvoiceDocument, opts: RenderOptions = {}): Promise<Buffer> {
  const fonts = invoiceFonts();
  const title = d.kind === "quote" ? "DEVIS" : d.kind === "credit_note" ? "AVOIR" : "FACTURE";
  const label = d.kind === "quote" ? "Devis" : d.kind === "credit_note" ? "Avoir" : "Facture";
  const created = opts.createdAt || new Date();
  const s = d.seller;
  const b = d.buyer;
  const pro = isProfessionalBuyer(b.kind);
  const withVat = d.vatRegime !== "franchise";

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        pdfVersion: "1.7",
        subset: "PDF/A-3b",
        lang: "fr-FR",
        font: fonts.regular as any,
        bufferPages: true,
        info: {
          Title: xmpSafe(`${label} ${d.draft ? "brouillon" : d.number}`),
          Author: xmpSafe(sellerDisplayName(s) || "Naturo Pro"),
          Subject: xmpSafe(`${label} ${d.draft ? "brouillon" : d.number}`),
          Creator: "Naturo Pro",
          Producer: "Naturo Pro",
          CreationDate: created,
        },
      } as any);
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.registerFont("R", fonts.regular);
      doc.registerFont("B", fonts.bold);
      doc.registerFont("I", fonts.italic);

      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;

      // ── Bandeau
      doc.rect(0, 0, doc.page.width, 90).fill(GREEN);
      let logoDrawn = false;
      if (s.logoBase64) {
        try {
          const buf = Buffer.from(s.logoBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
          doc.image(buf, left, 18, { fit: [120, 54] });
          logoDrawn = true;
        } catch { /* logo illisible : nom à la place */ }
      }
      if (!logoDrawn) {
        doc.fillColor("#ffffff").font("B").fontSize(17)
          .text(s.tradeName || sellerDisplayName(s), left, 34, { width: 300, lineBreak: false, ellipsis: true });
      }
      doc.fillColor("#ffffff").font("B").fontSize(26).text(title, left, 22, { width, align: "right" });
      doc.font("R").fontSize(11).text(d.draft ? "Brouillon — sans valeur" : `N° ${d.number}`, left, 60, { width, align: "right" });

      // ── Émettrice / client
      let y = 110;
      const colW = width / 2 - 12;
      const rightX = left + width / 2 + 12;
      const block = (x: number, heading: string, rows: Array<[string, boolean?]>) => {
        doc.font("B").fontSize(8.5).fillColor(GREEN).text(heading, x, y);
        let yy = y + 14;
        for (const [t, strong] of rows) {
          if (!t) continue;
          doc.font(strong ? "B" : "R").fontSize(strong ? 10.5 : 9).fillColor(TEXT);
          doc.text(t, x, yy, { width: colW });
          yy += doc.heightOfString(t, { width: colW }) + 1.5;
        }
        return yy;
      };
      const sellerRows: Array<[string, boolean?]> = [];
      if (s.tradeName) sellerRows.push([s.tradeName, true]);
      sellerRows.push([sellerDisplayName(s), !s.tradeName]);
      if (s.legalForm && !["EI", "AUTRE"].includes(s.legalForm)) sellerRows.push([s.legalForm === "ASSOCIATION" ? "Association" : s.legalForm]);
      sellerRows.push(
        [s.address || ""],
        [`${s.postalCode || ""} ${s.city || ""}`.trim()],
        [s.country && s.country !== "France" ? s.country : ""],
        [s.email || ""],
        [s.phone || ""],
        [s.siret ? `SIRET : ${formatSiren(s.siret)}` : s.siren ? `SIREN : ${formatSiren(s.siren)}` : ""],
        [s.rcs || ""],
        [s.shareCapital ? `Capital social : ${s.shareCapital}` : ""],
        [s.vatNumber ? `N° TVA intracommunautaire : ${s.vatNumber}` : ""],
      );
      const yL = block(left, d.kind === "quote" ? "PRESTATAIRE" : "ÉMETTEUR", sellerRows);
      const yR = block(rightX, d.kind === "quote" ? "DESTINATAIRE" : "CLIENT", [
        [b.name || "—", true],
        [b.address || ""],
        [`${b.postalCode || ""} ${b.city || ""}`.trim()],
        [b.country && b.country !== "France" ? b.country : ""],
        [b.email || ""],
        [pro && b.siren ? `SIREN : ${formatSiren(b.siren)}` : ""],
        [pro && b.vatNumber ? `N° TVA : ${b.vatNumber}` : ""],
      ]);
      y = Math.max(yL, yR) + 12;

      // ── Dates
      const cells: Array<[string, string]> = [["DATE D'ÉMISSION", d.draft ? "À l'émission" : dateText(d.issueDate)]];
      if (d.kind !== "quote") cells.push(["DATE DE LA PRESTATION", dateText(d.serviceDate || d.issueDate)]);
      if (d.kind === "quote") cells.push(["VALABLE JUSQU'AU", d.dueDate ? dateText(d.dueDate) : "—"]);
      else if (d.kind === "invoice") cells.push(["ÉCHÉANCE", d.dueDate ? dateText(d.dueDate) : "À réception"]);
      const cw = width / cells.length;
      doc.rect(left, y, width, 38).fillAndStroke(BG_SOFT, BORDER);
      cells.forEach(([k, v], i) => {
        doc.fillColor(GREEN).font("B").fontSize(7.5).text(k, left + i * cw + 12, y + 8, { width: cw - 16 });
        doc.fillColor(TEXT).font("R").fontSize(10).text(v, left + i * cw + 12, y + 20, { width: cw - 16 });
      });
      y += 46;
      doc.fillColor(MUTED).font("R").fontSize(8.5).text(`Nature de l'opération : ${CATEGORY_LABELS[d.category]}`, left, y, { width });
      y += 13;
      if (d.credited) {
        doc.fillColor(TEXT).font("B").fontSize(9.5).text(`Avoir sur la facture n° ${d.credited.number} du ${dateText(d.credited.issueDate)}`, left, y, { width });
        y += 15;
      }
      y += 4;

      // ── Lignes
      const cQty = left + width - 270;
      const cUnit = left + width - 205;
      const cTot = left + width - 100;
      const descW = cQty - left - 20;
      const header = () => {
        doc.rect(left, y, width, 22).fill(GREEN);
        doc.fillColor("#ffffff").font("B").fontSize(8.5);
        doc.text("Désignation", left + 10, y + 7, { width: descW });
        doc.text("Qté", cQty, y + 7, { width: 50, align: "center" });
        doc.text(withVat ? "Prix unit. HT" : "Prix unitaire", cUnit, y + 7, { width: 95, align: "right" });
        doc.text(withVat ? "Total HT" : "Total", cTot, y + 7, { width: 90, align: "right" });
        y += 22;
      };
      header();
      d.lines.forEach((it, i) => {
        const desc = it.kind === "goods" ? `${it.description} (produit)` : it.description;
        doc.font("R").fontSize(9.5);
        const h = Math.max(20, doc.heightOfString(desc, { width: descW }) + 9);
        if (y + h > doc.page.height - 170) {
          doc.addPage();
          y = doc.page.margins.top;
          header();
        }
        if (i % 2 === 1) doc.rect(left, y, width, h).fill(BG_SOFT);
        doc.fillColor(TEXT).font("R").fontSize(9.5);
        doc.text(desc, left + 10, y + 5, { width: descW });
        doc.text(String(it.quantity), cQty, y + 5, { width: 50, align: "center" });
        doc.text(euroText(it.unitPriceCents), cUnit, y + 5, { width: 95, align: "right" });
        doc.text(euroText(it.totalCents), cTot, y + 5, { width: 90, align: "right" });
        y += h;
      });
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor(BORDER).lineWidth(1).stroke();

      // ── Totaux
      y += 10;
      const tx = left + width - 260;
      const row = (k: string, v: string, strong = false) => {
        doc.font(strong ? "B" : "R").fontSize(strong ? 11.5 : 9.5).fillColor(strong ? GREEN : TEXT);
        doc.text(k, tx, y, { width: 160, align: "right" });
        doc.text(v, tx + 160, y, { width: 100, align: "right" });
        y += strong ? 19 : 15;
      };
      if (withVat) {
        row("Total HT", euroText(d.subtotalCents));
        row(`TVA ${rateText(d.vatRatePercent)}`, euroText(d.vatCents));
        row(d.kind === "credit_note" ? "Total TTC de l'avoir" : "Total TTC", euroText(d.totalCents), true);
      } else {
        row(d.kind === "credit_note" ? "Total de l'avoir" : "Total", euroText(d.totalCents), true);
      }

      // ── Règlement et notes
      y += 6;
      if (d.paid && d.kind === "invoice") {
        const how = d.paid.method ? ` par ${PAYMENT_LABELS[d.paid.method] || d.paid.method}` : "";
        doc.font("B").fontSize(9.5).fillColor(GREEN).text(`Facture acquittée le ${dateText(d.paid.at)}${how}.`, left, y, { width });
        y += 16;
      }
      if (d.notes) {
        doc.font("B").fontSize(8.5).fillColor(GREEN).text("Notes", left, y);
        y += 12;
        doc.font("R").fontSize(9).fillColor(TEXT).text(d.notes, left, y, { width });
        y += doc.heightOfString(d.notes, { width }) + 6;
      }

      // ── Pied : conditions et mentions légales (dernière page)
      const legal: string[] = [];
      if (d.paymentTerms) legal.push(d.paymentTerms);
      if (s.iban && d.kind === "invoice") legal.push(`IBAN : ${s.iban}${s.bic ? `  ·  BIC : ${s.bic}` : ""}`);
      if (pro && d.kind === "invoice") legal.push(`${B2B_NOTES.PMD} ${B2B_NOTES.PMT} ${B2B_NOTES.AAB}`);
      if (withVat && d.vatOnDebits) legal.push("Option pour le paiement de la taxe d'après les débits.");
      if (!pro && s.mediatorName && d.kind !== "credit_note") {
        legal.push(`Médiateur de la consommation : ${s.mediatorName}${s.mediatorUrl ? ` (${s.mediatorUrl})` : ""}.`);
      }
      if (d.legalMention) legal.push(d.legalMention);
      else if (!withVat) legal.push(`${FRANCHISE_MENTION}.`);
      const footer = legal.filter(Boolean).join("\n");
      doc.font("R").fontSize(7.8);
      const fh = doc.heightOfString(footer, { width });
      const footerY = doc.page.height - doc.page.margins.bottom - fh - 6;
      if (y > footerY - 8) doc.addPage();
      doc.fillColor(MUTED).font("R").fontSize(7.8).text(footer, left, doc.page.height - doc.page.margins.bottom - fh - 6, { width });

      // ── Numérotation des pages (dans la marge basse, sans créer de page)
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc.font("R").fontSize(7).fillColor(MUTED).text(
          `${label} ${d.draft ? "(brouillon)" : d.number} · page ${i + 1}/${range.count}${opts.facturxXml ? " · Factur-X EN 16931" : ""}`,
          left, doc.page.height - 30, { width, align: "center", lineBreak: false },
        );
      }

      if (opts.facturxXml) {
        doc.file(Buffer.from(opts.facturxXml, "utf8"), {
          name: "factur-x.xml",
          type: "text/xml",
          relationship: "Data",
          description: "Factur-X",
          creationDate: created,
          modifiedDate: created,
        } as any);
        (doc as any).appendXML(FACTURX_XMP("EN 16931"));
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
