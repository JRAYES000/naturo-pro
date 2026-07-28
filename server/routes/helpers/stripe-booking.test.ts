/**
 * server/routes/helpers/stripe-booking.test.ts
 *
 * Test d'intégration (SQLite) du chemin « acompte Stripe payé → rendez-vous ».
 *
 * Le scénario qui compte est celui de la RÉSURRECTION : l'idempotence reposait sur
 * l'existence d'un rendez-vous portant le stripe_session_id, alors que la suppression
 * d'un rendez-vous est physique. Supprimer un RDV réglé par acompte effaçait la seule
 * trace, et le rattrapage périodique le recréait — nouvel événement Google Agenda et
 * second email au client — toutes les 30 min pendant 48 h. Si ce test casse, le
 * marqueur durable (stripe_processed_sessions) a été contourné.
 *
 * Crée et supprime son propre praticien : n'altère pas les données existantes.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../../storage";
import { creerRdvDepuisSessionPayee } from "./stripe-booking";

let userId: number;
let categoryId: number;

before(async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `stripe-test-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Stripe Test", slug: `stripe-test-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
  const c = await storage.createCategory({
    userId, name: "Consultation", durationMinutes: 60, priceCents: 5000,
  } as any);
  categoryId = c.id;
});

after(async () => {
  if (userId) await storage.deleteUserCascade(userId);
});

function sessionPayee(suffixe: string, startAt: number) {
  return {
    id: `cs_test_${suffixe}`,
    payment_status: "paid",
    amount_total: 2500,
    metadata: {
      userId: String(userId), categoryId: String(categoryId), startAt: String(startAt),
      firstName: "Jean", lastName: "Dupont", email: "", phone: "0600000000",
      notes: "", depositCents: "2500",
    },
  };
}

test("une session payée crée le rendez-vous une seule fois", async () => {
  const s = sessionPayee(`unique-${Date.now()}`, Date.now() + 7 * 86400000);
  const premier = await creerRdvDepuisSessionPayee({ id: userId }, s);
  assert.equal(premier.statut, "cree");
  const rejeu = await creerRdvDepuisSessionPayee({ id: userId }, s);
  assert.equal(rejeu.statut, "deja_traitee");
});

test("un rendez-vous supprimé n'est PAS ressuscité par le rattrapage", async () => {
  const s = sessionPayee(`resurrection-${Date.now()}`, Date.now() + 8 * 86400000);
  const cree = await creerRdvDepuisSessionPayee({ id: userId }, s);
  assert.equal(cree.statut, "cree");

  // La praticienne supprime le RDV : suppression PHYSIQUE de la ligne.
  await storage.deleteAppointment((cree as any).appointmentId);
  assert.equal(await storage.getAppointmentByStripeSessionId(s.id), undefined);

  // Le rattrapage repasse (la session reste "paid" chez Stripe, même remboursée).
  const rattrapage = await creerRdvDepuisSessionPayee({ id: userId }, s);
  assert.equal(rattrapage.statut, "deja_traitee", "le RDV supprimé a été recréé");
});

test("deux exécutions concurrentes sur la même session ne créent qu'un rendez-vous", async () => {
  const s = sessionPayee(`course-${Date.now()}`, Date.now() + 9 * 86400000);
  const resultats = await Promise.all([
    creerRdvDepuisSessionPayee({ id: userId }, s),
    creerRdvDepuisSessionPayee({ id: userId }, s),
    creerRdvDepuisSessionPayee({ id: userId }, s),
  ]);
  assert.equal(resultats.filter((r) => r.statut === "cree").length, 1, JSON.stringify(resultats));
});

test("une session sans metadata exploitable ne crée rien", async () => {
  const r = await creerRdvDepuisSessionPayee({ id: userId }, {
    id: `cs_test_vide-${Date.now()}`, payment_status: "paid", metadata: {},
  });
  assert.equal(r.statut, "donnees_invalides");
});
