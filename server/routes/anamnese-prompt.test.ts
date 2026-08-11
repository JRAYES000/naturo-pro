/**
 * server/routes/anamnese-prompt.test.ts — action 15 (Lot 2)
 *
 * buildProgrammePrompt est la seule pièce déterministe de la génération IA :
 * on verrouille que les réponses sont libellées par leur question, que les
 * réponses vides disparaissent, et que le cadre de sortie (sections markdown,
 * pas de prescription) est bien dans la consigne.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgrammePrompt } from "./anamnese";

const questions = [
  { id: "q1", label: "Motif principal" },
  { id: "q2", label: "Sommeil" },
  { id: "q3", label: "Stress" },
];

test("buildProgrammePrompt — réponses libellées par la question", () => {
  const p = buildProgrammePrompt({
    templateName: "Bilan de vitalité",
    questions,
    answers: { q1: "Fatigue", q2: ["Réveils nocturnes", "6h/nuit"], q3: 7 },
    clientFirstName: "Marie",
  });
  assert.ok(p.includes("Bilan de vitalité"));
  assert.ok(p.includes("pour Marie"));
  assert.ok(p.includes("- Motif principal : Fatigue"));
  assert.ok(p.includes("- Sommeil : Réveils nocturnes, 6h/nuit"));
  assert.ok(p.includes("- Stress : 7"));
});

test("buildProgrammePrompt — réponses vides omises, id inconnu conservé tel quel", () => {
  const p = buildProgrammePrompt({
    templateName: "T",
    questions,
    answers: { q1: "", q2: [], mystere: "valeur" },
  });
  assert.ok(!p.includes("Motif principal :"));
  assert.ok(!p.includes("Sommeil :"));
  assert.ok(p.includes("- mystere : valeur"));
});

test("buildProgrammePrompt — cadre de sortie présent (sections markdown, pas de prescription)", () => {
  const p = buildProgrammePrompt({ templateName: "T", questions: [], answers: { x: "y" } });
  assert.ok(p.includes("## "));
  assert.ok(/pas de prescription/i.test(p));
  assert.ok(/4 à 6 sections/i.test(p));
});
