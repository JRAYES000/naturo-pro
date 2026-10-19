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

test("buildMistralMessages — injecte la fiche cliente dans le system", () => {
  const msgs = buildMistralMessages([], "Q", { clientContext: "Fiche de la cliente : Marie, 42 ans." });
  assert.equal(msgs[0].role, "system");
  assert.ok(msgs[0].content.includes("Marie, 42 ans"));
});

test("streamNaturoAssistant : modèle du chat et arrêt transmis à OpenRouter", async () => {
  const { streamNaturoAssistant, CHAT_MODEL } = await import("./mistral");
  const realFetch = globalThis.fetch;
  const prevKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test";
  let body: any; let signal: AbortSignal | undefined;
  globalThis.fetch = (async (_url: any, init: any) => {
    body = JSON.parse(init.body); signal = init.signal;
    const sse = 'data: {"choices":[{"delta":{"content":"Bonjour"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    return new Response(sse, { status: 200 });
  }) as any;
  try {
    const ctrl = new AbortController();
    let out = "";
    for await (const d of streamNaturoAssistant([], "Salut", { signal: ctrl.signal })) out += d;
    assert.equal(out, "Bonjour");
    assert.equal(body.model, CHAT_MODEL);
    assert.equal(body.model, "deepseek/deepseek-v4.1-flash-1017");
    ctrl.abort();
    assert.equal(signal?.aborted, true);
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prevKey;
  }
});
