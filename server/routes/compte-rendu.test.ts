/**
 * server/routes/compte-rendu.test.ts — action 14 (Lot 2)
 *
 * Verrouille la projection note → sections du PDF client :
 * champs vides omis, ordre stable, et surtout notesLibres JAMAIS transmis
 * (notes internes de la praticienne — même logique d'exclusion que les
 * champs santé de sanitizeClientForPlan).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compteRenduSections } from "./compte-rendu";

test("compteRenduSections — champs remplis dans l'ordre, vides omis", () => {
  const sections = compteRenduSections({
    motif: "Fatigue chronique",
    anamnese: "",
    bilan: "- Terrain acide\n- Sommeil non réparateur",
    conseilsAlimentaires: "Augmenter les légumes verts.",
    hygieneDeVie: null,
    suivi: "Point dans 3 semaines",
    notesLibres: "Cliente anxieuse, aborder doucement",
  });
  assert.deepEqual(sections.map((s) => s.section), [
    "Motif de consultation", "Bilan naturopathique", "Conseils alimentaires", "Suivi proposé",
  ]);
  assert.deepEqual(sections[1].items, ["Terrain acide", "Sommeil non réparateur"]);
});

test("compteRenduSections — notesLibres exclues quoi qu'il arrive", () => {
  const sections = compteRenduSections({ notesLibres: "SECRET" });
  assert.equal(sections.length, 0);
  assert.ok(!JSON.stringify(sections).includes("SECRET"));
});

test("compteRenduSections — note vide → aucune section", () => {
  assert.deepEqual(compteRenduSections({}), []);
});
