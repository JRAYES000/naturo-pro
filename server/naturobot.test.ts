import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSources, feedbackByMessage, searchSnippet } from "./naturobot";

test("buildSources : un document par entrée, extrait du premier passage, tronqué", () => {
  const docs = [{ id: 1, title: "Cours plantes" }, { id: 2, title: "Cours sommeil" }];
  const out = buildSources(
    [
      { documentId: 2, content: "La  valériane\n favorise l'endormissement." },
      { documentId: 2, content: "Autre passage" },
      { documentId: 1, content: "x".repeat(20) },
      { documentId: 9, content: "document supprimé" },
    ],
    docs,
    10,
  );
  assert.deepEqual(out, [
    { title: "Cours sommeil", excerpt: "La valéria…" },
    { title: "Cours plantes", excerpt: "xxxxxxxxxx…" },
  ]);
});

test("feedbackByMessage : le dernier avis gagne, 0 annule, métadonnées invalides ignorées", () => {
  const ev = (o: unknown) => ({ metadata: JSON.stringify(o) });
  const map = feedbackByMessage([
    ev({ messageId: 5, value: 1 }),
    ev({ messageId: 5, value: -1 }),
    ev({ messageId: 7, value: 1 }),
    ev({ messageId: 7, value: 0 }),
    { metadata: "{pas du json" },
    { metadata: null },
  ]);
  assert.deepEqual(map, { 5: -1 });
});

test("searchSnippet : extrait centré, ellipses, repli sans occurrence", () => {
  const text = "a".repeat(100) + " Millepertuis et pilule " + "b".repeat(100);
  const s = searchSnippet(text, "MILLEPERTUIS", 10);
  assert.ok(s.startsWith("…") && s.endsWith("…"));
  assert.ok(s.includes("Millepertuis"));
  assert.equal(searchSnippet("court", "absent", 10), "court");
});
