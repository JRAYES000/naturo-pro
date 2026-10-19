import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, filterSolutions, countByCategory } from "./solutions-filter";

const BASE = [
  { name: "Mélisse", category: "Plante", properties: "Calmante, favorise l'endormissement", contraindications: "Déconseillée pendant la grossesse", usageNotes: "Infusion le soir", safety: '{"grossesse":"ci"}' },
  { name: "Gingembre", category: "Plante", properties: "Anti-nauséeux", contraindications: "Prudence avec les anticoagulants", usageNotes: null, safety: '{"anticoagulant":"prudence"}' },
  { name: "Magnésium", category: "Complément", properties: "Stress, sommeil", contraindications: "Insuffisance rénale", usageNotes: "Le soir", safety: null },
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

test("filterSolutions — profil : masque les contre-indiquées, garde la prudence", () => {
  assert.deepEqual(filterSolutions(BASE, { profile: ["grossesse"] }).map((s) => s.name), ["Gingembre", "Magnésium"]);
  assert.deepEqual(filterSolutions(BASE, { profile: ["anticoagulant"] }).map((s) => s.name), ["Mélisse", "Gingembre", "Magnésium"]);
  assert.deepEqual(filterSolutions(BASE, { category: "Plante", profile: ["grossesse"], search: "nause" }).map((s) => s.name), ["Gingembre"]);
});

test("countByCategory — compte par catégorie", () => {
  assert.deepEqual(countByCategory(BASE), { Plante: 2, "Complément": 1 });
});
