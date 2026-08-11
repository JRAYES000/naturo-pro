/**
 * server/stripe-subscription.ts — abonnement Naturo Pro à 19 €/mois (Lot 1, action 8)
 *
 * À ne pas confondre avec server/stripe.ts : là-bas, chaque praticien encaisse des
 * ACOMPTES avec SA propre clé Stripe. Ici, c'est la plateforme qui encaisse
 * l'ABONNEMENT du praticien, avec les clés de la plateforme :
 *
 *   STRIPE_SUBSCRIPTION_SECRET_KEY  clé secrète du compte plateforme (sk_test_/sk_live_)
 *   STRIPE_WEBHOOK_SECRET           secret de signature du webhook (whsec_…)
 *   STRIPE_PRICE_ID_19              Price Stripe du palier unique 19 €/mois (price_…)
 *
 * Le passage en production se réduit au remplacement de ces trois variables —
 * documenté dans docs/STRIPE-PRODUCTION.md.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export function getSubscriptionConfig() {
  const secretKey = process.env.STRIPE_SUBSCRIPTION_SECRET_KEY || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const priceId = process.env.STRIPE_PRICE_ID_19 || "";
  const configured = !!(secretKey && webhookSecret && priceId);
  return { secretKey, webhookSecret, priceId, configured };
}

/** Crée une Checkout Session en mode subscription (palier unique 19 €/mois). */
export async function createSubscriptionCheckoutSession(opts: {
  secretKey: string;
  priceId: string;
  userId: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string } | { error: string }> {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", opts.successUrl);
  params.set("cancel_url", opts.cancelUrl);
  params.set("customer_email", opts.customerEmail);
  params.set("line_items[0][price]", opts.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[userId]", String(opts.userId));
  params.set("subscription_data[metadata][userId]", String(opts.userId));
  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const data: any = await res.json();
    if (!res.ok) return { error: data?.error?.message || `Stripe HTTP ${res.status}` };
    if (!data?.url) return { error: "Réponse Stripe sans URL de paiement" };
    return { id: data.id, url: data.url };
  } catch (e: any) {
    return { error: e?.message || "Échec requête Stripe" };
  }
}

/**
 * Vérifie la signature Stripe d'un webhook (en-tête `stripe-signature`,
 * format `t=<timestamp>,v1=<hmac>`). HMAC-SHA256 de `${t}.${payload}` avec le
 * secret whsec_…, comparaison à temps constant, tolérance de rejeu 5 minutes.
 *
 * Fonction pure (payload + header + secret + horloge injectable) : testée dans
 * billing.test.ts sans réseau ni Stripe réel.
 */
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!signatureHeader || !secret) return false;
  const parts = new Map<string, string[]>();
  for (const kv of signatureHeader.split(",")) {
    const i = kv.indexOf("=");
    if (i <= 0) continue;
    const k = kv.slice(0, i).trim();
    const v = kv.slice(i + 1).trim();
    parts.set(k, [...(parts.get(k) || []), v]);
  }
  const t = Number(parts.get("t")?.[0]);
  const candidates = parts.get("v1") || [];
  if (!Number.isFinite(t) || candidates.length === 0) return false;
  const TOLERANCE_S = 5 * 60;
  if (Math.abs(nowMs / 1000 - t) > TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return candidates.some((c) => {
    const buf = Buffer.from(c, "utf8");
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
}
