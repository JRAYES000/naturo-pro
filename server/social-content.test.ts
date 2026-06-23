/**
 * Tests unitaires — server/social-content.ts (helpers purs du Studio contenu).
 * Aucun appel réseau. Runner : node:test (`npm test`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_SYSTEM_PROMPT, FORMAT_TEMPLATES, buildBookingCta, buildContentMessages,
  rankThemes, buildAnglesPrompt, type ContentFormat,
  buildSlideStructuringPrompt, buildBackgroundPrompt, splitSlidesFromText,
} from "./social-content";

test("FORMAT_TEMPLATES — les 5 formats sont définis et non vides", () => {
  const formats: ContentFormat[] = ["carrousel", "reel", "story", "post_groupe", "legende"];
  for (const f of formats) assert.ok(FORMAT_TEMPLATES[f] && FORMAT_TEMPLATES[f].length > 10);
});

test("buildBookingCta — slug + page active → contient l'URL /p/{slug}", () => {
  const cta = buildBookingCta({ slug: "marie-dupont", publicPageEnabled: true });
  assert.ok(cta.includes("/p/marie-dupont"));
});

test("buildBookingCta — page désactivée → repli sans lien inventé", () => {
  const cta = buildBookingCta({ slug: "marie-dupont", publicPageEnabled: false });
  assert.ok(!cta.includes("/p/marie-dupont"));
  assert.ok(/page publique/i.test(cta));
});

test("buildContentMessages — system en 1er, persona + voix + format + CTA présents", () => {
  const msgs = buildContentMessages({
    channel: "instagram", format: "carrousel", topic: "Sommeil",
    voice: { name: "Marie", specialties: '["Sommeil","Stress"]', city: "Lyon", marketingTone: null, marketingAudience: null, slug: "marie", publicPageEnabled: true },
  });
  assert.equal(msgs[0].role, "system");
  assert.ok(msgs[0].content.includes(CONTENT_SYSTEM_PROMPT.slice(0, 30)));
  assert.ok(msgs[0].content.includes("Marie"));
  assert.ok(msgs[0].content.includes("Sommeil, Stress"));
  assert.ok(msgs[0].content.includes("CARROUSEL"));
  assert.ok(msgs[0].content.includes("/p/marie"));
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, "user");
  assert.ok(last.content.includes("Sommeil"));
  assert.ok(last.content.includes("Instagram"));
});

test("buildContentMessages — injecte les extraits RAG quand fournis", () => {
  const msgs = buildContentMessages({
    channel: "facebook", format: "legende", topic: "Détox",
    voice: { name: "Marie", specialties: "[]", city: null, marketingTone: null, marketingAudience: null, slug: "marie", publicPageEnabled: true },
    contextChunks: ["le foie est un émonctoire"],
  });
  assert.ok(msgs[0].content.includes("le foie est un émonctoire"));
});

test("rankThemes — filtre les vides, trie décroissant, limite à 5", () => {
  const ranked = rankThemes([
    { theme: "Sommeil", count: 3 },
    { theme: null, count: 99 },
    { theme: "  ", count: 50 },
    { theme: "Digestion", count: 7 },
    { theme: "Stress", count: 1 },
  ]);
  assert.deepEqual(ranked.map((r) => r.theme), ["Digestion", "Sommeil", "Stress"]);
});

test("buildAnglesPrompt — mentionne les thèmes et demande du JSON", () => {
  const p = buildAnglesPrompt(["Sommeil", "Stress"], { name: "Marie" });
  assert.ok(p.includes("Sommeil"));
  assert.ok(p.includes("Stress"));
  assert.ok(/json/i.test(p));
});

test("suggestContentAngles — repli déterministe sans clé API", async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { suggestContentAngles } = await import("./social-content");
    const angles = await suggestContentAngles(["Sommeil", "Digestion"], { name: "Marie" });
    assert.equal(angles.length, 2);
    assert.equal(angles[0].suggestedFormat, "carrousel");
    assert.ok(angles[0].title.includes("Sommeil"));
  } finally {
    if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev;
  }
});

test("buildContentMessages — applique les tons/audience par défaut quand vides", () => {
  const msgs = buildContentMessages({
    channel: "instagram", format: "reel", topic: "Énergie",
    voice: { name: "Marie", specialties: "[]", city: null, marketingTone: null, marketingAudience: null, slug: "marie", publicPageEnabled: true },
  });
  assert.ok(msgs[0].content.includes("chaleureux, accessible et incarné"));
  assert.ok(msgs[0].content.includes("des femmes qui cherchent à retrouver énergie et équilibre au naturel"));
});

test("buildContentMessages — injecte le template du format choisi (les 5)", () => {
  const formats: ContentFormat[] = ["carrousel", "reel", "story", "post_groupe", "legende"];
  for (const f of formats) {
    const msgs = buildContentMessages({
      channel: "facebook", format: f, topic: "Test",
      voice: { name: "Marie", specialties: "[]", city: null, marketingTone: null, marketingAudience: null, slug: "marie", publicPageEnabled: true },
    });
    assert.ok(msgs[0].content.includes(FORMAT_TEMPLATES[f]), `template manquant pour le format ${f}`);
  }
});

// ── Carrousels en images ────────────────────────────────────────────────────

test("buildSlideStructuringPrompt — exige du JSON et inclut le texte source", () => {
  const p = buildSlideStructuringPrompt("Slide 1\nMon accroche");
  assert.ok(/json/i.test(p));
  assert.ok(p.includes("\"slides\""));
  assert.ok(p.includes("Mon accroche"));
});

test("buildBackgroundPrompt — interdit tout texte et reprend le thème", () => {
  const p = buildBackgroundPrompt("Sommeil & insomnie", { marketingTone: "apaisant", specialties: null });
  assert.ok(p.includes("Sommeil & insomnie"));
  assert.ok(/AUCUN TEXTE/.test(p));
  assert.ok(/4:5/.test(p));
});

test("splitSlidesFromText — découpe les « Slide N » et isole légende + hashtags", () => {
  const text = [
    "Slide 1 : Ton sommeil te joue des tours ?",
    "Slide 2 : Le soir, on ralentit.",
    "Respiration lente recommandée.",
    "LÉGENDE : Et si on dormait mieux ? À toi de jouer.",
    "#Sommeil #Naturopathie #BienÊtre",
  ].join("\n");
  const deck = splitSlidesFromText(text);
  assert.equal(deck.slides.length, 2);
  assert.equal(deck.slides[0].title, "Ton sommeil te joue des tours ?");
  assert.equal(deck.slides[1].title, "Le soir, on ralentit.");
  assert.ok(deck.slides[1].body.includes("Respiration lente"));
  assert.ok(deck.caption.includes("dormait mieux"));
  assert.ok(!/#/.test(deck.caption)); // hashtags retirés de la légende
  assert.deepEqual(deck.hashtags, ["#Sommeil", "#Naturopathie", "#BienÊtre"]);
});

test("splitSlidesFromText — repli sur une slide unique si aucun marqueur", () => {
  const deck = splitSlidesFromText("Juste une ligne de contenu.");
  assert.equal(deck.slides.length, 1);
  assert.equal(deck.slides[0].title, "Juste une ligne de contenu.");
  assert.deepEqual(deck.hashtags, []);
});
