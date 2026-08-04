/**
 * server/routes/appointments-conflict.test.ts
 *
 * Ni POST /api/appointments ni PATCH /api/appointments/:id ne vérifiaient qu'un
 * créneau ne chevauchait pas un rendez-vous existant — rien n'empêchait de créer
 * ou de déplacer un RDV en plein sur un autre. trouverConflit() est le garde-fou ;
 * test d'intégration comme invoices-numbering.test.ts (crée/supprime son propre
 * praticien, n'altère pas les données existantes).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";
import { trouverConflit } from "./appointments";

let userId: number;

before(async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `conflit-test-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Conflit Test", slug: `conflit-test-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
});

after(async () => {
  if (userId) await storage.deleteUserCascade(userId);
});

const H = 3600000;
function rdv(startAt: number, endAt: number, extra: Record<string, unknown> = {}) {
  return storage.createAppointment({
    userId, clientId: null, categoryId: null, startAt, endAt, status: "confirmed",
    clientFirstName: "Jeanne", clientLastName: "Dupont", clientEmail: null, clientPhone: null,
    notesBefore: null, location: null, source: "manual",
    ...extra,
  } as any);
}

test("trouverConflit — un créneau qui chevauche un RDV existant est détecté", async () => {
  const base = Date.now() + 30 * 86400000;
  await rdv(base, base + H);
  const conflit = await trouverConflit(userId, base + 30 * 60000, base + H + 30 * 60000);
  assert.ok(conflit, "chevauchement partiel non détecté");
});

test("trouverConflit — deux créneaux consécutifs (fin == début) ne sont PAS en conflit", async () => {
  const base = Date.now() + 31 * 86400000;
  await rdv(base, base + H);
  const conflit = await trouverConflit(userId, base + H, base + 2 * H);
  assert.equal(conflit, null);
});

test("trouverConflit — un créneau totalement séparé n'est pas en conflit", async () => {
  const base = Date.now() + 32 * 86400000;
  await rdv(base, base + H);
  const conflit = await trouverConflit(userId, base + 5 * H, base + 6 * H);
  assert.equal(conflit, null);
});

test("trouverConflit — un RDV annulé n'est jamais un conflit", async () => {
  const base = Date.now() + 33 * 86400000;
  await rdv(base, base + H, { status: "cancelled" });
  const conflit = await trouverConflit(userId, base, base + H);
  assert.equal(conflit, null);
});

test("trouverConflit — excludeApptId ignore le RDV qu'on est en train d'éditer", async () => {
  const base = Date.now() + 34 * 86400000;
  const appt = await rdv(base, base + H);
  // On "édite" ce même RDV en le laissant sur le même créneau : pas de conflit avec lui-même.
  const conflit = await trouverConflit(userId, base, base + H, appt.id);
  assert.equal(conflit, null);
});

test("trouverConflit — n'est jamais déclenché par le RDV d'un AUTRE praticien", async () => {
  const now = Date.now();
  const autre = await storage.createUser({
    email: `conflit-test2-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Autre", slug: `conflit-test2-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  try {
    const base = Date.now() + 35 * 86400000;
    await storage.createAppointment({
      userId: autre.id, clientId: null, categoryId: null, startAt: base, endAt: base + H,
      status: "confirmed", clientFirstName: "Autre", clientLastName: "Praticien",
      clientEmail: null, clientPhone: null, notesBefore: null, location: null, source: "manual",
    } as any);
    const conflit = await trouverConflit(userId, base, base + H);
    assert.equal(conflit, null);
  } finally {
    await storage.deleteUserCascade(autre.id);
  }
});
