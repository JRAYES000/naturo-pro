/**
 * server/routes/public.test.ts
 *
 * Garde-fou de la borne de fenêtre des créneaux publics (clampSlotWindow).
 *
 * Sans cette borne, `GET /api/public/:slug/availability?to=999999999999999` faisait
 * tourner la boucle jour-par-jour des millions de fois — Node étant mono-thread, tout
 * le site gelait, sur une route publique non authentifiée. Si un de ces tests casse,
 * le déni de service est de retour.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clampSlotWindow } from "./public";

const DAY = 86400000;
const MAX_WINDOW = 90 * DAY;

test("clampSlotWindow — un `to` absurde est ramené à 90 jours (garde anti-DoS)", () => {
  const from = 1_700_000_000_000;
  const { to } = clampSlotWindow(from, 999_999_999_999_999, 21 * DAY);
  assert.equal(to, from + MAX_WINDOW);
  // La boucle appelante avance de 86400000 ms par tour : le nombre d'itérations
  // doit rester de l'ordre de la centaine, pas du million.
  assert.ok((to - from) / DAY <= 91);
});

test("clampSlotWindow — une fenêtre raisonnable passe intacte", () => {
  const from = 1_700_000_000_000;
  const to = from + 14 * DAY;
  assert.deepEqual(clampSlotWindow(from, to, 21 * DAY), { from, to });
});

test("clampSlotWindow — paramètres absents (NaN) → maintenant + span par défaut", () => {
  const before = Date.now();
  const { from, to } = clampSlotWindow(NaN, NaN, 21 * DAY);
  assert.ok(from >= before && from <= Date.now());
  assert.equal(to - from, 21 * DAY);
});

test("clampSlotWindow — `to` antérieur à `from` ne produit pas de fenêtre négative", () => {
  const from = 1_700_000_000_000;
  const { to } = clampSlotWindow(from, from - 10 * DAY, 7 * DAY);
  assert.equal(to, from); // boucle exécutée une seule fois, jamais zéro tour infini
});

test("clampSlotWindow — `from` non numérique ne contamine pas la borne haute", () => {
  const { from, to } = clampSlotWindow(Number("pas-un-nombre"), 999_999_999_999_999, 7 * DAY);
  assert.ok(Number.isFinite(from));
  assert.equal(to, from + MAX_WINDOW);
});

/**
 * LE test qui compte : la boucle appelante doit TOUJOURS se terminer.
 *
 * Borner seulement l'écart to−from ne suffit pas. Au-delà de ~1,21e24, l'ulp du
 * float64 dépasse 86400000 : `t += 86400000` ne fait plus avancer `t`, et
 * `from + 90 jours === from` — la borne « 90 jours » est satisfaite alors que la
 * boucle tourne à l'infini. Une seule requête publique gelait alors l'event loop
 * définitivement (pire que l'absence de borne, qui finissait par se terminer).
 */
test("clampSlotWindow — la boucle jour-par-jour se termine pour toute entrée hostile", () => {
  const HOSTILES = [
    1e30, 1e300, 1.3e24, 1.21e24, Number.MAX_VALUE,
    -1e30, 9e15, 8.64e15, -8.64e15, 999_999_999_999_999,
  ];
  for (const hostile of HOSTILES) {
    for (const [rawFrom, rawTo] of [[hostile, NaN], [hostile, hostile], [NaN, hostile], [hostile, 0]]) {
      const { from, to } = clampSlotWindow(rawFrom, rawTo, 21 * DAY);
      let tours = 0;
      // Réplique exacte de la boucle de /availability et de /manage/:token/slots.
      for (let t = from; t <= to; t += DAY) {
        if (++tours > 200) {
          assert.fail(`boucle non bornée pour from=${rawFrom} to=${rawTo} (clampé: ${from}..${to})`);
        }
      }
      assert.ok(tours <= 91, `${tours} tours pour from=${rawFrom} to=${rawTo}`);
    }
  }
});

// ─── Grille de créneaux ────────────────────────────────────────────────────────
// Ni POST /:slug/book ni POST /manage/:token/reschedule ne vérifiaient que le créneau
// demandé faisait partie de ceux réellement proposés : ils se contentaient du
// non-chevauchement. Un POST fabriqué plaçait donc un rendez-vous un dimanche à 3 h du
// matin. Les deux routes s'appuient désormais sur computeSlotsByDay — c'est donc ici
// que se joue « ce qui n'est pas proposé n'est pas réservable ».

import { computeSlotsByDay } from "./public";
import { zonedTimeToUtc, zonedDateKey } from "../timezone";

// Mercredi 15 juillet 2026, 09:00–12:00 heure de Paris.
const MERCREDI = { dayOfWeek: 3, startTime: "09:00", endTime: "12:00" };
const jourTest = () => {
  // La grille exclut tout créneau à moins de 2 h (minBookHorizon) : on vise loin devant.
  const dans30j = new Date(Date.now() + 30 * 86400000);
  while (dans30j.getUTCDay() !== 3) dans30j.setUTCDate(dans30j.getUTCDate() + 1);
  return { y: dans30j.getUTCFullYear(), m: dans30j.getUTCMonth() + 1, d: dans30j.getUTCDate() };
};

test("computeSlotsByDay — la grille suit l'heure d'ouverture saisie, en heure de Paris", () => {
  const { y, m, d } = jourTest();
  const debut = zonedTimeToUtc(y, m, d, 9, 0);
  const slots = computeSlotsByDay({
    avail: [MERCREDI], busy: [], from: debut, to: debut, durationMin: 60,
  });
  const heures = (slots[zonedDateKey(debut)] || []).map((iso) => zonedTimeKeyLocal(iso));
  // 09:00 → 12:00, séances d'1 h, pas de 30 min : dernier départ possible à 11:00.
  assert.deepEqual(heures, ["09:00", "09:30", "10:00", "10:30", "11:00"]);
});

test("computeSlotsByDay — rien en dehors des plages : nuit, et jour sans disponibilité", () => {
  const { y, m, d } = jourTest();
  const debut = zonedTimeToUtc(y, m, d, 9, 0);
  const slots = computeSlotsByDay({ avail: [MERCREDI], busy: [], from: debut, to: debut, durationMin: 60 });
  const proposes = slots[zonedDateKey(debut)] || [];
  assert.ok(!proposes.includes(new Date(zonedTimeToUtc(y, m, d, 3, 0)).toISOString()), "3 h du matin proposé");
  assert.ok(!proposes.includes(new Date(zonedTimeToUtc(y, m, d, 9, 7)).toISOString()), "créneau hors grille proposé");

  // Jeudi : aucune plage déclarée → aucun créneau.
  const jeudi = zonedTimeToUtc(y, m, d + 1, 9, 0);
  const vide = computeSlotsByDay({ avail: [MERCREDI], busy: [], from: jeudi, to: jeudi, durationMin: 60 });
  assert.deepEqual(vide[zonedDateKey(jeudi)] ?? [], []);
});

test("computeSlotsByDay — un créneau occupé disparaît de la grille", () => {
  const { y, m, d } = jourTest();
  const debut = zonedTimeToUtc(y, m, d, 9, 0);
  const occupe = zonedTimeToUtc(y, m, d, 10, 0);
  const slots = computeSlotsByDay({
    avail: [MERCREDI], busy: [[occupe, occupe + 3600000]], from: debut, to: debut, durationMin: 60,
  });
  const heures = (slots[zonedDateKey(debut)] || []).map((iso) => zonedTimeKeyLocal(iso));
  assert.ok(!heures.includes("10:00"), "le créneau occupé est encore proposé");
  assert.ok(!heures.includes("09:30"), "un créneau qui chevauche l'occupé est encore proposé");
  assert.ok(heures.includes("09:00") && heures.includes("11:00"));
});

function zonedTimeKeyLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
}
