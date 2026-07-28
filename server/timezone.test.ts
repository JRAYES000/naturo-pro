/**
 * server/timezone.test.ts
 *
 * Ces tests fixent le contrat du fuseau applicatif. Ils sont volontairement écrits
 * avec des instants UTC connus : ils échouent si le process tourne dans un autre
 * fuseau (c'était précisément le bug — le calcul de créneaux suivait l'heure locale
 * du serveur, UTC en production, alors que les praticiens sont en France).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_TZ, zonedParts, zonedTimeToUtc, zonedDateKey, zonedTimeKey, zonedHour, zonedCivilDays,
} from "./timezone";

test("APP_TZ est le fuseau des praticiens, pas celui du fondateur", () => {
  assert.equal(APP_TZ, "Europe/Paris");
});

test("zonedParts — heure d'été (UTC+2)", () => {
  // 2026-07-15T12:00:00Z = 14h00 à Paris
  const p = zonedParts(Date.UTC(2026, 6, 15, 12, 0, 0));
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute], [2026, 7, 15, 14, 0]);
});

test("zonedParts — heure d'hiver (UTC+1)", () => {
  // 2026-01-15T12:00:00Z = 13h00 à Paris
  const p = zonedParts(Date.UTC(2026, 0, 15, 12, 0, 0));
  assert.deepEqual([p.hour, p.minute], [13, 0]);
});

test("zonedTimeToUtc — aller-retour en heure d'été", () => {
  const ms = zonedTimeToUtc(2026, 7, 15, 9, 30);
  assert.equal(new Date(ms).toISOString(), "2026-07-15T07:30:00.000Z"); // 9h30 Paris = 7h30 UTC
  assert.equal(zonedTimeKey(ms), "09:30");
});

test("zonedTimeToUtc — aller-retour en heure d'hiver", () => {
  const ms = zonedTimeToUtc(2026, 1, 15, 9, 30);
  assert.equal(new Date(ms).toISOString(), "2026-01-15T08:30:00.000Z"); // 9h30 Paris = 8h30 UTC
  assert.equal(zonedTimeKey(ms), "09:30");
});

test("zonedTimeToUtc — le jour du passage à l'heure d'été, 9h00 reste 9h00", () => {
  // Bascule 2026 : dimanche 29 mars, 02h00 → 03h00. La 2e passe corrige le décalage.
  const ms = zonedTimeToUtc(2026, 3, 29, 9, 0);
  assert.equal(zonedTimeKey(ms), "09:00");
  assert.equal(zonedDateKey(ms), "2026-03-29");
});

test("zonedTimeToUtc — le jour du passage à l'heure d'hiver, 9h00 reste 9h00", () => {
  // Bascule 2026 : dimanche 25 octobre, 03h00 → 02h00 (heure répétée).
  const ms = zonedTimeToUtc(2026, 10, 25, 9, 0);
  assert.equal(zonedTimeKey(ms), "09:00");
  assert.equal(zonedDateKey(ms), "2026-10-25");
});

test("zonedDateKey — un créneau de fin de soirée reste sur SON jour local", () => {
  // 23h30 à Paris le 15 juillet = 21h30 UTC le 15 → même jour ici.
  // Mais 00h30 le 16 juillet = 22h30 UTC le 15 : l'ancien toISOString().slice(0,10)
  // rangeait ce créneau sous le 15. C'est ce cas que le helper corrige.
  const minuitTrente = zonedTimeToUtc(2026, 7, 16, 0, 30);
  assert.equal(new Date(minuitTrente).toISOString().slice(0, 10), "2026-07-15"); // l'ancien comportement
  assert.equal(zonedDateKey(minuitTrente), "2026-07-16"); // le bon
});

test("zonedHour — heure locale et non celle du process", () => {
  assert.equal(zonedHour(Date.UTC(2026, 6, 15, 8, 0, 0)), 10); // 8h UTC = 10h Paris l'été
  assert.equal(zonedHour(Date.UTC(2026, 0, 15, 8, 0, 0)), 9); //  8h UTC =  9h Paris l'hiver
});

test("zonedCivilDays — énumère chaque jour civil une seule fois, bornes incluses", () => {
  const from = zonedTimeToUtc(2026, 7, 15, 23, 0);
  const to = zonedTimeToUtc(2026, 7, 18, 1, 0);
  const jours = zonedCivilDays(from, to).map((d) => `${d.year}-${d.month}-${d.day}`);
  assert.deepEqual(jours, ["2026-7-15", "2026-7-16", "2026-7-17", "2026-7-18"]);
});

test("zonedCivilDays — la bascule DST ne duplique ni ne saute un jour", () => {
  // Fenêtre à cheval sur le 29 mars 2026 (printemps) et sur le 25 octobre (automne).
  for (const [debut, fin, attendus] of [
    [zonedTimeToUtc(2026, 3, 28, 0, 30), zonedTimeToUtc(2026, 3, 30, 0, 30), 3],
    [zonedTimeToUtc(2026, 10, 24, 0, 30), zonedTimeToUtc(2026, 10, 26, 0, 30), 3],
  ] as Array<[number, number, number]>) {
    const jours = zonedCivilDays(debut, fin).map((d) => `${d.year}-${d.month}-${d.day}`);
    assert.equal(jours.length, attendus, jours.join(", "));
    assert.equal(new Set(jours).size, attendus, `doublon : ${jours.join(", ")}`);
  }
});

test("zonedCivilDays — weekday correspond à availability_slots.day_of_week (0=dimanche)", () => {
  const [jour] = zonedCivilDays(zonedTimeToUtc(2026, 7, 15, 12, 0), zonedTimeToUtc(2026, 7, 15, 12, 0));
  assert.equal(jour.weekday, 3); // 15 juillet 2026 = mercredi
});

test("zonedCivilDays — se termine toujours (fenêtre inversée → aucun jour)", () => {
  const jours = zonedCivilDays(zonedTimeToUtc(2026, 7, 18, 0, 0), zonedTimeToUtc(2026, 7, 15, 0, 0));
  assert.deepEqual(jours, []);
});
