import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveSafety, parseSafety, serializeSafety, parseList, serializeList,
  detectClientRisks, ageFromBirthDate, safetyAlerts, solutionsMentioned,
} from "./solutions";

test("deriveSafety — exclusion = ci, sinon prudence, par phrase", () => {
  assert.deepEqual(
    deriveSafety("Contre-indiqué avec les anticoagulants ; prudence en cas de troubles thyroïdiens. Grossesse/allaitement : avis requis."),
    { anticoagulant: "ci", thyroide: "prudence", grossesse: "prudence", allaitement: "prudence" },
  );
  assert.deepEqual(deriveSafety("Interdite enfant < 7 ans, épileptiques."), { enfant: "ci", epilepsie: "ci" });
  // « immunodépression » n'est pas un antidépresseur.
  assert.deepEqual(deriveSafety("Immunodépression sévère : avis médical."), {});
  assert.deepEqual(deriveSafety(null), {});
});

test("parseSafety / serializeSafety — tolérants et stables", () => {
  assert.deepEqual(parseSafety('{"grossesse":"ci","inconnu":"ci","enfant":"peut-etre"}'), { grossesse: "ci" });
  assert.deepEqual(parseSafety("pas du json"), {});
  assert.equal(serializeSafety({ enfant: "prudence", grossesse: "ci" }), '{"grossesse":"ci","enfant":"prudence"}');
  assert.equal(serializeSafety({}), null);
});

test("parseList / serializeList — dédoublonne et nettoie", () => {
  assert.equal(serializeList([" Mélisse ", "Mélisse", ""]), '["Mélisse"]');
  assert.deepEqual(parseList('["Mélisse", 3, " "]'), ["Mélisse"]);
  assert.equal(serializeList([]), null);
});

test("detectClientRisks — traitements, antécédents, âge", () => {
  const now = new Date(2026, 9, 19);
  const risks = detectClientRisks({
    currentTreatments: "KARDÉGIC 75 mg, LÉVOTHYROX 50 µg ; Xanax le soir",
    antecedents: "Épilepsie dans l'enfance",
    dateOfBirth: "2018-03-02",
  }, now);
  assert.deepEqual(risks.map((r) => r.key), ["enfant", "epilepsie", "anticoagulant", "sedatif", "thyroide"]);
  assert.deepEqual(risks.find((r) => r.key === "anticoagulant")!.reasons, ["kardegic"]);
  assert.deepEqual(risks.find((r) => r.key === "enfant")!.reasons, ["8 ans"]);
  // Un mot dans un autre mot ne déclenche rien (« tension » ≠ traitement).
  assert.deepEqual(detectClientRisks({ currentTreatments: "Aucun traitement" }, now), []);
});

test("ageFromBirthDate — années révolues", () => {
  const now = new Date(2026, 9, 19);
  assert.equal(ageFromBirthDate("2016-10-19", now), 10);
  assert.equal(ageFromBirthDate("2016-10-20", now), 9);
  assert.equal(ageFromBirthDate("19/10/2016", now), null);
});

test("safetyAlerts — contre-indications d'abord, seuls les critères demandés", () => {
  assert.deepEqual(
    safetyAlerts({ grossesse: "prudence", anticoagulant: "ci", thyroide: "prudence" }, ["grossesse", "anticoagulant"]),
    [{ key: "anticoagulant", level: "ci" }, { key: "grossesse", level: "prudence" }],
  );
});

test("solutionsMentioned — nom complet, nom sans parenthèse, pas de doublon court", () => {
  const all = [{ name: "Romarin" }, { name: "Romarin à cinéole (HE)" }, { name: "Lavande vraie (HE)" }, { name: "Thym" }];
  assert.deepEqual(
    solutionsMentioned(["Lavande vraie (HE) : 2 gouttes", "Romarin à cinéole en friction"], all).map((s) => s.name),
    ["Romarin à cinéole (HE)", "Lavande vraie (HE)"],
  );
  assert.deepEqual(solutionsMentioned(["Tisane de thym le soir"], all).map((s) => s.name), ["Thym"]);
});
