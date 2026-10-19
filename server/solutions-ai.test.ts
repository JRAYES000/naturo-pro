import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSolutionDraft, buildSolutionDraftMessages } from "./solutions-ai";

test("parseSolutionDraft — garde les champs utiles et les drapeaux valides", () => {
  const d = parseSolutionDraft(JSON.stringify({
    properties: "Calmante.",
    usageNotes: "Infusion le soir.",
    contraindications: "Déconseillée pendant la grossesse.",
    form: "Infusion",
    cureDuration: "3 semaines",
    safety: { grossesse: "ci", enfant: "peut-être", inconnu: "ci" },
  }))!;
  assert.equal(d.properties, "Calmante.");
  assert.deepEqual(d.safety, { grossesse: "ci" });
});

test("parseSolutionDraft — complète les drapeaux oubliés depuis le texte", () => {
  const d = parseSolutionDraft('```json\n{"properties":"x","contraindications":"Prudence avec les anticoagulants.","safety":{}}\n```')!;
  assert.deepEqual(d.safety, { anticoagulant: "prudence" });
});

test("parseSolutionDraft — réponse inexploitable = null", () => {
  assert.equal(parseSolutionDraft("désolé"), null);
  assert.equal(parseSolutionDraft("{}"), null);
});

test("buildSolutionDraftMessages — nom et catégorie transmis, sources exclues", () => {
  const m = buildSolutionDraftMessages("Mélisse", "Plante");
  assert.match(m[1].content, /Mélisse.*Plante/);
  assert.match(m[0].content, /Aucune source/);
});
