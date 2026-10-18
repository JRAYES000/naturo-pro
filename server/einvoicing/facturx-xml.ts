// ─────────────────────────────────────────────────────────────────────────────
// Factur-X — XML CII (UN/CEFACT D16B), profil EN 16931, conforme aux règles
// françaises de la réforme (BR-FR, flux 2).
//
// Fonction pure : aucune dépendance à la base. L'adaptateur facture → XML
// vit dans document.ts. Validé hors ligne contre le XSD Factur-X 1.09, le
// schématron Factur-X EN 16931, le schématron CEN EN 16931 (1.3.17) et le
// schématron BR-FR flux 2 (voir script/facturx-validate.py).
// ─────────────────────────────────────────────────────────────────────────────

export type VatCategory = "S" | "E" | "Z" | "O" | "AE" | "K" | "G";

export interface FacturxAddress {
  line1?: string | null;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode: string; // ISO 3166-1 alpha-2
}

export interface FacturxParty {
  name: string;
  tradingName?: string | null;       // BT-28 — nom commercial (vendeur)
  siren?: string | null;             // BT-30 / BT-47 (schemeID 0002)
  siret?: string | null;             // BT-29 / BT-46 (schemeID 0009)
  vatNumber?: string | null;         // BT-31 / BT-48 (schemeID VA)
  taxRegistrationId?: string | null; // BT-32 (schemeID FC) — vendeur uniquement
  address?: FacturxAddress | null;
  electronicAddress?: { value: string; scheme: string } | null; // BT-34 / BT-49
}

export interface FacturxLine {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;  // prix net unitaire (≥ 0)
  lineTotalCents: number;  // quantité × prix
  vatCategory: VatCategory;
  vatRatePercent: number;  // 20, 5.5… ; 0 hors catégorie S
}

export interface FacturxVatBreakdown {
  category: VatCategory;
  ratePercent: number;
  basisCents: number;
  taxCents: number;
  exemptionReason?: string | null;     // BT-120
  exemptionReasonCode?: string | null; // BT-121 (code VATEX)
}

export interface FacturxInvoice {
  number: string;                    // BT-1
  typeCode: "380" | "381" | "384" | "386"; // BT-3
  issueDate: Date;                   // BT-2
  dueDate?: Date | null;             // BT-9
  deliveryDate?: Date | null;        // BT-72 — date de la prestation
  billingFramework: string;          // BT-23 — cadre de facturation (S1, B1, M1…)
  businessType?: "B2B" | "B2BINT" | "B2C" | "B2CINT" | null; // note BAR
  notes: Array<{ subjectCode?: string | null; content: string }>;
  seller: FacturxParty;
  buyer: FacturxParty;
  lines: FacturxLine[];
  vatBreakdown: FacturxVatBreakdown[];
  lineTotalCents: number;            // BT-106
  taxBasisTotalCents: number;        // BT-109
  taxTotalCents: number;             // BT-110
  grandTotalCents: number;           // BT-112
  prepaidCents: number;              // BT-113
  duePayableCents: number;           // BT-115
  paymentMeansCode?: string | null;  // BT-81 (UNTDID 4461)
  iban?: string | null;              // BT-84
  bic?: string | null;               // BT-86
  paymentTermsText?: string | null;  // BT-20
  precedingInvoice?: { number: string; issueDate: Date } | null; // BT-25 / BT-26
}

const NAMESPACES = [
  'xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
  'xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"',
  'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
  'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"',
].join(" ");

/** Échappement XML, caractères de contrôle interdits retirés. */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Centimes → montant XML « 123.45 » (point décimal, 2 décimales). */
export function xmlAmount(cents: number): string {
  const rounded = Math.round(cents);
  const abs = Math.abs(rounded);
  return `${rounded < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Taux en pourcentage : 20 → « 20 », 5.5 → « 5.5 ». */
export function xmlRate(percent: number): string {
  return String(Math.round(percent * 100) / 100);
}

/** Quantité : 4 décimales au plus (BR-FR-DEC-02). */
export function xmlQuantity(q: number): string {
  return String(Math.round(q * 10000) / 10000);
}

/** Date → AAAAMMJJ (format 102), en heure de Paris. */
export function xmlDate(d: Date, timeZone = "Europe/Paris"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

function el(tag: string, value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return `<${tag}>${xmlEscape(value)}</${tag}>`;
}

function dateEl(tag: string, d: Date | null | undefined, prefix: "udt" | "qdt" = "udt"): string {
  if (!d) return "";
  return `<${tag}><${prefix}:DateTimeString format="102">${xmlDate(d)}</${prefix}:DateTimeString></${tag}>`;
}

function partyXml(tag: "ram:SellerTradeParty" | "ram:BuyerTradeParty", p: FacturxParty): string {
  const a = p.address;
  return [
    `<${tag}>`,
    p.siret ? `<ram:GlobalID schemeID="0009">${xmlEscape(p.siret)}</ram:GlobalID>` : "",
    el("ram:Name", p.name),
    p.siren || p.tradingName
      ? `<ram:SpecifiedLegalOrganization>${p.siren ? `<ram:ID schemeID="0002">${xmlEscape(p.siren)}</ram:ID>` : ""}${el("ram:TradingBusinessName", p.tradingName)}</ram:SpecifiedLegalOrganization>`
      : "",
    a
      ? [
          "<ram:PostalTradeAddress>",
          el("ram:PostcodeCode", a.postalCode),
          el("ram:LineOne", a.line1),
          el("ram:LineTwo", a.line2),
          el("ram:CityName", a.city),
          el("ram:CountryID", a.countryCode),
          "</ram:PostalTradeAddress>",
        ].join("")
      : "",
    p.electronicAddress
      ? `<ram:URIUniversalCommunication><ram:URIID schemeID="${xmlEscape(p.electronicAddress.scheme)}">${xmlEscape(p.electronicAddress.value)}</ram:URIID></ram:URIUniversalCommunication>`
      : "",
    p.vatNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xmlEscape(p.vatNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
    p.taxRegistrationId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${xmlEscape(p.taxRegistrationId)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
    `</${tag}>`,
  ].join("");
}

function lineXml(l: FacturxLine): string {
  return [
    "<ram:IncludedSupplyChainTradeLineItem>",
    `<ram:AssociatedDocumentLineDocument><ram:LineID>${xmlEscape(l.id)}</ram:LineID></ram:AssociatedDocumentLineDocument>`,
    `<ram:SpecifiedTradeProduct>${el("ram:Name", l.name)}</ram:SpecifiedTradeProduct>`,
    `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${xmlAmount(l.unitPriceCents)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`,
    `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${xmlQuantity(l.quantity)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`,
    "<ram:SpecifiedLineTradeSettlement>",
    `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.vatCategory}</ram:CategoryCode>`,
    l.vatCategory === "O" ? "" : `<ram:RateApplicablePercent>${xmlRate(l.vatRatePercent)}</ram:RateApplicablePercent>`,
    "</ram:ApplicableTradeTax>",
    `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${xmlAmount(l.lineTotalCents)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>`,
    "</ram:SpecifiedLineTradeSettlement>",
    "</ram:IncludedSupplyChainTradeLineItem>",
  ].join("");
}

function vatXml(v: FacturxVatBreakdown): string {
  return [
    "<ram:ApplicableTradeTax>",
    `<ram:CalculatedAmount>${xmlAmount(v.taxCents)}</ram:CalculatedAmount>`,
    "<ram:TypeCode>VAT</ram:TypeCode>",
    el("ram:ExemptionReason", v.exemptionReason),
    `<ram:BasisAmount>${xmlAmount(v.basisCents)}</ram:BasisAmount>`,
    `<ram:CategoryCode>${v.category}</ram:CategoryCode>`,
    el("ram:ExemptionReasonCode", v.exemptionReasonCode),
    v.category === "O" ? "" : `<ram:RateApplicablePercent>${xmlRate(v.ratePercent)}</ram:RateApplicablePercent>`,
    "</ram:ApplicableTradeTax>",
  ].join("");
}

/** XML CII Factur-X, profil EN 16931. */
export function buildFacturxXml(inv: FacturxInvoice): string {
  const notes = [
    ...(inv.businessType ? [{ subjectCode: "BAR", content: inv.businessType }] : []),
    ...inv.notes,
  ];
  const paymentMeans = inv.paymentMeansCode
    ? [
        "<ram:SpecifiedTradeSettlementPaymentMeans>",
        `<ram:TypeCode>${xmlEscape(inv.paymentMeansCode)}</ram:TypeCode>`,
        inv.iban ? `<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xmlEscape(inv.iban.replace(/\s+/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>` : "",
        inv.iban && inv.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${xmlEscape(inv.bic.replace(/\s+/g, ""))}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : "",
        "</ram:SpecifiedTradeSettlementPaymentMeans>",
      ].join("")
    : "";
  const terms = inv.paymentTermsText || inv.dueDate
    ? `<ram:SpecifiedTradePaymentTerms>${el("ram:Description", inv.paymentTermsText)}${dateEl("ram:DueDateDateTime", inv.dueDate)}</ram:SpecifiedTradePaymentTerms>`
    : "";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rsm:CrossIndustryInvoice ${NAMESPACES}>`,
    "<rsm:ExchangedDocumentContext>",
    `<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${xmlEscape(inv.billingFramework)}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>`,
    "<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>",
    "</rsm:ExchangedDocumentContext>",
    "<rsm:ExchangedDocument>",
    el("ram:ID", inv.number),
    `<ram:TypeCode>${inv.typeCode}</ram:TypeCode>`,
    dateEl("ram:IssueDateTime", inv.issueDate),
    ...notes.map((n) => `<ram:IncludedNote>${el("ram:Content", n.content)}${el("ram:SubjectCode", n.subjectCode)}</ram:IncludedNote>`),
    "</rsm:ExchangedDocument>",
    "<rsm:SupplyChainTradeTransaction>",
    ...inv.lines.map(lineXml),
    "<ram:ApplicableHeaderTradeAgreement>",
    partyXml("ram:SellerTradeParty", inv.seller),
    partyXml("ram:BuyerTradeParty", inv.buyer),
    "</ram:ApplicableHeaderTradeAgreement>",
    "<ram:ApplicableHeaderTradeDelivery>",
    inv.deliveryDate ? `<ram:ActualDeliverySupplyChainEvent>${dateEl("ram:OccurrenceDateTime", inv.deliveryDate)}</ram:ActualDeliverySupplyChainEvent>` : "",
    "</ram:ApplicableHeaderTradeDelivery>",
    "<ram:ApplicableHeaderTradeSettlement>",
    "<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>",
    paymentMeans,
    ...inv.vatBreakdown.map(vatXml),
    terms,
    "<ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    `<ram:LineTotalAmount>${xmlAmount(inv.lineTotalCents)}</ram:LineTotalAmount>`,
    `<ram:TaxBasisTotalAmount>${xmlAmount(inv.taxBasisTotalCents)}</ram:TaxBasisTotalAmount>`,
    `<ram:TaxTotalAmount currencyID="EUR">${xmlAmount(inv.taxTotalCents)}</ram:TaxTotalAmount>`,
    `<ram:GrandTotalAmount>${xmlAmount(inv.grandTotalCents)}</ram:GrandTotalAmount>`,
    inv.prepaidCents ? `<ram:TotalPrepaidAmount>${xmlAmount(inv.prepaidCents)}</ram:TotalPrepaidAmount>` : "",
    `<ram:DuePayableAmount>${xmlAmount(inv.duePayableCents)}</ram:DuePayableAmount>`,
    "</ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    inv.precedingInvoice
      ? `<ram:InvoiceReferencedDocument>${el("ram:IssuerAssignedID", inv.precedingInvoice.number)}${dateEl("ram:FormattedIssueDateTime", inv.precedingInvoice.issueDate, "qdt")}</ram:InvoiceReferencedDocument>`
      : "",
    "</ram:ApplicableHeaderTradeSettlement>",
    "</rsm:SupplyChainTradeTransaction>",
    "</rsm:CrossIndustryInvoice>",
  ].filter(Boolean).join("\n");
}
