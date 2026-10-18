/**
 * server/routes/einvoicing.ts — réforme de la facturation électronique 2026
 *
 * GET /api/einvoicing/status   — préparation de la praticienne (mentions, identité,
 *                                seuil de franchise, calendrier) — fonction payante
 * GET /api/company-lookup?q=   — recherche d'une entreprise par SIREN, SIRET ou nom
 *                                dans l'annuaire public (recherche-entreprises.api.gouv.fr),
 *                                pour remplir une fiche cliente ou ses propres réglages
 */

import type { Express } from "express";
import { requireAuth, type AuthedRequest } from "../auth";
import { storage } from "../storage";
import { buildPractitionerSnapshot } from "../invoices";
import { checkSeller, type ComplianceIssue } from "../einvoicing/compliance";
import { effectiveVatRegime, signedTotalCents } from "../einvoicing/document";
import { digitsOnly } from "../einvoicing/identifiers";

/** Seuils 2026 de la franchise en base pour les prestations de services (art. 293 B CGI). */
export const FRANCHISE_SERVICES_THRESHOLD_CENTS = 3_750_000;
export const FRANCHISE_SERVICES_MAJORED_CENTS = 4_125_000;

/** Échéances de la réforme pour une micro-entreprise ou une PME. */
export const REFORM_MILESTONES = [
  { date: "2026-09-01", label: "Réception des factures électroniques par une plateforme agréée" },
  { date: "2027-09-01", label: "Émission des factures électroniques, e-reporting et nouvelles mentions obligatoires" },
];

/** Forme juridique (codes INSEE de catégorie juridique) → réglage de l'application. */
export function legalFormFromInsee(code: string | null | undefined): string | null {
  const c = String(code || "");
  if (c === "1000") return "EI";
  if (c === "5498") return "EURL";
  if (c === "5499" || c.startsWith("54")) return "SARL";
  if (c === "5720") return "SASU";
  if (c === "5710" || c.startsWith("57")) return "SAS";
  if (c === "5385" || c.startsWith("538")) return "SELARL";
  if (c.startsWith("92")) return "ASSOCIATION";
  return c ? "AUTRE" : null;
}

/** Nature de la cliente déduite de la catégorie juridique. */
export function clientKindFromInsee(code: string | null | undefined): "entreprise" | "association" | "public" {
  const c = String(code || "");
  if (c.startsWith("92") || c.startsWith("93")) return "association";
  if (c.startsWith("7")) return "public";
  return "entreprise";
}

export interface CompanyLookupResult {
  siren: string;
  siret: string | null;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  vatNumber: string | null;
  legalForm: string | null;
  clientKind: "entreprise" | "association" | "public";
  isEI: boolean;
  active: boolean;
}

/** Traduit une réponse de l'API Recherche d'entreprises (fonction pure, testée). */
export function mapCompanyResult(r: any, wantedSiret?: string | null): CompanyLookupResult {
  const etab = (wantedSiret && Array.isArray(r.matching_etablissements)
    ? r.matching_etablissements.find((e: any) => e.siret === wantedSiret)
    : null) || r.siege || {};
  const postalCode = etab.code_postal || null;
  const city = etab.libelle_commune || null;
  let address: string | null = etab.adresse || null;
  if (address && postalCode) address = address.split(` ${postalCode}`)[0].trim();
  const tva = Array.isArray(r.tva) ? r.tva[0] : r.tva;
  const code = r.nature_juridique;
  return {
    siren: r.siren,
    siret: etab.siret || null,
    name: r.nom_raison_sociale || r.nom_complet || "",
    address,
    postalCode,
    city,
    // Seulement le numéro publié : une EI en franchise n'en a souvent pas, et un
    // numéro recalculé depuis le SIREN n'existerait pas dans VIES.
    vatNumber: tva || null,
    legalForm: legalFormFromInsee(code),
    clientKind: clientKindFromInsee(code),
    isEI: !!r.complements?.est_entrepreneur_individuel || String(code) === "1000",
    active: r.etat_administratif !== "C",
  };
}

const cache = new Map<string, { at: number; data: CompanyLookupResult[] }>();
const CACHE_MS = 24 * 3600 * 1000;

export function registerEInvoicingRoutes(app: Express): void {
  app.get("/api/einvoicing/status", requireAuth, async (req: AuthedRequest, res) => {
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const snap = buildPractitionerSnapshot(user);
    const regime = effectiveVatRegime(snap);
    const readiness: ComplianceIssue[] = checkSeller(snap);
    if (!snap.mediatorName) {
      readiness.push({
        code: "MEDIATOR", level: "attention", where: "reglages",
        message: "Indiquez votre médiateur de la consommation : obligatoire envers les particuliers.",
      });
    }

    let franchise: null | { year: number; revenueCents: number; thresholdCents: number; majoredCents: number } = null;
    if (regime === "franchise") {
      const year = new Date().getFullYear();
      const start = new Date(year, 0, 1).getTime();
      const paid = await storage.listInvoices(req.userId!, { status: "paid" });
      const revenueCents = paid
        .filter((i) => (i as any).docType !== "devis" && i.paidAt && i.paidAt >= start)
        .reduce((s, i) => s + signedTotalCents(i), 0);
      franchise = {
        year,
        revenueCents,
        thresholdCents: FRANCHISE_SERVICES_THRESHOLD_CENTS,
        majoredCents: FRANCHISE_SERVICES_MAJORED_CENTS,
      };
    }

    res.json({
      regime,
      vatOnDebits: !!snap.vatOnDebits,
      readiness,
      franchise,
      // Lot 1B : raccordement à la plateforme agréée (Super PDP).
      platform: { connected: false, name: null },
      milestones: REFORM_MILESTONES,
    });
  });

  app.get("/api/company-lookup", requireAuth, async (req: AuthedRequest, res) => {
    const raw = String(req.query.q || "").trim();
    const digits = digitsOnly(raw);
    const isId = digits.length === 9 || digits.length === 14;
    if (!isId && raw.length < 3) return res.status(400).json({ message: "Saisissez un SIREN, un SIRET ou au moins 3 lettres." });
    const q = isId ? digits : raw;
    const hit = cache.get(q);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json({ results: hit.data });
    try {
      const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&page=1&per_page=5`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
      if (!r.ok) return res.status(502).json({ message: "Annuaire des entreprises indisponible, réessayez plus tard." });
      const body: any = await r.json();
      const results = (body.results || []).map((x: any) => mapCompanyResult(x, digits.length === 14 ? digits : null));
      cache.set(q, { at: Date.now(), data: results });
      res.json({ results });
    } catch (e: any) {
      console.error("[company-lookup]", e?.message || e);
      res.status(502).json({ message: "Annuaire des entreprises injoignable, réessayez plus tard." });
    }
  });
}
