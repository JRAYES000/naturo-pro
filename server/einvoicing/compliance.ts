// ─────────────────────────────────────────────────────────────────────────────
// Contrôle de conformité d'une facture : mentions obligatoires (CGI, Code de
// commerce, Code de la consommation) et données exigées par la facture
// électronique. Fonction pure, affichée dans l'éditeur et les réglages.
// ─────────────────────────────────────────────────────────────────────────────
import {
  FRENCH_VAT_RATES, isProfessionalBuyer, type InvoiceDocument, type PractitionerSnapshot,
  effectiveVatRegime,
} from "./document";
import { isValidSiren, isValidSiret, isValidVatNumber, digitsOnly, countryCode } from "./identifiers";

export type IssueLevel = "erreur" | "attention";
export type IssueWhere = "reglages" | "client" | "facture";

export interface ComplianceIssue {
  code: string;
  level: IssueLevel;
  where: IssueWhere;
  message: string;
}

const SOCIETES = ["EURL", "SASU", "SARL", "SAS", "SELARL"];

/** Numéro accepté par toutes les plateformes : 20 caractères, [A-Za-z0-9 -+_/]. */
export function isPortableInvoiceNumber(n: string): boolean {
  return n.length <= 20 && /^[A-Za-z0-9+\-_/]+$/.test(n);
}

/** Contrôles portant sur l'identité de la praticienne (réglages). */
export function checkSeller(
  s: Pick<PractitionerSnapshot, "siret" | "address" | "postalCode" | "city" | "legalForm" | "vatNumber" | "rcs" | "vatEnabled" | "vatRegime" | "vatRate">,
): ComplianceIssue[] {
  const out: ComplianceIssue[] = [];
  const siret = digitsOnly(s.siret);
  if (!siret) {
    out.push({ code: "SELLER_SIRET", level: "erreur", where: "reglages", message: "Votre SIRET n'est pas renseigné : il doit figurer sur chaque facture." });
  } else if (!(siret.length === 14 ? isValidSiret(siret) : isValidSiren(siret))) {
    out.push({ code: "SELLER_SIRET", level: "erreur", where: "reglages", message: "Votre SIRET semble erroné (clé de contrôle invalide)." });
  }
  if (!s.address || !s.postalCode || !s.city) {
    out.push({ code: "SELLER_ADDRESS", level: "erreur", where: "reglages", message: "Votre adresse de facturation est incomplète (adresse, code postal, ville)." });
  }
  if (!s.legalForm) {
    out.push({ code: "SELLER_LEGAL_FORM", level: "attention", where: "reglages", message: "Indiquez votre forme juridique : une entreprise individuelle doit faire figurer « EI » après son nom." });
  } else if (SOCIETES.includes(s.legalForm) && !s.rcs) {
    out.push({ code: "SELLER_RCS", level: "attention", where: "reglages", message: "Une société doit indiquer son immatriculation (RCS ou RM) et son capital social." });
  }
  const regime = effectiveVatRegime(s);
  if (regime !== "franchise") {
    if (!s.vatNumber) {
      out.push({ code: "SELLER_VAT_NUMBER", level: "erreur", where: "reglages", message: "Assujettie à la TVA : votre numéro de TVA intracommunautaire est obligatoire." });
    } else if (!isValidVatNumber(s.vatNumber)) {
      out.push({ code: "SELLER_VAT_NUMBER", level: "attention", where: "reglages", message: "Votre numéro de TVA intracommunautaire semble erroné." });
    }
    if (!FRENCH_VAT_RATES.includes((s.vatRate ?? 0) / 100)) {
      out.push({ code: "VAT_RATE", level: "erreur", where: "reglages", message: "Taux de TVA non reconnu en France (20, 10, 5,5 ou 2,1 % en métropole)." });
    }
  }
  return out;
}

/** Contrôle complet d'une facture, d'un avoir ou d'un devis. */
export function checkInvoice(d: InvoiceDocument, seller?: PractitionerSnapshot | null): ComplianceIssue[] {
  const out: ComplianceIssue[] = [];
  if (seller) out.push(...checkSeller(seller));
  const b = d.buyer;
  const pro = isProfessionalBuyer(b.kind);

  if (!b.name) {
    out.push({ code: "BUYER_NAME", level: "erreur", where: "client", message: "Le nom du client est obligatoire." });
  }
  if (!b.address || !b.postalCode || !b.city) {
    out.push({
      code: "BUYER_ADDRESS",
      level: pro ? "erreur" : "attention",
      where: "client",
      message: pro ? "L'adresse du client professionnel est obligatoire." : "L'adresse du client est recommandée sur la facture.",
    });
  }
  if (pro && b.kind !== "association" && countryCode(b.country) === "FR") {
    if (!b.siren) {
      out.push({ code: "BUYER_SIREN", level: "attention", where: "client", message: "SIREN du client professionnel manquant : obligatoire sur les factures dès le 1er septembre 2027 et indispensable à la facture électronique." });
    } else if (!isValidSiren(b.siren)) {
      out.push({ code: "BUYER_SIREN", level: "erreur", where: "client", message: "Le SIREN du client semble erroné (clé de contrôle invalide)." });
    }
  }
  if (b.vatNumber && !isValidVatNumber(b.vatNumber)) {
    out.push({ code: "BUYER_VAT_NUMBER", level: "attention", where: "client", message: "Le numéro de TVA du client semble erroné." });
  }
  if (b.kind === "public") {
    out.push({ code: "PUBLIC_BUYER", level: "attention", where: "client", message: "Client public : la facture doit être déposée sur Chorus Pro." });
  }
  if (!pro && d.kind === "invoice" && seller && !seller.mediatorName) {
    out.push({ code: "MEDIATOR", level: "attention", where: "reglages", message: "Indiquez votre médiateur de la consommation : obligatoire envers les particuliers." });
  }

  if (d.lines.length === 0 || d.totalCents <= 0) {
    out.push({ code: "LINES", level: "erreur", where: "facture", message: "La facture doit comporter au moins une ligne d'un montant positif." });
  } else if (d.lines.some((l) => l.unitPriceCents <= 0)) {
    out.push({ code: "LINE_PRICE", level: "attention", where: "facture", message: "Une ligne a un prix nul." });
  }
  if (d.kind === "credit_note" && !d.credited) {
    out.push({ code: "CREDIT_REF", level: "erreur", where: "facture", message: "Un avoir doit citer le numéro et la date de la facture qu'il corrige." });
  }
  if (!d.draft && d.kind !== "quote" && !isPortableInvoiceNumber(d.number)) {
    out.push({ code: "NUMBER_FORMAT", level: "attention", where: "facture", message: "Numéro de facture hors format des plateformes agréées (20 caractères, lettres, chiffres, - + _ /)." });
  }
  return out;
}
