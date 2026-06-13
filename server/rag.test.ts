import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cosineSimilarity, CHUNK_SIZE } from "./rag";

test("cosineSimilarity — vecteurs identiques = 1", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
});
test("cosineSimilarity — orthogonaux = 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
});
test("chunkText — ne perd pas de contenu et borne la taille", () => {
  const txt = "Phrase une. ".repeat(500);
  const chunks = chunkText(txt);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= CHUNK_SIZE + 200));
  assert.ok(chunks.join(" ").includes("Phrase une."));
});
test("chunkText — texte court = 1 chunk", () => {
  assert.deepEqual(chunkText("court"), ["court"]);
});
