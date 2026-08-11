/**
 * server/routes/billing.ts — abonnement Naturo Pro (Lot 1, action 8) + tracking
 *
 * Routes :
 *   - POST /api/billing/create-checkout-session  (requireAuth) — démarre la
 *     souscription 19 €/mois. 501 explicite si les clés plateforme sont absentes.
 *   - POST /api/billing/webhook — endpoint Stripe (signature vérifiée sur le corps
 *     brut, req.rawBody). checkout.session.completed → plan "active" ;
 *     customer.subscription.deleted → plan "free" (socle gratuit, décision 5).
 *   - POST /api/billing/track (requireAuth) — événement de conversion côté UI
 *     (clic sur « Passer à Naturo Pro »). Ne renvoie jamais de donnée client.
 *
 * Exempté du gating (server/routes/index.ts) : un compte gratuit doit toujours
 * pouvoir souscrire.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { recordEvent } from "../analytics";
import {
  getSubscriptionConfig, createSubscriptionCheckoutSession, verifyStripeSignature,
} from "../stripe-subscription";
import { publicUser } from "./helpers/tokens";

const trackSchema = z.object({
  event: z.literal("subscribe_click"),
  source: z.string().max(64).optional(),
}).strict();

export function registerBillingRoutes(app: Express): void {
  app.post("/api/billing/create-checkout-session", requireAuth, async (req: AuthedRequest, res) => {
    const cfg = getSubscriptionConfig();
    if (!cfg.configured) {
      return res.status(501).json({
        message: "L'abonnement en ligne n'est pas encore disponible. Contactez le support pour activer votre compte.",
        code: "BILLING_NOT_CONFIGURED",
      });
    }
    const user = req.user ?? (await storage.getUserById(req.userId!));
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    if (user.plan === "active") {
      return res.status(409).json({ message: "Votre abonnement est déjà actif.", code: "ALREADY_SUBSCRIBED" });
    }
    const appUrl = process.env.APP_URL || process.env.PUBLIC_URL || "https://app.ecole-naturo.fr";
    const out = await createSubscriptionCheckoutSession({
      secretKey: cfg.secretKey,
      priceId: cfg.priceId,
      userId: user.id,
      customerEmail: user.email,
      successUrl: `${appUrl}/#/app?billing=success`,
      cancelUrl: `${appUrl}/#/app?billing=cancel`,
    });
    if ("error" in out) {
      console.error("[billing] create-checkout-session:", out.error);
      return res.status(502).json({ message: "Stripe n'a pas pu créer la session de paiement. Réessayez dans un instant." });
    }
    res.json({ id: out.id, url: out.url });
  });

  app.post("/api/billing/track", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides" });
    recordEvent(req.userId!, parsed.data.event, parsed.data.source ? { source: parsed.data.source } : undefined);
    res.json({ ok: true });
  });

  // Webhook Stripe — PAS de requireAuth (appelé par Stripe), la signature fait foi.
  app.post("/api/billing/webhook", async (req: AuthedRequest, res) => {
    const cfg = getSubscriptionConfig();
    if (!cfg.webhookSecret) {
      return res.status(501).json({ message: "Webhook non configuré", code: "BILLING_NOT_CONFIGURED" });
    }
    const rawBody = (req as any).rawBody;
    const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : JSON.stringify(req.body ?? {});
    const signature = req.header("stripe-signature");
    if (!verifyStripeSignature(payload, signature, cfg.webhookSecret)) {
      return res.status(400).json({ message: "Signature invalide" });
    }

    let event: any;
    try { event = JSON.parse(payload); } catch { return res.status(400).json({ message: "Corps illisible" }); }
    const obj = event?.data?.object ?? {};

    try {
      if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
        const userId = Number(obj.metadata?.userId);
        const user = Number.isFinite(userId) ? await storage.getUserById(userId) : undefined;
        if (!user) {
          console.error("[billing][webhook] checkout.session.completed sans user résolu", obj.id);
          return res.json({ received: true, ignored: true });
        }
        await storage.updateUser(user.id, {
          plan: "active",
          stripeCustomerId: obj.customer ? String(obj.customer) : user.stripeCustomerId,
          stripeSubscriptionId: obj.subscription ? String(obj.subscription) : user.stripeSubscriptionId,
        } as any);
        recordEvent(user.id, "subscription_started", { sessionId: obj.id, subscriptionId: obj.subscription ?? null });
        console.log(`[billing] user=${user.id} → plan=active (session ${obj.id})`);
      } else if (event.type === "customer.subscription.deleted") {
        const byMeta = Number(obj.metadata?.userId);
        let user = Number.isFinite(byMeta) ? await storage.getUserById(byMeta) : undefined;
        if (!user && obj.id) {
          const all = await storage.listAllUsers();
          user = all.find((u: any) => u.stripeSubscriptionId === String(obj.id));
        }
        if (!user) {
          console.error("[billing][webhook] subscription.deleted sans user résolu", obj.id);
          return res.json({ received: true, ignored: true });
        }
        // Résiliation → socle gratuit à vie (décision 5), pas un blocage total.
        await storage.updateUser(user.id, { plan: "free", stripeSubscriptionId: null } as any);
        recordEvent(user.id, "subscription_canceled", { subscriptionId: obj.id ?? null });
        console.log(`[billing] user=${user.id} → plan=free (résiliation ${obj.id})`);
      }
    } catch (e: any) {
      console.error("[billing][webhook]", e?.message || e);
      return res.status(500).json({ message: "Erreur de traitement" });
    }
    res.json({ received: true });
  });

  // État de l'abonnement pour l'UI (bannières, FeatureGate).
  app.get("/api/billing/status", requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user ?? (await storage.getUserById(req.userId!));
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const cfg = getSubscriptionConfig();
    res.json({ user: publicUser(user), checkoutAvailable: cfg.configured });
  });
}
