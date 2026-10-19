import { test } from "node:test";
import assert from "node:assert/strict";
import { clientStatus, matchesSearch, countByFilter, filterAndSort, clientsToCsv, relativeDay, type ApptInfo, type ListClient } from "./clients-list";

const NOW = new Date(2026, 9, 19, 12).getTime();
const DAY = 86400000;
const c = (id: number, firstName: string, lastName: string, extra: Partial<ListClient> = {}): ListClient =>
  ({ id, firstName, lastName, createdAt: NOW - id * DAY, ...extra });

const list = [
  c(1, "Hélène", "Dupré", { email: "helene@x.fr", phone: "06 12 34 56 78" }),
  c(2, "Marc", "Ében", { city: "Lyon" }),
  c(3, "Zoé", "Arnaud"),
  c(4, "Léa", "Martin", { archivedAt: NOW - DAY }),
];
const appts = new Map<number, ApptInfo>([
  [1, { lastApptAt: NOW - 10 * DAY, nextApptAt: NOW + 3 * DAY }],
  [2, { lastApptAt: NOW - 200 * DAY, nextApptAt: null }],
]);

test("statut : à venir, actif, à relancer, jamais vue", () => {
  assert.equal(clientStatus(appts.get(1), NOW), "upcoming");
  assert.equal(clientStatus(appts.get(2), NOW), "dormant");
  assert.equal(clientStatus({ lastApptAt: NOW - 5 * DAY, nextApptAt: null }, NOW), "active");
  assert.equal(clientStatus(undefined, NOW), "never");
});

test("recherche sans accents, multi-mots, téléphone sans espaces", () => {
  assert.ok(matchesSearch(list[0], "helene"));
  assert.ok(matchesSearch(list[0], "dupre hel"));
  assert.ok(matchesSearch(list[0], "0612345678"));
  assert.ok(matchesSearch(list[1], "lyon"));
  assert.ok(!matchesSearch(list[1], "helene"));
});

test("compteurs et filtres excluent les archivées sauf filtre dédié", () => {
  const counts = countByFilter(list, appts, NOW);
  assert.deepEqual(counts, { all: 3, upcoming: 1, active: 0, dormant: 1, never: 1, archived: 1 });
  const archived = filterAndSort(list, appts, { query: "", filter: "archived", sort: "name" }, NOW);
  assert.deepEqual(archived.map((x) => x.id), [4]);
});

test("tri par nom insensible aux accents, prochain RDV en tête", () => {
  const byName = filterAndSort(list, appts, { query: "", filter: "all", sort: "name" }, NOW);
  assert.deepEqual(byName.map((x) => x.id), [3, 1, 2]);
  const byNext = filterAndSort(list, appts, { query: "", filter: "all", sort: "nextAppt" }, NOW);
  assert.equal(byNext[0].id, 1);
});

test("export CSV : séparateur ;, formules neutralisées, BOM", () => {
  const csv = clientsToCsv([c(9, "=CMD()", "A;B")], new Map());
  assert.ok(csv.startsWith("﻿Prénom;Nom"));
  assert.ok(csv.includes("'=CMD();\"A;B\""));
});

test("date relative", () => {
  assert.equal(relativeDay(NOW + DAY, NOW), "demain");
  assert.equal(relativeDay(NOW - 3 * DAY, NOW), "il y a 3 jours");
  assert.equal(relativeDay(NOW - 200 * DAY, NOW), "il y a 7 mois");
});
