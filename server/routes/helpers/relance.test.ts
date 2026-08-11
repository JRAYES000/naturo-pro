/**
 * server/routes/helpers/relance.test.ts — action 17 (Lot 2)
 *
 * Éligibilité de la relance J+30 (clientsARelancer, fonction pure) :
 * fenêtre d'un jour, pas de relance si RDV futur, pas d'email → pas de relance,
 * RDV annulés ignorés. C'est la fenêtre qui rend l'envoi idempotent sans
 * marqueur en base — si elle casse, on spamme ou on n'envoie jamais.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientsARelancer, RELANCE_DAYS } from "./reminders";

const J = 86400000;
const NOW = 1_750_000_000_000;
const marie = { id: 1, firstName: "Marie", lastName: "Durand", email: "marie@ex.fr" };
const sansEmail = { id: 2, firstName: "Luc", lastName: "Roy", email: null };

test("clientsARelancer — dernier RDV à J+30 pile → relancé", () => {
  const appts = [{ clientId: 1, startAt: NOW - (RELANCE_DAYS + 0.5) * J, status: "completed" }];
  const out = clientsARelancer([marie], appts, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].client.id, 1);
});

test("clientsARelancer — hors fenêtre (J+29 et J+32) → rien", () => {
  assert.equal(clientsARelancer([marie], [{ clientId: 1, startAt: NOW - (RELANCE_DAYS - 1) * J, status: "completed" }], NOW).length, 0);
  assert.equal(clientsARelancer([marie], [{ clientId: 1, startAt: NOW - (RELANCE_DAYS + 2) * J, status: "completed" }], NOW).length, 0);
});

test("clientsARelancer — RDV futur planifié → pas de relance", () => {
  const appts = [
    { clientId: 1, startAt: NOW - (RELANCE_DAYS + 0.5) * J, status: "completed" },
    { clientId: 1, startAt: NOW + 5 * J, status: "confirmed" },
  ];
  assert.equal(clientsARelancer([marie], appts, NOW).length, 0);
});

test("clientsARelancer — RDV annulé/bloqué ignoré, client sans email filtré", () => {
  const appts = [
    { clientId: 1, startAt: NOW - (RELANCE_DAYS + 0.5) * J, status: "cancelled" },
    { clientId: 2, startAt: NOW - (RELANCE_DAYS + 0.5) * J, status: "completed" },
  ];
  assert.equal(clientsARelancer([marie, sansEmail], appts, NOW).length, 0);
});

test("clientsARelancer — c'est le DERNIER RDV qui compte, pas un ancien dans la fenêtre", () => {
  const appts = [
    { clientId: 1, startAt: NOW - (RELANCE_DAYS + 0.5) * J, status: "completed" },
    { clientId: 1, startAt: NOW - 2 * J, status: "completed" }, // revenu depuis
  ];
  assert.equal(clientsARelancer([marie], appts, NOW).length, 0);
});
