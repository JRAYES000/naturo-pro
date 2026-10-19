import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, filterSolutions, countByCategory } from "./solutions-filter";

const BASE = [
  { name: "Mélisse", category: "Plante", properties: "Calmante, favorise l'endormissement", contraindications: "Déconseillée pendant la grossesse", usageNotes: "Infusion le soir" },
  { name: "Gingembre", category: "Plante", properties: "Anti-nauséeux", contraindications: "Prudence avec les anticoagulants", usageNotes: null },
  { name: "Magnésium", category: "Complément", properties: "Stress, sommeil", contraindications: "Insuffisance rénale", usageNotes: "Le soir" },
];

test("normalizeText — sans accents, minuscules, espaces réduits", () => {
  assert.equal(normalizeText("  Mélisse   ÉTÉ "), "melisse ete");
  assert.equal(normalizeText(null), "");
});

test("filterSolutions — recherche insensible aux accents", () => {
  assert.deepEqual(filterSolutions(BASE, { search: "melisse" }).map((s) => s.name), ["Mélisse"]);
  assert.deepEqual(filterSolutions(BASE, { search: "MAGNESIUM" }).map((s) => s.name), ["Magnésium"]);
});

test("filterSolutions — tous les mots tapés doivent apparaître", () => {
  assert.deepEqual(filterSolutions(BASE, { search: "soir infusion" }).map((s) => s.name), ["Mélisse"]);
});

test("filterSolutions — catégorie et précaution se cumulent avec la recherche", () => {
  assert.deepEqual(filterSolutions(BASE, { category: "Plante", precaution: "anticoagulant" }).map((s) => s.name), ["Gingembre"]);
  assert.deepEqual(filterSolutions(BASE, { search: "soir", precaution: "grossesse" }).map((s) => s.name), ["Mélisse"]);
  // La précaution ne cherche que dans les précautions : « sommeil » n'y est jamais.
  assert.equal(filterSolutions(BASE, { precaution: "sommeil" }).length, 0);
});

test("countByCategory — compte par catégorie", () => {
  assert.deepEqual(countByCategory(BASE), { Plante: 2, "Complément": 1 });
});
