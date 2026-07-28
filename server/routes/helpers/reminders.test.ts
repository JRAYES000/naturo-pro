/**
 * Tests unitaires — server/routes/helpers/reminders.ts (helpers de temps TZ-aware).
 * Runner : node:test (intégré Node 24), lancé via `npm run test` (tsx --test).
 *
 * NB : l'import de ce module tire `storage` (ouverture de data.db). Les tests
 * tournent donc avec DB_DRIVER=sqlite (cf script `npm run test`).
 * Seuls les helpers déterministes (date injectable) sont couverts ici ; les
 * fonctions async dépendantes de `storage` relèvent de tests d'intégration.
 *
 * Ces tests encodaient auparavant Europe/Bucharest — le fuseau du fondateur, pas
 * celui des praticiens. Ils vérifient désormais Europe/Paris (cf. server/timezone.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TZ, getLocalHour, getLocalDayKey, getLocalDayBounds } from "./reminders";
import { zonedParts } from "../../timezone";

test("TZ — les crons suivent le fuseau des praticiens", () => {
  assert.equal(TZ, "Europe/Paris");
});

test("getLocalHour — heure locale Paris (UTC+1 en hiver)", () => {
  // 15 janv 2026 10:00 UTC → 11:00 à Paris
  assert.equal(getLocalHour(TZ, new Date(Date.UTC(2026, 0, 15, 10, 0, 0))), 11);
  // Minuit UTC → 01:00 local
  assert.equal(getLocalHour(TZ, new Date(Date.UTC(2026, 0, 15, 0, 0, 0))), 1);
});

test("getLocalHour — UTC+2 en été (CEST)", () => {
  // 15 juil 2026 10:00 UTC → 12:00 à Paris (heure d'été)
  assert.equal(getLocalHour(TZ, new Date(Date.UTC(2026, 6, 15, 10, 0, 0))), 12);
});

test("getLocalDayKey — format YYYY-MM-DD avec bascule de jour locale", () => {
  // 31 déc 2025 23:30 UTC → 00:30 le 1er janv 2026 à Paris
  assert.equal(getLocalDayKey(TZ, new Date(Date.UTC(2025, 11, 31, 23, 30, 0))), "2026-01-01");
  // Plein midi sans bascule
  assert.equal(getLocalDayKey(TZ, new Date(Date.UTC(2026, 2, 10, 12, 0, 0))), "2026-03-10");
});

test("getLocalDayBounds — borne basse à minuit local, borne haute 1 ms avant le lendemain", () => {
  const { from, to } = getLocalDayBounds(1);
  assert.ok(from < to);
  const debut = zonedParts(from, TZ);
  assert.deepEqual([debut.hour, debut.minute, debut.second], [0, 0, 0]);
  const fin = zonedParts(to + 1, TZ);
  assert.deepEqual([fin.hour, fin.minute, fin.second], [0, 0, 0]);
  // Une journée civile fait 24 h, sauf aux bascules DST (23 h ou 25 h).
  assert.ok([23, 24, 25].includes(Math.round((to + 1 - from) / 3600000)));
});

test("getLocalDayBounds — offset négatif accepté (jour passé)", () => {
  const today = getLocalDayBounds(0);
  const yesterday = getLocalDayBounds(-1);
  assert.ok(yesterday.from < today.from);
  assert.equal(yesterday.to + 1, today.from); // les journées s'enchaînent sans trou
});

test("getLocalDayBounds — les jours de bascule DST sont couverts exactement", () => {
  // Impossible d'injecter « aujourd'hui » ici (getLocalDayBounds lit Date.now()),
  // mais l'invariant qui compte est vérifiable : bornes = minuits locaux consécutifs.
  for (const offset of [0, 1, -1, 7]) {
    const { from, to } = getLocalDayBounds(offset);
    assert.deepEqual(zonedParts(from, TZ).hour, 0, `offset ${offset}`);
    assert.deepEqual(zonedParts(to + 1, TZ).hour, 0, `offset ${offset}`);
  }
});
