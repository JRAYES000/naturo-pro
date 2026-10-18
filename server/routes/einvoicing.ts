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
import crypto from "node:crypto";
import { requireAuth, type AuthedRequest } from "../auth";
import { storage } from "../storage";
import { buildPractitionerSnapshot } from "../invoices";
import { checkSeller, type ComplianceIssue } from "../einvoicing/compliance";
import { effectiveVatRegime, signedTotalCents } from "../einvoicing/document";
import { digitsOnly, sirenFrom } from "../einvoicing/identifiers";
import { signState, verifyState } from "../google";
import { sealToken, openToken } from "../einvoicing/token-crypto";
import {
  superPdpConfig, pkcePair, authorizeUrl, exchangeCode, SuperPdpClient,
} from "../einvoicing/superpdp";
import { clientFor, syncStatuses, transmitInvoice, EInvoicingError } from "../einvoicing/service";

const PKCE_COOKIE = "spdp_pkce";
const PKCE_COOKIE_PATH = "/api/einvoicing/superpdp";

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

    const conn = await storage.getEInvoicingConnection(req.userId!);
    res.json({
      regime,
      vatOnDebits: !!snap.vatOnDebits,
      readiness,
      franchise,
      // Lot 1B : raccordement à la plateforme agréée (Super PDP).
      platform: {
        available: !!superPdpConfig(),
        connected: !!conn,
        name: conn ? "Super PDP" : null,
        env: conn?.env ?? null,
        companyName: conn?.companyName ?? null,
        companyNumber: conn?.companyNumber ?? null,
        lastSyncAt: conn?.lastSyncAt ?? null,
        lastError: conn?.lastError ?? null,
      },
      milestones: REFORM_MILESTONES,
    });
  });

  // ── Connexion OAuth 2.1 au compte Super PDP de la praticienne ──────────────
  // Le vérificateur PKCE reste côté navigateur dans un cookie HttpOnly chiffré :
  // il ne transite jamais par la plateforme, contrairement au state.
  app.get("/api/einvoicing/superpdp/connect", requireAuth, async (req: AuthedRequest, res) => {
    const cfg = superPdpConfig();
    if (!cfg) return res.redirect("/?einvoicing=indisponible#/app/settings");
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).end();
    const { verifier, challenge } = pkcePair();
    const nonce = crypto.randomBytes(12).toString("base64url");
    const state = signState({ userId: user.id, n: nonce });
    if (!state) return res.redirect("/?einvoicing=erreur#/app/settings");
    res.cookie(PKCE_COOKIE, sealToken(JSON.stringify({ v: verifier, n: nonce })), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000, path: PKCE_COOKIE_PATH,
    });
    res.redirect(authorizeUrl(cfg, {
      state, challenge, email: user.email, siren: sirenFrom((user as any).billingSiret),
    }));
  });

  app.get("/api/einvoicing/superpdp/callback", async (req: AuthedRequest, res) => {
    const fail = (why: string) => res.redirect(`/?einvoicing=erreur&raison=${encodeURIComponent(why)}#/app/settings`);
    const cfg = superPdpConfig();
    if (!cfg) return fail("plateforme non configurée");
    if (req.query.error) return fail(String(req.query.error_description || req.query.error));
    const payload = verifyState(String(req.query.state || ""));
    const sealed = openToken(req.cookies?.[PKCE_COOKIE]);
    res.clearCookie(PKCE_COOKIE, { path: PKCE_COOKIE_PATH });
    if (!payload || !sealed) return fail("session de connexion expirée, recommencez");
    const { v: verifier, n: nonce } = JSON.parse(sealed);
    if (nonce !== payload.n) return fail("état de connexion invalide");
    // La session de l'app doit être celle qui a lancé la connexion.
    if (req.userId && req.userId !== payload.userId) return fail("compte différent");
    try {
      const tokens = await exchangeCode(cfg, String(req.query.code || ""), verifier);
      const client = new SuperPdpClient(cfg, tokens, async () => undefined);
      const company = await client.me();
      const conn = await storage.saveEInvoicingConnection(payload.userId, {
        env: company.env,
        companyId: company.id,
        companyName: company.formal_name,
        companyNumber: company.number,
        accessToken: sealToken(tokens.accessToken),
        refreshToken: tokens.refreshToken ? sealToken(tokens.refreshToken) : null,
        expiresAt: tokens.expiresAt,
      } as any);
      // Aligne le régime de TVA (fréquence de l'e-reporting) sur celui des réglages.
      const user = await storage.getUserById(payload.userId);
      if (user) {
        const snap = buildPractitionerSnapshot(user);
        await clientFor(conn).setVatRegime(effectiveVatRegime(snap), !!snap.vatOnDebits)
          .catch((e) => console.warn("[einvoicing] régime de TVA non aligné :", e?.message || e));
      }
      res.redirect("/?einvoicing=connecte#/app/settings");
    } catch (e: any) {
      console.error("[einvoicing] callback :", e?.message || e);
      fail("échec de la connexion à Super PDP");
    }
  });

  app.post("/api/einvoicing/superpdp/disconnect", requireAuth, async (req: AuthedRequest, res) => {
    await storage.deleteEInvoicingConnection(req.userId!);
    res.json({ ok: true });
  });

  app.post("/api/einvoicing/sync", requireAuth, async (req: AuthedRequest, res) => {
    const conn = await storage.getEInvoicingConnection(req.userId!);
    if (!conn) return res.status(409).json({ message: "Aucune plateforme connectée." });
    try {
      res.json(await syncStatuses(conn));
    } catch (e: any) {
      res.status(e instanceof EInvoicingError ? e.status : 502).json({ message: e?.message || "Synchronisation impossible" });
    }
  });

  // Factures fournisseurs reçues (obligation de réception depuis le 01/09/2026).
  app.get("/api/einvoicing/received", requireAuth, async (req: AuthedRequest, res) => {
    const conn = await storage.getEInvoicingConnection(req.userId!);
    if (!conn) return res.json({ connected: false, invoices: [] });
    try {
      const list = await clientFor(conn).listReceived(50);
      res.json({
        connected: true,
        invoices: list.map((i: any) => ({
          id: i.id,
          receivedAt: i.created_at,
          number: i.en_invoice?.number ?? null,
          issueDate: i.en_invoice?.issue_date ?? null,
          sellerName: i.en_invoice?.seller?.name ?? null,
          total: i.en_invoice?.totals?.amount_due_for_payment ?? i.en_invoice?.totals?.total_with_vat ?? null,
          currency: i.en_invoice?.currency_code ?? "EUR",
          status: i.events?.length ? i.events[i.events.length - 1].status_code : null,
        })),
      });
    } catch (e: any) {
      res.status(e instanceof EInvoicingError ? e.status : 502).json({ message: e?.message || "Plateforme injoignable" });
    }
  });

  app.get("/api/einvoicing/received/:id/file", requireAuth, async (req: AuthedRequest, res) => {
    const conn = await storage.getEInvoicingConnection(req.userId!);
    if (!conn) return res.status(409).json({ message: "Aucune plateforme connectée." });
    try {
      const { buffer, contentType } = await clientFor(conn).download(Number(req.params.id));
      const ext = contentType.includes("pdf") ? "pdf" : "xml";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="facture-recue-${Number(req.params.id)}.${ext}"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(e instanceof EInvoicingError ? e.status : 502).json({ message: e?.message || "Téléchargement impossible" });
    }
  });

  // Transmission d'une facture émise à la plateforme (B2B).
  app.post("/api/invoices/:id/einvoice", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const inv = await transmitInvoice(req.userId!, Number(req.params.id));
      res.json(inv);
    } catch (e: any) {
      res.status(e instanceof EInvoicingError ? e.status : 502).json({ message: e?.message || "Transmission impossible" });
    }
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
