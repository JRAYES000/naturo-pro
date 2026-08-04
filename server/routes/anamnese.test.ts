/**
 * server/routes/anamnese.test.ts
 *
 * POST /api/public/anamnese/:token acceptait jusqu'ici n'importe quelles réponses,
 * y compris vides pour des questions marquées "required" — seule la validation
 * côté navigateur (AnamnesePublic.tsx) l'empêchait, contournable par un POST direct.
 * findMissingRequiredAnswers est le garde-fou serveur ; ces tests le couvrent
 * indépendamment d'Express/de la DB, comme clampSlotWindow dans public.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findMissingRequiredAnswers } from "./anamnese";

const QUESTIONS = [
  { id: "q1", required: true },
  { id: "q2", required: false },
  { id: "q3", required: true },
];

test("findMissingRequiredAnswers — toutes les réponses requises présentes → rien de manquant", () => {
  const missing = findMissingRequiredAnswers(QUESTIONS, { q1: "ok", q2: "", q3: ["a"] });
  assert.deepEqual(missing, []);
});

test("findMissingRequiredAnswers — réponse requise absente du tout → signalée", () => {
  const missing = findMissingRequiredAnswers(QUESTIONS, { q3: "ok" });
  assert.deepEqual(missing, ["q1"]);
});

test("findMissingRequiredAnswers — chaîne vide et tableau vide comptent comme manquants", () => {
  const missing = findMissingRequiredAnswers(QUESTIONS, { q1: "", q3: [] });
  assert.deepEqual(missing, ["q1", "q3"]);
});

test("findMissingRequiredAnswers — une question non requise vide n'est jamais signalée", () => {
  const missing = findMissingRequiredAnswers(QUESTIONS, { q1: "ok", q3: "ok" });
  assert.deepEqual(missing, []);
});

test("findMissingRequiredAnswers — une réponse à 0 (échelle) n'est pas vide", () => {
  const missing = findMissingRequiredAnswers([{ id: "q1", required: true }], { q1: 0 });
  assert.deepEqual(missing, []);
});

test("findMissingRequiredAnswers — aucune question requise → jamais de blocage", () => {
  const missing = findMissingRequiredAnswers([{ id: "q1", required: false }], {});
  assert.deepEqual(missing, []);
});
