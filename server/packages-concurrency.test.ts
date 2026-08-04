/**
 * server/packages-concurrency.test.ts
 *
 * Le bouton "Utiliser une séance" envoyait `usedSessions: pkg.usedSessions + 1`
 * calculé côté client (lu, puis incrémenté, puis renvoyé) : deux clics quasi
 * simultanés (deux appareils, double-clic) partaient de la même valeur de
 * départ, une des deux consommations disparaissait silencieusement — mesuré
 * en direct : 2 appels concurrents → usedSessions = 1 au lieu de 2.
 *
 * storage.usePackageSession sérialise désormais lire+incrémenter par praticien
 * (même primitive que la numérotation de facture, cf. invoices-numbering.test.ts).
 * Ce test garde la régression : N appels concurrents doivent produire exactement
 * min(N, totalSessions) séances consommées, jamais moins.
 *
 * Crée et supprime son propre praticien/client/forfait : n'altère pas les
 * données existantes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "./storage";

let userId: number;
let clientId: number;

before(async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `pkg-test-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Forfait Test", slug: `pkg-test-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
  const c = await storage.createClient(userId, {
    firstName: "Test", lastName: "QA", email: null, phone: null, dateOfBirth: null,
    address: null, allergies: null, antecedents: null, lifestyleNotes: null, penseBete: null,
  } as any);
  clientId = c.id;
});

after(async () => {
  if (userId) await storage.deleteUserCascade(userId);
});

test("usePackageSession — 10 appels concurrents sur un forfait de 5 séances consomment exactement 5 séances", async () => {
  const pkg = await storage.createPackage({
    userId, clientId, name: "Forfait QA", totalSessions: 5, usedSessions: 0, priceCents: 0, notes: null,
  } as any);

  const resultats = await Promise.all(
    Array.from({ length: 10 }, () => storage.usePackageSession(pkg.id, userId)),
  );

  const reussites = resultats.filter((r) => r !== null);
  assert.equal(reussites.length, 5, "exactement 5 des 10 tentatives doivent réussir");

  const final = await storage.getPackage(pkg.id);
  assert.equal(final?.usedSessions, 5, "aucune séance perdue, aucune séance en trop");
});

test("usePackageSession — refuse un forfait déjà épuisé (renvoie null, ne décrémente pas sous zéro ni au-delà)", async () => {
  const pkg = await storage.createPackage({
    userId, clientId, name: "Forfait épuisé", totalSessions: 1, usedSessions: 1, priceCents: 0, notes: null,
  } as any);
  const resultat = await storage.usePackageSession(pkg.id, userId);
  assert.equal(resultat, null);
});

test("usePackageSession — refuse un forfait appartenant à un autre praticien", async () => {
  const now = Date.now();
  const autre = await storage.createUser({
    email: `pkg-test2-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Autre", slug: `pkg-test2-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  try {
    const pkg = await storage.createPackage({
      userId, clientId, name: "Forfait à moi", totalSessions: 5, usedSessions: 0, priceCents: 0, notes: null,
    } as any);
    const resultat = await storage.usePackageSession(pkg.id, autre.id);
    assert.equal(resultat, null);
  } finally {
    await storage.deleteUserCascade(autre.id);
  }
});
