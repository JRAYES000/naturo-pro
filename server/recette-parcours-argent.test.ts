/**
 * server/recette-parcours-argent.test.ts — action 20 (Lot 2)
 *
 * Suite dédiée de recette des 3 parcours d'argent, SANS praticiens (décision 9) :
 *   1. Blocage gratuit — un compte sans accès complet est bloqué sur chaque
 *      route payante du critère de l'action 6 (et le nouveau compte-rendu).
 *   2. Souscription → déblocage — webhook signé accepté, plan actif = accès.
 *   3. Résiliation → re-blocage — retour au socle gratuit.
 *
 * Ces parcours sont exercés au niveau des fonctions de décision (hasFullAccess,
 * PAID_PATH_RE, verifyStripeSignature) : ce sont exactement celles que le
 * middleware de server/routes/index.ts et la route webhook appellent en prod.
 * Le parcours navigateur complet est décrit dans docs/RECETTE.md (checklist).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hasFullAccess, PAID_PATH_RE } from "@shared/plan-access";
import { verifyStripeSignature } from "./stripe-subscription";

// Les 6 routes payantes du critère de l'action 6 (onglet 7 du classeur),
// plus le compte-rendu PDF de l'action 14 (donnée de santé, même régime).
const ROUTES_PAYANTES = [
  "/api/invoices",
  "/api/programmes",
  "/api/anamnesis-templates",
  "/api/reminders/stats",
  "/api/email-templates",
  "/api/packages",
  "/api/notes/12/compte-rendu.pdf",
  "/api/anamnesis-responses/3/generate-programme",
];

const ROUTES_SOCLE_GRATUIT = ["/api/appointments", "/api/clients", "/api/categories", "/api/availability"];

function signer(payload: string, secret: string, atMs: number): string {
  const t = Math.floor(atMs / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

// ── Parcours 1 : blocage gratuit ─────────────────────────────────────────────
test("parcours 1 — essai expiré ou plan free : accès refusé sur toutes les routes payantes", () => {
  const essaiExpire = { plan: "trial", trialEndsAt: Date.now() - 1000 };
  const free = { plan: "free", trialEndsAt: null };
  for (const u of [essaiExpire, free]) {
    assert.equal(hasFullAccess(u), false);
    for (const route of ROUTES_PAYANTES) {
      assert.ok(PAID_PATH_RE.test(route), `${route} devrait être payante`);
    }
  }
});

test("parcours 1 — le socle gratuit n'est jamais bloqué par PAID_PATH_RE", () => {
  for (const route of ROUTES_SOCLE_GRATUIT) {
    assert.equal(PAID_PATH_RE.test(route), false, `${route} doit rester gratuite`);
  }
});

// ── Parcours 2 : souscription → déblocage ────────────────────────────────────
test("parcours 2 — webhook signé accepté, signature forgée refusée, plan actif = accès", () => {
  const secret = "whsec_recette";
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { metadata: { userId: "7" } } } });
  const now = Date.now();
  assert.equal(verifyStripeSignature(payload, signer(payload, secret, now), secret, now), true);
  assert.equal(verifyStripeSignature(payload, signer(payload, "whsec_autre", now), secret, now), false, "signature forgée");
  assert.equal(verifyStripeSignature(payload, signer(payload, secret, now - 10 * 60_000), secret, now), false, "rejeu > 5 min");

  // Effet du webhook de souscription : plan = active → accès complet.
  const apresSouscription = { plan: "active", trialEndsAt: null };
  assert.equal(hasFullAccess(apresSouscription), true);
  for (const route of ROUTES_PAYANTES) {
    assert.ok(PAID_PATH_RE.test(route), "la route reste payante, c'est le plan qui ouvre");
  }
});

// ── Parcours 3 : résiliation → re-blocage ────────────────────────────────────
test("parcours 3 — résiliation : plan free → re-blocage immédiat", () => {
  const avant = { plan: "active", trialEndsAt: null };
  const apresResiliation = { plan: "free", trialEndsAt: null };
  assert.equal(hasFullAccess(avant), true);
  assert.equal(hasFullAccess(apresResiliation), false);
});
