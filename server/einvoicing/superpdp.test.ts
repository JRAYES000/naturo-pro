import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  authorizeUrl, pkcePair, exchangeCode, SuperPdpClient, invoicePatchFromEvent,
  vatRegimeToSuperPdp, superPdpConfig, type SuperPdpConfig,
} from "./superpdp";
import { sealToken, openToken } from "./token-crypto";
import { processingRuleFor } from "./service";

const cfg: SuperPdpConfig = {
  clientId: "client-123", clientSecret: "s3cr3t",
  redirectUri: "https://app.exemple.fr/api/einvoicing/superpdp/callback",
  baseUrl: "https://api.superpdp.test",
};

/** Faux serveur : enregistre les appels et répond selon une fonction. */
function fakeFetch(respond: (url: URL, init: any, n: number) => { status?: number; json?: unknown }) {
  const calls: Array<{ url: URL; init: any }> = [];
  const fn = async (url: string, init: any = {}) => {
    const u = new URL(url);
    calls.push({ url: u, init });
    const r = respond(u, init, calls.length);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { fn, calls };
}

test("configuration : absente sans client OAuth, URL de retour déduite d'APP_URL", () => {
  assert.equal(superPdpConfig({}), null);
  const c = superPdpConfig({ SUPERPDP_CLIENT_ID: "x", APP_URL: "https://app.ecole-naturo.fr/" });
  assert.equal(c?.redirectUri, "https://app.ecole-naturo.fr/api/einvoicing/superpdp/callback");
  assert.equal(c?.baseUrl, "https://api.superpdp.tech");
});

test("PKCE S256 et URL d'autorisation pré-remplie", () => {
  const { verifier, challenge } = pkcePair();
  assert.equal(challenge, crypto.createHash("sha256").update(verifier).digest("base64url"));
  const u = new URL(authorizeUrl(cfg, { state: "st", challenge, email: "m@x.fr", siren: "552032534" }));
  assert.equal(u.pathname, "/oauth2/authorize");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("login_hint"), "m@x.fr");
  assert.equal(u.searchParams.get("superpdp_company_number"), "552032534");
  assert.equal(u.searchParams.get("superpdp_company_number_scheme"), "fr_siren");
});

test("échange du code : formulaire avec vérificateur PKCE et identifiants client", async () => {
  const { fn, calls } = fakeFetch(() => ({ json: { access_token: "AT", refresh_token: "RT", expires_in: 3600 } }));
  const t = await exchangeCode(cfg, "CODE", "VERIF", fn as any);
  assert.equal(t.accessToken, "AT");
  assert.equal(t.refreshToken, "RT");
  assert.ok(t.expiresAt! > Date.now());
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(calls[0].url.pathname, "/oauth2/token");
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code_verifier"), "VERIF");
  assert.equal(body.get("client_secret"), "s3cr3t");
});

test("client : un 401 déclenche un rafraîchissement puis rejoue la requête", async () => {
  let refreshed: string | null = null;
  const { fn, calls } = fakeFetch((url, init) => {
    if (url.pathname === "/oauth2/token") return { json: { access_token: "AT2", expires_in: 3600 } };
    const auth = init.headers.Authorization;
    if (auth === "Bearer AT1") return { status: 401, json: { message: "expired" } };
    return { json: { id: 42, events: [{ id: 1, invoice_id: 42, status_code: "api:uploaded", status_text: "ok", created_at: new Date().toISOString() }] } };
  });
  const client = new SuperPdpClient(cfg, { accessToken: "AT1", refreshToken: "RT1", expiresAt: null }, async (t) => { refreshed = t.accessToken; }, fn as any);
  const r = await client.sendInvoice(Buffer.from("%PDF-1.7"), "naturo-1-7", "B2B");
  assert.equal(r.id, 42);
  assert.equal(refreshed, "AT2");
  const send = calls.filter((c) => c.url.pathname === "/v1.beta/invoices");
  assert.equal(send.length, 2);
  assert.equal(send[1].url.searchParams.get("external_id"), "naturo-1-7");
  assert.equal(send[1].url.searchParams.get("processing_rule"), "B2B");
  assert.equal(send[1].init.headers["Content-Type"], "application/pdf");
});

test("statuts : libellé, date et motif d'échec", () => {
  const ok = invoicePatchFromEvent({ id: 1, invoice_id: 9, status_code: "fr:200", status_text: "x", created_at: "2026-10-18T10:00:00Z" });
  assert.equal(ok.einvoiceStatusLabel, "Déposée");
  assert.equal(ok.einvoiceError, null);
  const ko = invoicePatchFromEvent({
    id: 2, invoice_id: 9, status_code: "fr:213", status_text: "Rejetée", created_at: "2026-10-18T10:00:00Z",
    details: [{ reason: "REJ_SEMAN", notes: [{ content: "SIREN acheteur inconnu" }] }],
  });
  assert.equal(ko.einvoiceStatusLabel, "Rejetée");
  assert.match(String(ko.einvoiceError), /SIREN acheteur inconnu/);
});

test("régime de TVA et règle de traitement", () => {
  assert.equal(vatRegimeToSuperPdp("franchise"), "vat_exemption");
  assert.equal(vatRegimeToSuperPdp("normal_mensuel"), "monthly");
  assert.equal(vatRegimeToSuperPdp("normal_trimestriel"), "quarterly");
  assert.equal(vatRegimeToSuperPdp("simplifie"), "simplified");
  assert.equal(processingRuleFor({ clientType: "entreprise", clientCountry: null } as any), "B2B");
  assert.equal(processingRuleFor({ clientType: "entreprise", clientCountry: "Belgique" } as any), "B2BInt");
  assert.equal(processingRuleFor({ clientType: "particulier", clientCountry: null } as any), "B2C");
  assert.throws(() => processingRuleFor({ clientType: "public", clientCountry: null } as any), /Chorus Pro/);
});

test("jetons chiffrés : aller-retour, altération détectée", () => {
  const sealed = sealToken("jeton-très-secret");
  assert.notEqual(sealed, "jeton-très-secret");
  assert.equal(openToken(sealed), "jeton-très-secret");
  const parts = sealed.split(".");
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "B" : "A") + parts[3].slice(-1);
  assert.equal(openToken(parts.join(".")), null);
  assert.equal(openToken(null), null);
});
