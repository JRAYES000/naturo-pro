/**
 * Tests unitaires — server/mistral.ts (constructeur de messages).
 * Aucun appel réseau : on teste uniquement buildMistralMessages (fonction pure).
 * Runner : node:test (`npm test`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMistralMessages, SYSTEM_PROMPT, MAX_HISTORY, type ChatTurn } from "./mistral";

test("buildMistralMessages — le 1er message est le system prompt", () => {
  const msgs = buildMistralMessages([], "Bonjour");
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[0].content, SYSTEM_PROMPT);
});

test("buildMistralMessages — le message utilisateur est ajouté en dernier", () => {
  const history: ChatTurn[] = [
    { role: "user", content: "Q1" },
    { role: "assistant", content: "R1" },
  ];
  const msgs = buildMistralMessages(history, "Q2");
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, "user");
  assert.equal(last.content, "Q2");
  assert.equal(msgs.length, 4); // system + 2 historique + user
});

test("buildMistralMessages — tronque l'historique aux MAX_HISTORY derniers tours", () => {
  const history: ChatTurn[] = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  })) as ChatTurn[];
  const msgs = buildMistralMessages(history, "fin");
  assert.equal(msgs.length, 1 + MAX_HISTORY + 1); // system + MAX_HISTORY + user
  // Le plus ancien tour conservé doit être history[length - MAX_HISTORY]
  assert.equal(msgs[1].content, history[history.length - MAX_HISTORY].content);
});

test("buildMistralMessages — injecte les instructions du formateur dans le system", () => {
  const msgs = buildMistralMessages([], "Q", { customInstructions: "Toujours tutoyer." });
  assert.equal(msgs[0].role, "system");
  assert.ok(msgs[0].content.includes("Toujours tutoyer."));
});

test("buildMistralMessages — injecte les extraits de contexte RAG dans le system", () => {
  const msgs = buildMistralMessages([], "Q", { contextChunks: ["extrait A", "extrait B"] });
  assert.ok(msgs[0].content.includes("extrait A"));
  assert.ok(msgs[0].content.includes("extrait B"));
});
