// ─────────────────────────────────────────────────────────────────────────────
// Client de la plateforme agréée Super PDP (immatriculée le 22/12/2025).
//
// Chaque praticienne connecte SON compte Super PDP (OAuth 2.1, « authorization
// code » + PKCE) : Super PDP gère la vérification d'identité, l'accord formel de
// réception et l'inscription à l'annuaire. Naturo Pro agit ensuite pour son
// compte (« solution compatible ») : dépôt des Factur-X, statuts, factures reçues.
//
// API : https://api.superpdp.tech/openapi/superpdp.json (v1.beta).
// Configuration : SUPERPDP_CLIENT_ID, SUPERPDP_CLIENT_SECRET, SUPERPDP_REDIRECT_URI
// (défaut : APP_URL + /api/einvoicing/superpdp/callback), SUPERPDP_BASE_URL.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import type { VatRegime } from "./document";

export interface SuperPdpConfig {
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  baseUrl: string;
}

export function superPdpConfig(env = process.env): SuperPdpConfig | null {
  if (!env.SUPERPDP_CLIENT_ID) return null;
  const appUrl = (env.APP_URL || env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    clientId: env.SUPERPDP_CLIENT_ID,
    clientSecret: env.SUPERPDP_CLIENT_SECRET || null,
    redirectUri: env.SUPERPDP_REDIRECT_URI || `${appUrl}/api/einvoicing/superpdp/callback`,
    baseUrl: (env.SUPERPDP_BASE_URL || "https://api.superpdp.tech").replace(/\/$/, ""),
  };
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null; // ms
}

export interface SpdpEvent {
  id: number;
  invoice_id: number;
  status_code: string;
  status_text: string;
  created_at: string;
  details?: Array<{ reason?: string; notes?: Array<{ content?: string }> }>;
}

/** Libellés des statuts du cycle de vie (norme XP Z12-012) et des statuts Super PDP. */
export const EINVOICE_STATUS_LABELS: Record<string, string> = {
  "api:uploaded": "Déposée chez la plateforme",
  "api:invalid": "Refusée par les contrôles de la plateforme",
  "api:validated": "Contrôlée",
  "api:sent": "Transmise à la plateforme du client",
  "api:rejected": "Rejetée par la plateforme du client",
  "api:received": "Reçue",
  "api:acknowledged": "Accusé de réception",
  "api:accepted": "Acceptée",
  "fr:200": "Déposée",
  "fr:201": "Émise par la plateforme",
  "fr:202": "Reçue par la plateforme du client",
  "fr:203": "Mise à disposition du client",
  "fr:204": "Prise en charge",
  "fr:205": "Approuvée",
  "fr:206": "Approuvée partiellement",
  "fr:207": "En litige",
  "fr:208": "Suspendue",
  "fr:209": "Complétée",
  "fr:210": "Refusée par le client",
  "fr:211": "Paiement transmis",
  "fr:212": "Encaissée",
  "fr:213": "Rejetée",
  "fr:220": "Annulée",
};

/** Statuts qui signalent un échec à corriger (la facture n'a pas abouti). */
export const EINVOICE_FAILURE_CODES = new Set(["api:invalid", "api:rejected", "fr:210", "fr:213"]);

/** Régime de TVA de l'app → valeur Super PDP (fréquence de l'e-reporting). */
export function vatRegimeToSuperPdp(r: VatRegime): "monthly" | "quarterly" | "simplified" | "vat_exemption" {
  switch (r) {
    case "normal_mensuel": return "monthly";
    case "normal_trimestriel": return "quarterly";
    case "simplifie": return "simplified";
    default: return "vat_exemption";
  }
}

/** Paire PKCE (RFC 7636, méthode S256). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** URL d'autorisation, pré-remplie avec l'email et le SIREN de la praticienne. */
export function authorizeUrl(
  cfg: SuperPdpConfig,
  opts: { state: string; challenge: string; email?: string | null; siren?: string | null },
): string {
  const u = new URL(`${cfg.baseUrl}/oauth2/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (opts.email) u.searchParams.set("login_hint", opts.email);
  if (opts.siren) {
    u.searchParams.set("superpdp_company_number", opts.siren);
    u.searchParams.set("superpdp_company_number_scheme", "fr_siren");
  }
  return u.toString();
}

type FetchLike = (url: string, init?: any) => Promise<Response>;

async function tokenRequest(cfg: SuperPdpConfig, params: Record<string, string>, fetchImpl: FetchLike): Promise<TokenSet> {
  const body = new URLSearchParams({ ...params, client_id: cfg.clientId });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  const r = await fetchImpl(`${cfg.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`Super PDP : échec d'authentification (${r.status}${j.error ? ` ${j.error}` : ""})`);
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || params.refresh_token || null,
    expiresAt: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : null,
  };
}

export function exchangeCode(cfg: SuperPdpConfig, code: string, verifier: string, fetchImpl: FetchLike = fetch): Promise<TokenSet> {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, code_verifier: verifier }, fetchImpl);
}

export function refreshTokens(cfg: SuperPdpConfig, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<TokenSet> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

export class SuperPdpError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

/** Client d'API pour le compte d'UNE praticienne ; rafraîchit ses jetons au besoin. */
export class SuperPdpClient {
  constructor(
    private readonly cfg: SuperPdpConfig,
    private tokens: TokenSet,
    private readonly onRefresh: (t: TokenSet) => Promise<void>,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async ensureFresh(force = false): Promise<void> {
    const expiring = this.tokens.expiresAt != null && this.tokens.expiresAt < Date.now() + 60_000;
    if ((force || expiring) && this.tokens.refreshToken) {
      this.tokens = await refreshTokens(this.cfg, this.tokens.refreshToken, this.fetchImpl);
      await this.onRefresh(this.tokens);
    }
  }

  private async request(method: string, path: string, opts: { query?: Record<string, string | number | undefined>; body?: any; contentType?: string } = {}): Promise<Response> {
    await this.ensureFresh();
    const u = new URL(`${this.cfg.baseUrl}${path}`);
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
    const send = () => this.fetchImpl(u.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
        Accept: "application/json",
        ...(opts.contentType ? { "Content-Type": opts.contentType } : {}),
      },
      body: opts.body,
      signal: AbortSignal.timeout(30000),
    });
    let r = await send();
    if (r.status === 401 && this.tokens.refreshToken) {
      await this.ensureFresh(true);
      r = await send();
    }
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      const msg = (body as any)?.message || (body as any)?.error || r.statusText;
      throw new SuperPdpError(`Super PDP ${method} ${path} : ${r.status} ${msg}`, r.status, body);
    }
    return r;
  }

  async me(): Promise<{ id: number; env: string; number: string; formal_name: string; vat_regime: string }> {
    return (await this.request("GET", "/v1.beta/companies/me")).json();
  }

  async setVatRegime(regime: VatRegime, hasVatOnDebits: boolean): Promise<void> {
    await this.request("PATCH", "/v1.beta/companies", {
      body: JSON.stringify({ vat_regime: vatRegimeToSuperPdp(regime), has_vat_on_debits: hasVatOnDebits }),
      contentType: "application/json",
    });
  }

  /** Dépose un Factur-X (PDF) ; `externalId` relie la facture à Naturo Pro. */
  async sendInvoice(pdf: Buffer, externalId: string, processingRule: "B2B" | "B2BInt" | "B2C"): Promise<{ id: number; events?: SpdpEvent[] }> {
    const r = await this.request("POST", "/v1.beta/invoices", {
      query: { external_id: externalId.slice(0, 64), processing_rule: processingRule },
      body: pdf,
      contentType: "application/pdf",
    });
    return r.json();
  }

  async listEvents(startingAfterId?: number | null, limit = 100): Promise<{ data: SpdpEvent[]; has_after: boolean }> {
    return (await this.request("GET", "/v1.beta/invoice_events", {
      query: { starting_after_id: startingAfterId ?? undefined, limit },
    })).json();
  }

  /** Statut « Encaissée » (fr:212) : sans détail, le montant est le total de la facture. */
  async reportPayment(invoiceId: number): Promise<void> {
    await this.request("POST", "/v1.beta/invoice_events", {
      body: JSON.stringify({ invoice_id: invoiceId, status_code: "fr:212" }),
      contentType: "application/json",
    });
  }

  async listReceived(limit = 50): Promise<any[]> {
    const j: any = await (await this.request("GET", "/v1.beta/invoices", {
      query: { direction: "in", order: "desc", limit, "expand[]": "en_invoice" },
    })).json();
    return j.data || [];
  }

  async download(id: number): Promise<{ buffer: Buffer; contentType: string }> {
    const r = await this.request("GET", `/v1.beta/invoices/${id}/download`);
    return { buffer: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "application/octet-stream" };
  }

  /** Entrées actives de l'annuaire pour un SIREN (adresse de facturation électronique). */
  async directory(siren: string): Promise<Array<{ identifier: string; is_active: boolean }>> {
    const j: any = await (await this.request("GET", "/v1.beta/french_directory/entries", { query: { number: siren } })).json();
    return (j.data || []).map((e: any) => ({ identifier: e.identifier, is_active: !!e.is_active }));
  }
}

/** Champs de facture à jour d'après un événement de cycle de vie. */
export function invoicePatchFromEvent(ev: SpdpEvent): Record<string, unknown> {
  const reason = ev.details?.map((d) => [d.reason, ...(d.notes || []).map((n) => n.content)].filter(Boolean).join(" — ")).filter(Boolean).join(" ; ");
  return {
    einvoiceStatus: ev.status_code,
    einvoiceStatusLabel: EINVOICE_STATUS_LABELS[ev.status_code] || ev.status_text || ev.status_code,
    einvoiceStatusAt: Date.parse(ev.created_at) || Date.now(),
    einvoiceError: EINVOICE_FAILURE_CODES.has(ev.status_code) ? (reason || ev.status_text || "Échec signalé par la plateforme") : null,
  };
}
