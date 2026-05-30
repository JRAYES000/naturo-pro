/**
 * Tests unitaires — server/routes/helpers/tokens.ts
 * Runner : node:test (intégré Node 24), lancé via `npm run test` (tsx --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { genToken, slugify, publicUser } from "./tokens";

test("genToken — 48 caractères hex", () => {
  const t = genToken();
  assert.match(t, /^[0-9a-f]{48}$/);
});

test("genToken — deux appels diffèrent (aléatoire)", () => {
  assert.notEqual(genToken(), genToken());
});

test("slugify — minuscule + suppression accents", () => {
  assert.equal(slugify("Élodie Müller"), "elodie-muller");
  assert.equal(slugify("Crème brûlée"), "creme-brulee");
  assert.equal(slugify("João"), "joao");
  assert.equal(slugify("naïve façade"), "naive-facade");
});

test("slugify — espaces multiples et symboles collapsés en un seul tiret", () => {
  assert.equal(slugify("  Multiple   Spaces  "), "multiple-spaces");
  assert.equal(slugify("Cabinet & Co !!! Paris"), "cabinet-co-paris");
});

test("slugify — fallback 'naturo' quand vide ou que des symboles", () => {
  assert.equal(slugify(""), "naturo");
  assert.equal(slugify("!!!"), "naturo");
  assert.equal(slugify("   "), "naturo");
});

test("slugify — tronqué à 60 caractères", () => {
  assert.equal(slugify("a".repeat(80)).length, 60);
});

test("publicUser — null → null", () => {
  assert.equal(publicUser(null), null);
});

test("publicUser — retire les champs secrets", () => {
  const out = publicUser({
    id: 1, email: "a@b.fr", name: "Marie",
    passwordHash: "HASH", googleCalendarToken: "TOK", googleId: "GID",
    resendApiKey: "RK", emailVerifyToken: "EVT", emailVerifyExpiresAt: 123,
    passwordResetToken: "PRT", passwordResetExpiresAt: 456,
  });
  assert.ok(out);
  for (const secret of [
    "passwordHash", "googleCalendarToken", "googleId", "resendApiKey",
    "emailVerifyToken", "emailVerifyExpiresAt", "passwordResetToken", "passwordResetExpiresAt",
  ]) {
    assert.equal(secret in out!, false, `${secret} ne doit pas fuiter`);
  }
  // Champs publics conservés
  assert.equal(out!.id, 1);
  assert.equal(out!.email, "a@b.fr");
  assert.equal(out!.name, "Marie");
});

test("publicUser — flags dérivés (hasResendApiKey / emailVerified / onboardingCompleted)", () => {
  const withSecrets = publicUser({ resendApiKey: "RK", emailVerifiedAt: 1, onboardingCompletedAt: 2 });
  assert.equal(withSecrets!.hasResendApiKey, true);
  assert.equal(withSecrets!.emailVerified, true);
  assert.equal(withSecrets!.onboardingCompleted, true);

  const without = publicUser({ id: 9 });
  assert.equal(without!.hasResendApiKey, false);
  assert.equal(without!.emailVerified, false);
  assert.equal(without!.onboardingCompleted, false);
});

test("publicUser — daysUntilTrialEnds null hors plan trial", () => {
  const u = publicUser({ plan: "active", trialEndsAt: Date.now() + 5 * 86400000 });
  assert.equal(u!.daysUntilTrialEnds, null);
});

test("publicUser — daysUntilTrialEnds = 0 si trial expiré", () => {
  const u = publicUser({ plan: "trial", trialEndsAt: Date.now() - 1000 });
  assert.equal(u!.daysUntilTrialEnds, 0);
});

test("publicUser — daysUntilTrialEnds arrondi au jour supérieur", () => {
  // now + 10 jours pile : Date.now() interne ≥ celui-ci → ms ≤ 10j, ceil = 10.
  const u = publicUser({ plan: "trial", trialEndsAt: Date.now() + 10 * 86400000 });
  assert.equal(u!.daysUntilTrialEnds, 10);
});
