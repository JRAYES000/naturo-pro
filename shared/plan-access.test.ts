/**
 * shared/plan-access.test.ts — modèle freemium à 2 niveaux (Lot 1, actions 4 et 6)
 *
 * Trois invariants : qui a l'accès complet, quelles routes sont payantes
 * (dont les 6 routes du critère de l'action 6), et la neutralisation des
 * champs santé de la fiche client sur le socle gratuit (décisions 5-6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasFullAccess, PAID_PATH_RE, sanitizeClientForPlan, stripClientHealthFields } from "./plan-access";

const NOW = 1_700_000_000_000;

test("hasFullAccess — abonné et essai en cours OUI ; essai expiré, free et suspended NON", () => {
  assert.equal(hasFullAccess({ plan: "active", trialEndsAt: null }, NOW), true);
  assert.equal(hasFullAccess({ plan: "trial", trialEndsAt: NOW + 1000 }, NOW), true);
  assert.equal(hasFullAccess({ plan: "trial", trialEndsAt: null }, NOW), true); // essai sans échéance = en cours
  assert.equal(hasFullAccess({ plan: "trial", trialEndsAt: NOW - 1000 }, NOW), false);
  assert.equal(hasFullAccess({ plan: "free", trialEndsAt: null }, NOW), false);
  assert.equal(hasFullAccess({ plan: "suspended", trialEndsAt: NOW + 1000 }, NOW), false);
  assert.equal(hasFullAccess(null, NOW), false);
});

test("PAID_PATH_RE — les 6 routes du critère de l'action 6 sont payantes, le socle gratuit jamais", () => {
  // Les 6 routes exactes du critère de Julien (e-mail du 04/08, action 6).
  for (const p of [
    "/api/invoices", "/api/programmes", "/api/anamnesis-templates",
    "/api/reminders/stats", "/api/email-templates", "/api/packages",
  ]) assert.equal(PAID_PATH_RE.test(p), true, `payant attendu : ${p}`);
  // Autres chemins payants (données de santé, IA, stats, Google, documents).
  for (const p of [
    "/api/programmes/12/pdf", "/api/discussions/3/messages", "/api/stats/overview",
    "/api/google/status", "/api/appointments/5/note", "/api/clients/7/notes",
    "/api/clients/7/documents", "/api/notes/9", "/api/documents/4/download",
    "/api/solutions", "/api/content/generate",
  ]) assert.equal(PAID_PATH_RE.test(p), true, `payant attendu : ${p}`);
  // Socle gratuit (décision 5) — jamais bloqué par le motif.
  for (const p of [
    "/api/clients", "/api/clients/7", "/api/appointments", "/api/appointments/5",
    "/api/categories", "/api/availability", "/api/auth/me", "/api/auth/me/export",
    "/api/public/marie/availability", "/api/profile", "/api/billing/create-checkout-session",
  ]) assert.equal(PAID_PATH_RE.test(p), false, `gratuit attendu : ${p}`);
});

test("sanitizeClientForPlan / stripClientHealthFields — champs santé neutralisés en gratuit, intacts en payant", () => {
  const fiche = {
    id: 1, firstName: "Julie", lastName: "Test", email: "j@t.fr", phone: "06",
    dateOfBirth: "1990-01-01", address: "1 rue A", allergies: "pollen",
    antecedents: "asthme", lifestyleNotes: "sport", penseBete: "rappeler",
  };
  const libre = sanitizeClientForPlan(fiche, false);
  assert.equal(libre.firstName, "Julie");
  assert.equal(libre.email, "j@t.fr");
  for (const f of ["dateOfBirth", "address", "allergies", "antecedents", "lifestyleNotes", "penseBete"] as const) {
    assert.equal(libre[f], null, `champ santé non neutralisé : ${f}`);
  }
  // Accès complet : la fiche part telle quelle (même référence, aucun champ touché).
  assert.equal(sanitizeClientForPlan(fiche, true), fiche);
  // Écriture : les champs santé sont retirés du corps en gratuit, conservés en payant.
  const body = { firstName: "Julie", allergies: "pollen", penseBete: "x" };
  assert.deepEqual(stripClientHealthFields(body, false), { firstName: "Julie" });
  assert.deepEqual(stripClientHealthFields(body, true), body);
});
