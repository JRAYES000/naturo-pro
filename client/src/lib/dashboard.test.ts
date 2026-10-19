import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPeriodeRange, getPreviousRange, deltaPct, apptsToClose, overdueInvoices, draftInvoices,
  groupByDay, dayHeading, untilLabel, fillLabel,
} from "./dashboard";

const NOW = new Date(2026, 9, 19, 12).getTime();
const NOW_D = new Date(Date.UTC(2026, 9, 19, 12));
const H = 3600000;
const DAY = 86400000;

test("périodes : courante, précédente, passage d'année", () => {
  assert.deepEqual(getPeriodeRange("mois_courant", NOW_D), { from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 10, 1) - 1 });
  assert.deepEqual(getPreviousRange("mois_courant", NOW_D), { from: Date.UTC(2026, 8, 1), to: Date.UTC(2026, 9, 1) - 1 });
  assert.deepEqual(getPreviousRange("mois_dernier", NOW_D), { from: Date.UTC(2026, 7, 1), to: Date.UTC(2026, 8, 1) - 1 });
  assert.deepEqual(getPreviousRange("annee", NOW_D), { from: Date.UTC(2025, 0, 1), to: Date.UTC(2026, 0, 1) - 1 });
  const jan = new Date(Date.UTC(2026, 0, 10));
  assert.deepEqual(getPreviousRange("mois_courant", jan), { from: Date.UTC(2025, 11, 1), to: Date.UTC(2026, 0, 1) - 1 });
});

test("deltaPct : base nulle = pas de comparaison", () => {
  assert.equal(deltaPct(150, 100), 50);
  assert.equal(deltaPct(50, 100), -50);
  assert.equal(deltaPct(10, 0), null);
});

test("RDV à clôturer : confirmés et finis seulement, plus récent d'abord", () => {
  const appts = [
    { id: 1, startAt: NOW - 3 * H, endAt: NOW - 2 * H, status: "confirmed" },
    { id: 2, startAt: NOW - 30 * H, endAt: NOW - 29 * H, status: "confirmed" },
    { id: 3, startAt: NOW - 3 * H, endAt: NOW - 2 * H, status: "completed" },
    { id: 4, startAt: NOW - 30 * 60000, endAt: NOW + 30 * 60000, status: "confirmed" },
    { id: 5, startAt: NOW - 3 * H, endAt: NOW - 2 * H, status: "cancelled" },
  ];
  assert.deepEqual(apptsToClose(appts, NOW).map((a) => a.id), [1, 2]);
});

test("factures en retard et brouillons", () => {
  const inv = [
    { id: 1, status: "issued", dueDate: NOW - DAY },
    { id: 2, status: "sent", dueDate: NOW + DAY },
    { id: 3, status: "paid", dueDate: NOW - DAY },
    { id: 4, status: "sent", dueDate: NOW - DAY, docType: "devis" },
    { id: 5, status: "issued", dueDate: null },
    { id: 6, status: "draft" },
  ];
  assert.deepEqual(overdueInvoices(inv, NOW).map((i) => i.id), [1]);
  assert.deepEqual(draftInvoices(inv).map((i) => i.id), [6]);
});

test("groupByDay et intitulés de jour", () => {
  const items = [{ startAt: NOW + H }, { startAt: NOW + 2 * H }, { startAt: NOW + DAY }, { startAt: NOW + 3 * DAY }];
  assert.deepEqual(groupByDay(items).map((g) => g.items.length), [2, 1, 1]);
  assert.equal(dayHeading(NOW + H, NOW), "Aujourd'hui");
  assert.equal(dayHeading(NOW + DAY, NOW), "Demain");
  assert.match(dayHeading(NOW + 3 * DAY, NOW), /jeudi 22 octobre/);
});

test("untilLabel et remplissage", () => {
  assert.equal(untilLabel(NOW + 25 * 60000, NOW + H, NOW), "dans 25 min");
  assert.equal(untilLabel(NOW + 125 * 60000, NOW + 3 * H, NOW), "dans 2 h 05");
  assert.equal(untilLabel(NOW + 2 * H, NOW + 3 * H, NOW), "dans 2 h");
  assert.equal(untilLabel(NOW - 60000, NOW + H, NOW), "en cours");
  assert.equal(fillLabel(3), "Semaine calme");
  assert.equal(fillLabel(16), "Semaine complète");
});
