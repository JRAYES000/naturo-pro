/**
 * script/facturx-samples.ts — génère des Factur-X d'exemple avec le VRAI code de
 * l'application (server/einvoicing), pour les faire valider par
 * script/facturx-validate.py (XSD + schématrons officiels). Lancé par la CI.
 *
 * Usage : tsx script/facturx-samples.ts <dossier de sortie>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildInvoiceDocument, facturxXmlFor, type PractitionerSnapshot } from "../server/einvoicing/document";
import { renderInvoicePdf } from "../server/einvoicing/pdf";

const out = process.argv[2] || "facturx-samples";
mkdirSync(out, { recursive: true });

const franchise: PractitionerSnapshot = {
  name: "Marie Dupont", email: "marie@exemple.fr", phone: "06 12 34 56 78", companyName: "Cabinet Équilibre",
  siret: "55203253400703", address: "1 rue de la Paix", postalCode: "69001", city: "Lyon", country: "France",
  iban: "FR76 3000 6000 0112 3456 7890 189", bic: "AGRIFRPP", vatEnabled: false, vatRate: 2000,
  legalForm: "EI", mediatorName: "CM2C", mediatorUrl: "https://www.cm2c.net", paymentTerms: "Paiement à 30 jours par virement.",
};
const assujettie: PractitionerSnapshot = {
  ...franchise, companyName: "Équilibre & Santé SAS", legalForm: "SASU", vatEnabled: true, vatRate: 2000,
  vatRegime: "normal_trimestriel", vatNumber: "FR27552032534", rcs: "RCS Lyon 552 032 534", shareCapital: "1 000 €",
};

const base = {
  id: 1, userId: 1, docType: "invoice", status: "issued", dueDate: Date.UTC(2026, 10, 17, 10),
  issueDate: Date.UTC(2026, 9, 18, 10), serviceDate: Date.UTC(2026, 9, 15, 10), appointmentId: null, clientId: null,
  clientFirstName: "Paul", clientLastName: "Durand", clientEmail: "compta@client.fr", clientAddress: "10 avenue des Lilas",
  clientPostalCode: "75008", clientCity: "Paris", clientCountry: null, clientType: "entreprise",
  clientCompanyName: "Bien-être & Co <SAS>", clientSiren: "552032534", clientSiret: null, clientVatNumber: "FR27552032534",
  vatRate: 2000, vatEnabled: false, paymentMethod: null, paidAt: null, sentAt: null, notes: null,
  practitionerSnapshot: "{}", operationCategory: null, creditedInvoiceId: null, issuedAt: null, createdAt: 0, updatedAt: 0,
};
const lines = (rows: Array<[string, number, number, string?]>) =>
  rows.map(([description, quantity, unit, kind], i) => ({
    id: i + 1, invoiceId: 1, position: i, description, quantity, unitPriceCents: unit, totalCents: quantity * unit, kind: kind || "service",
  }));

const samples: Array<{ name: string; b2b: boolean; inv: any; items: any[]; snap: PractitionerSnapshot; credited?: any }> = [
  {
    name: "franchise-b2b", b2b: true, snap: franchise,
    inv: { ...base, number: "FACT-2026-0001", subtotalCents: 36000, vatCents: 0, totalCents: 36000 },
    items: lines([["Atelier gestion du stress (2 h)", 1, 30000], ["Livret pédagogique", 12, 500, "goods"]]),
  },
  {
    name: "tva-b2b", b2b: true, snap: assujettie,
    inv: { ...base, number: "FACT-2026-0002", vatEnabled: true, subtotalCents: 19000, vatCents: 3800, totalCents: 22800 },
    items: lines([["Bilan de vitalité", 2, 7000], ["Séance de suivi", 1, 5000]]),
  },
  {
    name: "avoir-b2b", b2b: true, snap: franchise,
    inv: { ...base, docType: "avoir", number: "FACT-2026-0003", creditedInvoiceId: 1, subtotalCents: 30000, vatCents: 0, totalCents: 30000 },
    items: lines([["Atelier gestion du stress (2 h)", 1, 30000]]),
    credited: { number: "FACT-2026-0001", issueDate: Date.UTC(2026, 9, 18, 10) },
  },
  {
    name: "franchise-b2c-payee", b2b: false, snap: franchise,
    inv: {
      // Sans date de prestation : la date d'émission en tient lieu (pas de bloc vide).
      ...base, number: "FACT-2026-0004", status: "paid", paidAt: Date.UTC(2026, 9, 15, 11), paymentMethod: "card", dueDate: null, serviceDate: null,
      clientType: "particulier", clientCompanyName: null, clientSiren: null, clientVatNumber: null,
      clientFirstName: "Julie", clientLastName: "Martin", subtotalCents: 7000, vatCents: 0, totalCents: 7000,
    },
    items: lines([["Bilan de vitalité (1 h 30)", 1, 7000]]),
  },
];

const manifest: Array<{ file: string; b2b: boolean }> = [];
for (const s of samples) {
  const doc = buildInvoiceDocument(s.inv, s.items, s.snap, s.credited);
  const xml = facturxXmlFor(doc);
  const pdf = await renderInvoicePdf(doc, { facturxXml: xml, createdAt: new Date(Date.UTC(2026, 9, 18, 10)) });
  writeFileSync(join(out, `${s.name}.pdf`), pdf);
  writeFileSync(join(out, `${s.name}.xml`), xml, "utf8");
  manifest.push({ file: `${s.name}.pdf`, b2b: s.b2b });
  console.log(`écrit ${s.name}.pdf (${pdf.length} octets)`);
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
