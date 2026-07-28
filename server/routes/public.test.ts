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
