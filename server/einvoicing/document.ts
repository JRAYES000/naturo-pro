// ─────────────────────────────────────────────────────────────────────────────
// Modèle unique d'une facture « telle qu'émise » : il alimente à la fois le PDF
// lisible et le XML Factur-X, ce qui garantit que les deux disent la même chose
// (exigence du format mixte).
// ─────────────────────────────────────────────────────────────────────────────
import type { Invoice, InvoiceItem } from "@shared/schema-active";
import { sirenFrom, siretFrom, normalizeVatNumber, countryCode } from "./identifiers";
import { buildFacturxXml, type FacturxInvoice, type VatCategory } from "./facturx-xml";

export type DocKind = "invoice" | "credit_note" | "quote";
export type VatRegime = "franchise" | "simplifie" | "normal_mensuel" | "normal_trimestriel";
export type ClientKind = "particulier" | "entreprise" | "association" | "public";
export type OperationCategory = "services" | "goods" | "mixed";
export type LineKind = "service" | "goods";

export const LEGAL_FORMS = ["EI", "EURL", "SASU", "SARL", "SAS", "SELARL", "ASSOCIATION", "AUTRE"] as const;
export const VAT_REGIMES: VatRegime[] = ["franchise", "simplifie", "normal_mensuel", "normal_trimestriel"];
export const CLIENT_KINDS: ClientKind[] = ["particulier", "entreprise", "association", "public"];

/** Taux de TVA admis en France par les plateformes (règle BR-FR-16), en pourcentage. */
export const FRENCH_VAT_RATES = [20, 10, 5.5, 2.1, 8.5, 13, 7, 1.05, 0.9, 1.75, 9.2, 9.6, 19.6, 20.6];

/** Mention exacte exigée en franchise en base (BOI-TVA-DECLA-30-20-20-10 §450). */
export const FRANCHISE_MENTION = "TVA non applicable, art. 293 B du CGI";

/** Mentions obligatoires envers un client professionnel (art. L441-9 du Code de commerce). */
export const B2B_NOTES = {
  PMD: "En cas de retard de paiement, pénalités au taux de trois fois le taux d'intérêt légal.",
  PMT: "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € (art. D441-5 du Code de commerce).",
  AAB: "Pas d'escompte pour paiement anticipé.",
} as const;

/** Snapshot praticienne figé dans la facture à son émission. */
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
  vatRate: number; // *100
  legalMention?: string | null;
  paymentTerms?: string | null;
  logoBase64?: string | null;
  // Réforme 2026
  legalForm?: string | null;
  vatNumber?: string | null;
  vatRegime?: VatRegime | null;
  vatOnDebits?: boolean;
  rcs?: string | null;
  shareCapital?: string | null;
  mediatorName?: string | null;
  mediatorUrl?: string | null;
}

export interface SellerInfo {
  name: string;              // nom légal : nom de l'entrepreneuse pour une EI, raison sociale sinon
  tradeName: string | null;  // nom commercial d'une EI, s'il diffère
  legalForm: string | null;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  rcs: string | null;
  shareCapital: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  logoBase64: string | null;
  iban: string | null;
  bic: string | null;
  mediatorName: string | null;
  mediatorUrl: string | null;
}

export interface BuyerInfo {
  kind: ClientKind;
  name: string;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
}

export interface DocLine {
  description: string;
  quantity: number;
  unitPriceCents: number; // ≥ 0
  totalCents: number;     // ≥ 0
  kind: LineKind;
}

export interface InvoiceDocument {
  kind: DocKind;
  draft: boolean;
  number: string;
  issueDate: number;
  serviceDate: number | null;
  dueDate: number | null;
  category: OperationCategory;
  seller: SellerInfo;
  buyer: BuyerInfo;
  vatRegime: VatRegime;
  vatOnDebits: boolean;
  vatRatePercent: number; // 0 en franchise
  lines: DocLine[];
  subtotalCents: number;  // montants toujours positifs, y compris pour un avoir
  vatCents: number;
  totalCents: number;
  paid: { at: number; method: string | null } | null;
  credited: { number: string; issueDate: number } | null;
  paymentTerms: string | null;
  legalMention: string | null;
  notes: string | null;
}

/** Préfixe des numéros provisoires des brouillons (hors séquence légale FACT-). */
export const DRAFT_NUMBER_PREFIX = "BROUILLON-";

export function isProvisionalNumber(n: string | null | undefined): boolean {
  return !!n && n.startsWith(DRAFT_NUMBER_PREFIX);
}

/** Numéro provisoire unique d'un brouillon (≤ 32 caractères, colonne invoices.number). */
export function provisionalNumber(now = Date.now()): string {
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
  return `${DRAFT_NUMBER_PREFIX}${now.toString(36).toUpperCase()}${rand}`;
}

/** Régime de TVA effectif : celui choisi, sinon déduit de l'assujettissement. */
export function effectiveVatRegime(s: { vatRegime?: string | null; vatEnabled?: boolean | null }): VatRegime {
  if (s.vatRegime && (VAT_REGIMES as string[]).includes(s.vatRegime)) return s.vatRegime as VatRegime;
  return s.vatEnabled ? "simplifie" : "franchise";
}

/** Nature du document : devis, avoir ou facture. */
export function documentKind(inv: Pick<Invoice, "docType" | "totalCents"> & { creditedInvoiceId?: number | null }): DocKind {
  if (inv.docType === "devis") return "quote";
  if (inv.docType === "avoir" || inv.creditedInvoiceId || (inv.totalCents ?? 0) < 0) return "credit_note";
  return "invoice";
}

/** Catégorie d'opération déduite de la nature des lignes. */
export function categoryFromKinds(kinds: Array<string | null | undefined>): OperationCategory {
  const goods = kinds.some((k) => k === "goods");
  const services = kinds.some((k) => k !== "goods");
  if (goods && services) return "mixed";
  return goods ? "goods" : "services";
}

/** Montant signé pour la comptabilité : un avoir vient en déduction du chiffre d'affaires. */
export function signedTotalCents(inv: Pick<Invoice, "docType" | "totalCents">): number {
  const t = inv.totalCents || 0;
  return inv.docType === "avoir" ? -Math.abs(t) : t;
}

export function clientKind(v: string | null | undefined): ClientKind {
  return (CLIENT_KINDS as string[]).includes(v || "") ? (v as ClientKind) : "particulier";
}

/** Client professionnel : mentions B2B (échéance, pénalités, indemnité de 40 €, escompte). */
export function isProfessionalBuyer(kind: ClientKind): boolean {
  return kind !== "particulier";
}

/** Nom légal affiché : « EI » accolé au nom d'une entreprise individuelle (loi du 14/02/2022). */
export function sellerDisplayName(s: Pick<SellerInfo, "name" | "legalForm">): string {
  if (s.legalForm === "EI") {
    return /\bEI\b|entrepreneur individuel/i.test(s.name) ? s.name : `${s.name} EI`;
  }
  return s.name;
}

export function buildInvoiceDocument(
  inv: Invoice,
  items: InvoiceItem[],
  snap: PractitionerSnapshot,
  credited?: Pick<Invoice, "number" | "issueDate"> | null,
): InvoiceDocument {
  const kind = documentKind(inv as any);
  const regime = effectiveVatRegime(snap);
  const withVat = !!inv.vatEnabled;
  const buyerKind = clientKind(inv.clientType);
  const personName = `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim();
  const lines: DocLine[] = items.map((it) => ({
    description: it.description,
    quantity: Math.abs(it.quantity ?? 1),
    unitPriceCents: Math.abs(it.unitPriceCents ?? 0),
    totalCents: Math.abs(it.totalCents ?? 0),
    kind: it.kind === "goods" ? "goods" : "service",
  }));
  const siren = sirenFrom(snap.siret);
  // Une EI facture sous le nom de l'entrepreneuse suivi de « EI » ; un éventuel nom
  // commercial s'affiche en plus, il ne le remplace pas.
  const isEI = snap.legalForm === "EI";
  const company = (snap.companyName || "").trim();
  const legalName = isEI ? (snap.name || company) : (company || snap.name || "");
  const tradeName = isEI && company && company !== snap.name ? company : null;
  return {
    kind,
    draft: kind !== "quote" && inv.status === "draft",
    number: inv.number,
    issueDate: inv.issueDate,
    serviceDate: inv.serviceDate ?? null,
    dueDate: inv.dueDate ?? null,
    category: (inv.operationCategory as OperationCategory) || categoryFromKinds(lines.map((l) => l.kind)),
    seller: {
      name: legalName,
      tradeName,
      legalForm: snap.legalForm || null,
      siren,
      siret: siretFrom(snap.siret),
      vatNumber: normalizeVatNumber(snap.vatNumber),
      rcs: snap.rcs || null,
      shareCapital: snap.shareCapital || null,
      address: snap.address || null,
      postalCode: snap.postalCode || null,
      city: snap.city || null,
      country: snap.country || "France",
      email: snap.email || null,
      phone: snap.phone || null,
      logoBase64: snap.logoBase64 || null,
      iban: snap.iban || null,
      bic: snap.bic || null,
      mediatorName: snap.mediatorName || null,
      mediatorUrl: snap.mediatorUrl || null,
    },
    buyer: {
      kind: buyerKind,
      name: (buyerKind !== "particulier" && inv.clientCompanyName) || personName || inv.clientCompanyName || "",
      siren: buyerKind === "particulier" ? null : sirenFrom(inv.clientSiren || inv.clientSiret),
      siret: buyerKind === "particulier" ? null : siretFrom(inv.clientSiret),
      vatNumber: buyerKind === "particulier" ? null : normalizeVatNumber(inv.clientVatNumber),
      address: inv.clientAddress || null,
      postalCode: inv.clientPostalCode || null,
      city: inv.clientCity || null,
      country: inv.clientCountry || "France",
      email: inv.clientEmail || null,
    },
    vatRegime: withVat ? (regime === "franchise" ? "simplifie" : regime) : "franchise",
    vatOnDebits: withVat && !!snap.vatOnDebits,
    vatRatePercent: withVat ? (inv.vatRate ?? 0) / 100 : 0,
    lines,
    subtotalCents: Math.abs(inv.subtotalCents || 0),
    vatCents: Math.abs(inv.vatCents || 0),
    totalCents: Math.abs(inv.totalCents || 0),
    paid: inv.status === "paid" && inv.paidAt ? { at: inv.paidAt, method: inv.paymentMethod || null } : null,
    credited: credited ? { number: credited.number, issueDate: credited.issueDate } : null,
    paymentTerms: snap.paymentTerms || null,
    legalMention: snap.legalMention || null,
    notes: inv.notes || null,
  };
}

const PAYMENT_MEANS: Record<string, string> = { cash: "10", check: "20", card: "48" };

/** Traduction du document en Factur-X (profil EN 16931 + règles françaises). */
export function documentToFacturx(d: InvoiceDocument): FacturxInvoice {
  if (d.kind === "quote") throw new Error("Un devis n'a pas de représentation Factur-X.");
  const franchise = d.vatRegime === "franchise";
  const category: VatCategory = franchise ? "E" : "S";
  const rate = franchise ? 0 : d.vatRatePercent;
  const buyerFr = countryCode(d.buyer.country) === "FR";
  const pro = isProfessionalBuyer(d.buyer.kind);
  const businessType: FacturxInvoice["businessType"] =
    d.buyer.kind === "particulier" || d.buyer.kind === "association"
      ? (buyerFr ? "B2C" : "B2CINT")
      : (buyerFr ? "B2B" : "B2BINT");
  const sellerSiren = d.seller.siren;
  const notes: FacturxInvoice["notes"] = [];
  if (pro) {
    notes.push({ subjectCode: "PMD", content: B2B_NOTES.PMD });
    notes.push({ subjectCode: "PMT", content: B2B_NOTES.PMT });
    notes.push({ subjectCode: "AAB", content: B2B_NOTES.AAB });
  }
  if (d.notes) notes.push({ content: d.notes });
  const paymentMeansCode = d.seller.iban ? "58" : (d.paid?.method && PAYMENT_MEANS[d.paid.method]) || null;
  return {
    number: d.number,
    typeCode: d.kind === "credit_note" ? "381" : "380",
    issueDate: new Date(d.issueDate),
    dueDate: d.dueDate ? new Date(d.dueDate) : null,
    // Date de la prestation, ou à défaut la date d'émission — comme sur le PDF
    // (et sans laisser vide le bloc de livraison, signalé par la règle PEPPOL-R008).
    deliveryDate: new Date(d.serviceDate || d.issueDate),
    billingFramework: d.category === "goods" ? "B1" : d.category === "mixed" ? "M1" : "S1",
    businessType,
    notes,
    seller: {
      name: sellerDisplayName(d.seller),
      tradingName: d.seller.tradeName,
      siren: sellerSiren,
      siret: d.seller.siret,
      vatNumber: d.seller.vatNumber,
      // Franchise sans n° de TVA : le SIREN tient lieu d'identifiant fiscal (BT-32),
      // exigé par la règle BR-E-02 pour une ligne exonérée.
      taxRegistrationId: franchise && !d.seller.vatNumber ? sellerSiren : null,
      address: {
        line1: d.seller.address,
        postalCode: d.seller.postalCode,
        city: d.seller.city,
        countryCode: countryCode(d.seller.country),
      },
      electronicAddress: sellerSiren ? { value: sellerSiren, scheme: "0225" } : null,
    },
    buyer: {
      name: d.buyer.name || "Client",
      siren: d.buyer.siren,
      siret: d.buyer.siret,
      vatNumber: d.buyer.vatNumber,
      address: {
        line1: d.buyer.address,
        postalCode: d.buyer.postalCode,
        city: d.buyer.city,
        countryCode: countryCode(d.buyer.country),
      },
      electronicAddress: pro && d.buyer.siren ? { value: d.buyer.siren, scheme: "0225" } : null,
    },
    lines: d.lines.map((l, i) => ({
      id: String(i + 1),
      name: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.totalCents,
      vatCategory: category,
      vatRatePercent: rate,
    })),
    vatBreakdown: [{
      category,
      ratePercent: rate,
      basisCents: d.subtotalCents,
      taxCents: franchise ? 0 : d.vatCents,
      exemptionReason: franchise ? FRANCHISE_MENTION : null,
      exemptionReasonCode: franchise ? "VATEX-FR-FRANCHISE" : null,
    }],
    lineTotalCents: d.subtotalCents,
    taxBasisTotalCents: d.subtotalCents,
    taxTotalCents: franchise ? 0 : d.vatCents,
    grandTotalCents: d.totalCents,
    prepaidCents: 0,
    duePayableCents: d.totalCents,
    paymentMeansCode,
    iban: d.seller.iban,
    bic: d.seller.bic,
    paymentTermsText: d.paymentTerms || (d.dueDate ? null : "Paiement à réception"),
    precedingInvoice: d.credited ? { number: d.credited.number, issueDate: new Date(d.credited.issueDate) } : null,
  };
}

/** XML Factur-X d'un document émis. */
export function facturxXmlFor(d: InvoiceDocument): string {
  return buildFacturxXml(documentToFacturx(d));
}
