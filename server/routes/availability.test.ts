/**
 * Tests unitaires — validation serveur des disponibilités (Lot 5, QC Disponibilité).
 * Runner : node:test, lancé via `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWeeklySlots } from "./availability";
import { isDateBlocked } from "./public";
import { mapAnswersToClientFields } from "./anamnese";

test("validateWeeklySlots — plage inversée refusée", () => {
  const err = validateWeeklySlots([{ dayOfWeek: 1, startTime: "18:00", endTime: "09:00" }]);
  assert.ok(err && /fin/.test(err));
});

test("validateWeeklySlots — chevauchement le même jour refusé", () => {
  const err = validateWeeklySlots([
    { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: 2, startTime: "10:00", endTime: "14:00" },
  ]);
  assert.ok(err && /chevauchent/.test(err));
});

test("validateWeeklySlots — planning valide accepté (jours différents, plages jointives)", () => {
  assert.equal(validateWeeklySlots([
    { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: 1, startTime: "12:00", endTime: "18:00" },
    { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
  ]), null);
});

test("isDateBlocked — bornes incluses, hors période libre", () => {
  const blocked = [{ startDate: "2026-08-10", endDate: "2026-08-17" }];
  assert.equal(isDateBlocked("2026-08-10", blocked), true);
  assert.equal(isDateBlocked("2026-08-17", blocked), true);
  assert.equal(isDateBlocked("2026-08-18", blocked), false);
  assert.equal(isDateBlocked("2026-08-09", blocked), false);
});

test("mapAnswersToClientFields — mapping heuristique par libellé de question", () => {
  const questions = [
    { id: "q1", label: "Avez-vous des allergies ou intolérances connues ?" },
    { id: "q2", label: "Quels sont vos antécédents médicaux et traitements en cours ?" },
    { id: "q3", label: "Comment est votre sommeil ?" },
    { id: "q4", label: "Question sans rapport" },
  ];
  const mapped = mapAnswersToClientFields(questions, {
    q1: "Pollen, arachide",
    q2: "Hypothyroïdie traitée",
    q3: "Réveils fréquents",
    q4: "Peu importe",
  });
  assert.ok(mapped.allergies?.includes("Pollen, arachide"));
  assert.ok(mapped.antecedents?.includes("Hypothyroïdie"));
  assert.ok(mapped.lifestyleNotes?.includes("Réveils fréquents"));
  assert.ok(!JSON.stringify(mapped).includes("Peu importe"));
});

test("mapAnswersToClientFields — réponses vides ou tableaux gérés", () => {
  const questions = [{ id: "a", label: "Allergies ?" }];
  assert.deepEqual(
    mapAnswersToClientFields(questions, { a: "" }),
    { allergies: null, antecedents: null, lifestyleNotes: null },
  );
  const m = mapAnswersToClientFields(questions, { a: ["chats", "acariens"] });
  assert.ok(m.allergies?.includes("chats, acariens"));
});
