import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoiceDocument, documentToFacturx, facturxXmlFor, documentKind, categoryFromKinds,
  signedTotalCents, effectiveVatRegime, sellerDisplayName, type PractitionerSnapshot,
} from "./document";
import { xmlAmount, xmlDate, xmlEscape } from "./facturx-xml";
import { checkInvoice, isPortableInvoiceNumber } from "./compliance";
import { renderInvoicePdf } from "./pdf";

const snapshot: PractitionerSnapshot = {
  name: "Marie Dupont", email: "marie@exemple.fr", phone: "0612345678",
  companyName: "Cabinet Équilibre", siret: "552 032 534 00703",
  address: "1 rue de la Paix", postalCode: "69001", city: "Lyon", country: "France",
  iban: "FR76 3000 6000 0112 3456 7890 189", bic: "AGRIFRPP",
  vatEnabled: false, vatRate: 2000, legalForm: "EI", mediatorName: "CM2C", mediatorUrl: "cm2c.net",
};

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 7, userId: 1, number: "FACT-2026-0007", docType: "invoice", status: "issued",
  issueDate: Date.UTC(2026, 9, 18, 10), dueDate: null, serviceDate: Date.UTC(2026, 9, 15, 10),
  appointmentId: null, clientId: null, clientFirstName: "Julie", clientLastName: "Martin",
  clientEmail: "julie@exemple.fr", clientAddress: "3 rue Y", clientPostalCode: "69002", clientCity: "Lyon",
  clientCountry: null, clientType: "particulier", clientCompanyName: null, clientSiren: null,
  clientSiret: null, clientVatNumber: null, subtotalCents: 7000, vatCents: 0, totalCents: 7000,
  vatRate: 2000, vatEnabled: false, paymentMethod: null, paidAt: null, sentAt: null, notes: null,
  practitionerSnapshot: "{}", operationCategory: null, creditedInvoiceId: null, issuedAt: null,
  createdAt: 0, updatedAt: 0, ...over,
}) as any;
const items = [{ id: 1, invoiceId: 7, position: 0, description: "Bilan de vitalité", quantity: 1, unitPriceCents: 7000, totalCents: 7000, kind: "service" }] as any;

test("formats XML : montants, dates, échappement", () => {
  assert.equal(xmlAmount(30000), "300.00");
  assert.equal(xmlAmount(5), "0.05");
  assert.equal(xmlAmount(-1234), "-12.34");
  assert.equal(xmlDate(new Date("2026-12-31T23:30:00Z")), "20270101"); // minuit passé à Paris
  assert.equal(xmlEscape(`Bien-être & Co <SAS> "x"`), "Bien-être &amp; Co &lt;SAS&gt; &quot;x&quot;");
});

test("nature, catégorie, montant signé, régime", () => {
  assert.equal(documentKind({ docType: "devis", totalCents: 1 } as any), "quote");
  assert.equal(documentKind({ docType: "avoir", totalCents: 1 } as any), "credit_note");
  assert.equal(documentKind({ docType: "invoice", totalCents: -100 } as any), "credit_note"); // ancien avoir négatif
  assert.equal(categoryFromKinds(["service", "service"]), "services");
  assert.equal(categoryFromKinds(["goods"]), "goods");
  assert.equal(categoryFromKinds(["service", "goods"]), "mixed");
  assert.equal(signedTotalCents({ docType: "avoir", totalCents: 5000 } as any), -5000);
  assert.equal(signedTotalCents({ docType: "invoice", totalCents: 5000 } as any), 5000);
  assert.equal(effectiveVatRegime({ vatEnabled: false }), "franchise");
  assert.equal(effectiveVatRegime({ vatEnabled: true }), "simplifie");
  assert.equal(effectiveVatRegime({ vatRegime: "normal_mensuel", vatEnabled: true }), "normal_mensuel");
});

test("EI : nom de l'entrepreneuse suivi de « EI », nom commercial en plus", () => {
  const d = buildInvoiceDocument(invoice(), items, snapshot);
  assert.equal(d.seller.name, "Marie Dupont");
  assert.equal(d.seller.tradeName, "Cabinet Équilibre");
  assert.equal(sellerDisplayName(d.seller), "Marie Dupont EI");
  assert.equal(d.seller.siren, "552032534");
  assert.equal(d.seller.siret, "55203253400703");
});

test("franchise B2C : catégorie E, VATEX-FR-FRANCHISE, SIREN en BT-32, pas de notes B2B", () => {
  const fx = documentToFacturx(buildInvoiceDocument(invoice(), items, snapshot));
  assert.equal(fx.typeCode, "380");
  assert.equal(fx.billingFramework, "S1");
  assert.equal(fx.businessType, "B2C");
  assert.equal(fx.vatBreakdown[0].category, "E");
  assert.equal(fx.vatBreakdown[0].exemptionReasonCode, "VATEX-FR-FRANCHISE");
  assert.equal(fx.seller.taxRegistrationId, "552032534");
  assert.equal(fx.seller.electronicAddress?.scheme, "0225");
  assert.equal(fx.buyer.electronicAddress, null);
  assert.equal(fx.notes.length, 0);
  assert.equal(fx.paymentMeansCode, "58");
  const xml = facturxXmlFor(buildInvoiceDocument(invoice(), items, snapshot));
  assert.match(xml, /<ram:TradingBusinessName>Cabinet Équilibre<\/ram:TradingBusinessName>/);
  assert.match(xml, /<ram:Name>Marie Dupont EI<\/ram:Name>/);
  assert.match(xml, /<ram:ActualDeliverySupplyChainEvent>/);
});

test("TVA B2B : catégorie S, n° de TVA vendeur, SIREN acheteur, notes PMD/PMT/AAB", () => {
  const d = buildInvoiceDocument(
    invoice({
      vatEnabled: true, vatRate: 2000, subtotalCents: 7000, vatCents: 1400, totalCents: 8400,
      clientType: "entreprise", clientCompanyName: "Bien-être & Co", clientSiren: "552032534", clientVatNumber: "FR27552032534",
    }),
    items,
    { ...snapshot, vatEnabled: true, vatRegime: "normal_trimestriel", vatNumber: "FR27552032534", legalForm: "SASU", companyName: "Équilibre SAS" },
  );
  const fx = documentToFacturx(d);
  assert.equal(fx.businessType, "B2B");
  assert.equal(fx.vatBreakdown[0].category, "S");
  assert.equal(fx.vatBreakdown[0].taxCents, 1400);
  assert.equal(fx.seller.vatNumber, "FR27552032534");
  assert.equal(fx.seller.taxRegistrationId, null);
  assert.equal(fx.buyer.siren, "552032534");
  assert.deepEqual(fx.buyer.electronicAddress, { value: "552032534", scheme: "0225" });
  assert.deepEqual(fx.notes.map((n) => n.subjectCode), ["PMD", "PMT", "AAB"]);
  assert.equal(d.seller.name, "Équilibre SAS"); // société : raison sociale
});

test("avoir : type 381, montants positifs, référence à la facture d'origine", () => {
  const d = buildInvoiceDocument(
    invoice({ docType: "avoir", number: "FACT-2026-0008", creditedInvoiceId: 7 }),
    items,
    snapshot,
    { number: "FACT-2026-0007", issueDate: Date.UTC(2026, 9, 18) },
  );
  const fx = documentToFacturx(d);
  assert.equal(fx.typeCode, "381");
  assert.equal(fx.grandTotalCents, 7000);
  assert.deepEqual(fx.precedingInvoice?.number, "FACT-2026-0007");
  assert.match(facturxXmlFor(d), /<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>FACT-2026-0007/);
});

test("conformité : manques signalés au bon niveau", () => {
  const bare: PractitionerSnapshot = { name: "X", vatEnabled: true, vatRate: 1900 };
  const d = buildInvoiceDocument(invoice({ clientType: "entreprise", clientCompanyName: "SAS", clientAddress: null }), items, bare);
  const codes = Object.fromEntries(checkInvoice(d, bare).map((i) => [i.code, i.level]));
  assert.equal(codes.SELLER_SIRET, "erreur");
  assert.equal(codes.SELLER_ADDRESS, "erreur");
  assert.equal(codes.SELLER_VAT_NUMBER, "erreur");
  assert.equal(codes.VAT_RATE, "erreur");
  assert.equal(codes.BUYER_ADDRESS, "erreur");
  assert.equal(codes.BUYER_SIREN, "attention");
  const ok = checkInvoice(buildInvoiceDocument(invoice(), items, snapshot), snapshot);
  assert.deepEqual(ok, []);
  const avoirSansRef = buildInvoiceDocument(invoice({ docType: "avoir" }), items, snapshot);
  assert.ok(checkInvoice(avoirSansRef).some((i) => i.code === "CREDIT_REF"));
  assert.equal(isPortableInvoiceNumber("FACT-2026-0001"), true);
  assert.equal(isPortableInvoiceNumber("FACT 2026"), false);
});

test("PDF : PDF/A-3b, police incorporée, Factur-X joint seulement si émis", async () => {
  const issued = buildInvoiceDocument(invoice(), items, snapshot);
  const pdf = await renderInvoicePdf(issued, { facturxXml: facturxXmlFor(issued) });
  const raw = pdf.toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.7"));
  assert.match(raw, /<pdfaid:part>3<\/pdfaid:part>/);
  assert.match(raw, /<fx:ConformanceLevel>EN 16931<\/fx:ConformanceLevel>/);
  assert.match(raw, /\/AFRelationship \/Data/);
  assert.match(raw, /factur-x\.xml/);
  assert.match(raw, /\/FontFile2/);
  assert.doesNotMatch(raw, /\/BaseFont \/Helvetica/);

  const draft = buildInvoiceDocument(invoice({ status: "draft", number: "BROUILLON-X" }), items, snapshot);
  const draftPdf = (await renderInvoicePdf(draft)).toString("latin1");
  assert.doesNotMatch(draftPdf, /factur-x\.xml/);
  assert.match(draftPdf, /<pdfaid:part>3<\/pdfaid:part>/);
});
