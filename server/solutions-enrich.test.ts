import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichFiche, deriveForm, deriveCureDuration, SAFETY_OVERRIDES } from "./solutions-enrich";
import { DEFAULT_SOLUTIONS } from "./solutions-seed";
import { SOLUTION_CATEGORIES } from "@shared/solutions";

const get = (name: string) => {
  const f = DEFAULT_SOLUTIONS.find((s) => s.name === name)!;
  return enrichFiche(f, DEFAULT_SOLUTIONS);
};

test("enrichFiche — surcharges manuelles prioritaires sur la déduction", () => {
  assert.deepEqual(JSON.parse(get("Millepertuis").safety!), SAFETY_OVERRIDES["Millepertuis"]);
  // Probiotiques : « immunodépression » ne doit rien baliser.
  assert.equal(get("Probiotiques").safety, null);
});

test("enrichFiche — balisage déduit sur des cas connus", () => {
  assert.equal(JSON.parse(get("Ginkgo biloba").safety!).anticoagulant, "ci");
  assert.equal(JSON.parse(get("Gingembre").safety!).anticoagulant, "prudence");
  assert.equal(JSON.parse(get("Menthe poivrée (HE)").safety!).enfant, "ci");
});

test("enrichFiche — synergies citées dans la même catégorie", () => {
  assert.deepEqual(JSON.parse(get("Passiflore").synergies!), ["Mélisse", "Valériane"]);
  assert.deepEqual(JSON.parse(get("Tilleul (bourgeon)").synergies!), ["Figuier (bourgeon)"]);
});

test("deriveForm / deriveCureDuration", () => {
  assert.equal(deriveForm("Plante", "1 c. à café en infusion"), "Infusion");
  assert.equal(deriveForm("Fleur de Bach", null), "Élixir floral (gouttes)");
  assert.equal(deriveForm("Huile essentielle", "2 gouttes diluées en massage"), "Huile essentielle : voie cutanée diluée");
  assert.equal(deriveCureDuration("Extrait, cure de 4 à 6 semaines."), "Cure de 4 à 6 semaines");
  assert.equal(deriveCureDuration("Le soir."), null);
});

test("catalogue — noms uniques, catégories valides, précautions renseignées", () => {
  const names = DEFAULT_SOLUTIONS.map((s) => s.name.trim().toLowerCase());
  assert.equal(new Set(names).size, names.length);
  for (const s of DEFAULT_SOLUTIONS) {
    assert.ok((SOLUTION_CATEGORIES as readonly string[]).includes(s.category), s.name);
    assert.ok(s.contraindications.trim(), `${s.name} sans précautions`);
  }
  for (const name of Object.keys(SAFETY_OVERRIDES)) {
    assert.ok(DEFAULT_SOLUTIONS.some((s) => s.name === name), `surcharge orpheline : ${name}`);
  }
});
