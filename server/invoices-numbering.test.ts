/**
 * server/invoices-numbering.test.ts
 *
 * Test d'intégration (SQLite) de la numérotation des factures.
 *
 * La numérotation séquentielle SANS doublon est une obligation légale française
 * (art. 242 nonies A du CGI). Deux régressions sont gardées ici :
 *
 *  1. CONCURRENCE — l'ancien compteur faisait un read-modify-write ; deux créations
 *     simultanées obtenaient le même numéro. Un premier correctif (incrément atomique
 *     + retry) ne suffisait pas : better-sqlite3 étant synchrone, N appels concurrents
 *     exécutaient leurs N incréments AVANT leurs N relectures, et tous lisaient la même
 *     valeur finale — mesuré à 8 numéros identiques sur 8.
 *  2. ANTIDATAGE — le compteur ne mémorisait qu'UNE année. Émettre une facture datée
 *     de l'exercice précédent (cas courant en janvier) écrasait le compteur de l'année
 *     en cours, qui repartait ensuite à 1 et entrait en collision.
 *
 * Crée et supprime son propre praticien : n'altère pas les données existantes.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "./storage";

let userId: number;

before(async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `fact-test-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Facture Test", slug: `fact-test-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
});

after(async () => {
  if (userId) await storage.deleteUserCascade(userId);
});

function brouillon(annee: number) {
  const now = Date.now();
  return {
    userId, status: "draft", issueDate: Date.UTC(annee, 5, 1), dueDate: null,
    appointmentId: null, clientId: null, clientFirstName: "A", clientLastName: "B",
    clientEmail: "", clientAddress: null, clientPostalCode: null, clientCity: null,
    subtotalCents: 100, vatCents: 0, totalCents: 100, vatRate: 0, vatEnabled: false,
    paymentMethod: null, paidAt: null, sentAt: null, notes: null,
    practitionerSnapshot: "{}", createdAt: now, updatedAt: now,
  };
}

test("numérotation séquentielle simple", async () => {
  const a = await storage.createInvoiceNumbered(2030, brouillon(2030) as any);
  const b = await storage.createInvoiceNumbered(2030, brouillon(2030) as any);
  assert.equal(a.number, "FACT-2030-0001");
  assert.equal(b.number, "FACT-2030-0002");
});

test("8 créations CONCURRENTES produisent 8 numéros distincts", async () => {
  const lot = await Promise.all(
    Array.from({ length: 8 }, () => storage.createInvoiceNumbered(2031, brouillon(2031) as any)),
  );
  const numeros = lot.map((i) => i.number);
  assert.equal(new Set(numeros).size, 8, `doublon(s) : ${numeros.sort().join(" ")}`);
});

test("une facture antidatée reprend la suite de SON année, sans perturber l'année en cours", async () => {
  await storage.createInvoiceNumbered(2032, brouillon(2032) as any); // FACT-2032-0001
  await storage.createInvoiceNumbered(2033, brouillon(2033) as any); // FACT-2033-0001
  // En janvier 2033, on facture des séances de décembre 2032 :
  const antidatee = await storage.createInvoiceNumbered(2032, brouillon(2032) as any);
  assert.equal(antidatee.number, "FACT-2032-0002");
  // …et l'année en cours continue normalement (l'ancien compteur repartait à 1 ici).
  const suivante = await storage.createInvoiceNumbered(2033, brouillon(2033) as any);
  assert.equal(suivante.number, "FACT-2033-0002");
});

test("le numéro est unique PAR praticien, pas globalement", async () => {
  const now = Date.now();
  const autre = await storage.createUser({
    email: `fact-test2-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Autre", slug: `fact-test2-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  try {
    const sien = await storage.createInvoiceNumbered(2030, { ...brouillon(2030), userId: autre.id } as any);
    assert.equal(sien.number, "FACT-2030-0001"); // même numéro qu'un autre praticien : normal
  } finally {
    await storage.deleteUserCascade(autre.id);
  }
});
