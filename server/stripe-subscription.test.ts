/**
 * server/stripe-subscription.test.ts — signature du webhook d'abonnement (Lot 1, action 8)
 *
 * Le webhook est le seul chemin qui fait basculer un compte en payant : une
 * signature forgée acceptée = un déblocage gratuit. Fonction pure, testée sans
 * réseau (même approche que verifyStripeSignature côté Stripe CLI).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "./stripe-subscription";

test("verifyStripeSignature — signée OK ; forgée, rejouée ou sans en-tête NON", () => {
  const secret = "whsec_test_secret";
  const now = 1_700_000_000_000;
  const t = Math.floor(now / 1000);
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { mode: "subscription" } } });
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");

  // Signature valide → acceptée.
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret, now), true);
  // Signature calculée avec un AUTRE secret (forgée) → refusée.
  const forged = createHmac("sha256", "whsec_autre").update(`${t}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${forged}`, secret, now), false);
  // Payload modifié après signature → refusé.
  assert.equal(verifyStripeSignature(payload + "x", `t=${t},v1=${v1}`, secret, now), false);
  // Rejeu au-delà de la tolérance de 5 minutes → refusé.
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret, now + 6 * 60 * 1000), false);
  // En-tête absent ou malformé → refusé sans lever.
  assert.equal(verifyStripeSignature(payload, undefined, secret, now), false);
  assert.equal(verifyStripeSignature(payload, "v1=seul", secret, now), false);
  // Plusieurs v1 (rotation de secret côté Stripe) : l'un des deux valide suffit.
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${forged},v1=${v1}`, secret, now), true);
});
