/**
 * server/routes/helpers/purge.test.ts — purge des comptes gratuits inactifs (Lot 1, action 11)
 *
 * isPurgeable est le prédicat exact appliqué par purgeInactiveFreeAccounts()
 * avant chaque deleteUserCascade : le tester, c'est tester qui est supprimé.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPurgeable, PURGE_INACTIVITY_MS } from "./purge";

test("isPurgeable — gratuit inactif 13 mois OUI ; abonné, essai en cours, actif récent ou compte protégé NON", () => {
  const NOW = 1_700_000_000_000;
  const M13 = NOW - PURGE_INACTIVITY_MS - 30 * 24 * 3600 * 1000; // ~13 mois
  const base = { plan: "trial", trialEndsAt: NOW - 1000, createdAt: M13, email: "x@y.fr" };

  // Essai expiré (= socle gratuit), dernière connexion il y a 13 mois → purgé.
  assert.equal(isPurgeable({ ...base, lastLoginAt: M13 }, NOW), true);
  // Sans last_login_at (compte antérieur à la colonne) : created_at fait foi.
  assert.equal(isPurgeable({ ...base, lastLoginAt: null }, NOW), true);
  // Plan "free" explicite (résilié) inactif → purgé aussi.
  assert.equal(isPurgeable({ ...base, plan: "free", lastLoginAt: M13 }, NOW), true);
  // Abonné payant, même inactif 13 mois → JAMAIS purgé.
  assert.equal(isPurgeable({ ...base, plan: "active", lastLoginAt: M13 }, NOW), false);
  // Essai encore en cours → jamais purgé (l'essai dure 30 j, cas défensif).
  assert.equal(isPurgeable({ ...base, trialEndsAt: NOW + 1000, lastLoginAt: M13 }, NOW), false);
  // Connexion récente → conservé, même en gratuit.
  assert.equal(isPurgeable({ ...base, lastLoginAt: NOW - 24 * 3600 * 1000 }, NOW), false);
  // Juste sous le seuil de 12 mois → conservé (pas de purge anticipée).
  assert.equal(isPurgeable({ ...base, lastLoginAt: NOW - PURGE_INACTIVITY_MS + 60_000 }, NOW), false);
  // Comptes protégés (démo + owner) → jamais purgés, quel que soit l'état.
  assert.equal(isPurgeable({ ...base, email: "marie@demo.fr", lastLoginAt: M13 }, NOW), false);
  assert.equal(isPurgeable({ ...base, email: "JRAYES000@GMAIL.COM", lastLoginAt: M13 }, NOW), false);
});
