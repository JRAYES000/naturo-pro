/**
 * Tests unitaires — server/routes/helpers/reminders.ts (helpers de temps TZ-aware).
 * Runner : node:test (intégré Node 24), lancé via `npm run test` (tsx --test).
 *
 * NB : l'import de ce module tire `storage` (ouverture de data.db). Les tests
 * tournent donc avec DB_DRIVER=sqlite (cf script `npm run test`).
 * Seuls les helpers déterministes (date injectable) sont couverts ici ; les
 * fonctions async dépendantes de `storage` relèvent de tests d'intégration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TZ, getLocalHour, getLocalDayKey, getLocalDayBounds } from "./reminders";

test("getLocalHour — heure locale Bucarest (UTC+2 en hiver)", () => {
  // 15 janv 2026 10:00 UTC → 12:00 à Bucarest
  assert.equal(getLocalHour(TZ, new Date(Date.UTC(2026, 0, 15, 10, 0, 0))), 12);
  // Minuit UTC → 02:00 local
  assert.equal(getLocalHour(TZ, new Date(Date.UTC(2026, 0, 15, 0, 0, 0))), 2);
});

test("getLocalHour — UTC+3 en été (EEST)", () => {
  // 15 juil 2026 10:00 UTC → 13:00 à Bucarest (heure d'été)
  assert.equal(getLocalHour(TZ, new Date(Date.UTC(2026, 6, 15, 10, 0, 0))), 13);
});

test("getLocalDayKey — format YYYY-MM-DD avec bascule de jour locale", () => {
  // 31 déc 2025 23:30 UTC → 01:30 le 1er janv 2026 à Bucarest
  assert.equal(getLocalDayKey(TZ, new Date(Date.UTC(2025, 11, 31, 23, 30, 0))), "2026-01-01");
  // Plein midi sans bascule
  assert.equal(getLocalDayKey(TZ, new Date(Date.UTC(2026, 2, 10, 12, 0, 0))), "2026-03-10");
});

test("getLocalDayBounds — fenêtre d'exactement 24h - 1ms, from < to", () => {
  const { from, to } = getLocalDayBounds(1);
  assert.ok(from < to);
  assert.equal(to - from, 86400000 - 1);
});

test("getLocalDayBounds — offset négatif accepté (jour passé)", () => {
  const today = getLocalDayBounds(0);
  const yesterday = getLocalDayBounds(-1);
  assert.ok(yesterday.from < today.from);
});
