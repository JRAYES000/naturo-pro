/**
 * Tests unitaires — client/src/lib/slide-canvas.ts (logique pure de mise en lignes).
 * Le rendu Canvas lui-même est navigateur ; on teste wrapLines + buildCaptionFile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapLines, buildCaptionFile, stripMarkdown } from "./slide-canvas";

// Mesure factice : 10 px par caractère (espaces compris).
const measure = (s: string) => s.length * 10;

test("wrapLines — coupe quand la ligne dépasse la largeur", () => {
  const lines = wrapLines(measure, "aaa bbb ccc ddd", 70); // 70px ≈ 7 caractères
  assert.deepEqual(lines, ["aaa bbb", "ccc ddd"]);
});

test("wrapLines — texte vide renvoie un tableau vide", () => {
  assert.deepEqual(wrapLines(measure, "", 100), []);
  assert.deepEqual(wrapLines(measure, "   ", 100), []);
});

test("wrapLines — un mot plus long que la largeur reste seul sur sa ligne", () => {
  const lines = wrapLines(measure, "court motbeaucouptroplong fin", 80);
  assert.equal(lines[0], "court");
  assert.equal(lines[1], "motbeaucouptroplong");
  assert.equal(lines[2], "fin");
});

test("buildCaptionFile — concatène légende puis hashtags", () => {
  const txt = buildCaptionFile({ slides: [], caption: "Bien dormir", hashtags: ["#Sommeil", "#Naturo"] });
  assert.ok(txt.includes("Bien dormir"));
  assert.ok(txt.includes("#Sommeil #Naturo"));
});

test("buildCaptionFile — sans hashtags, ne met que la légende", () => {
  const txt = buildCaptionFile({ slides: [], caption: "Juste une légende", hashtags: [] });
  assert.ok(txt.includes("Juste une légende"));
  assert.ok(!txt.includes("#"));
});

test("stripMarkdown — retire le gras ** et les autres marqueurs", () => {
  assert.equal(stripMarkdown("**Des ballonnements après les repas ?**"), "Des ballonnements après les repas ?");
  assert.equal(stripMarkdown("Le microbiote, ton **allié** silencieux"), "Le microbiote, ton allié silencieux");
  assert.equal(stripMarkdown("__gras__ et *italique* et `code`"), "gras et italique et code");
  assert.equal(stripMarkdown("## Titre"), "Titre");
});

test("stripMarkdown — n'altère pas un texte sans marqueur ni les underscores internes", () => {
  assert.equal(stripMarkdown("Ton ventre a des choses à te dire."), "Ton ventre a des choses à te dire.");
  assert.equal(stripMarkdown("marie_dupont"), "marie_dupont");
});
