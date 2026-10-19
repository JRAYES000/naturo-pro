import test from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_PRESETS, completeness, contrastRatio, primaryIsReadable, slugError, slugify, socialHref,
} from "./public-page";

test("socialHref — pseudo, @pseudo, domaine nu et URL complète", () => {
  assert.equal(socialHref("instagram", "@marie.naturo"), "https://www.instagram.com/marie.naturo");
  assert.equal(socialHref("instagram", "marie_naturo"), "https://www.instagram.com/marie_naturo");
  assert.equal(socialHref("instagram", "instagram.com/marie"), "https://instagram.com/marie");
  assert.equal(socialHref("facebook", "https://www.facebook.com/cabinet"), "https://www.facebook.com/cabinet");
  assert.equal(socialHref("website", "monsite.fr"), "https://monsite.fr/");
  assert.equal(socialHref("website", "  "), null);
  assert.equal(socialHref("instagram", "pas un pseudo !"), null);
  assert.equal(socialHref("website", "javascript:alert(1)"), null);
});

test("slugify et slugError", () => {
  assert.equal(slugify("Marie Dupré — Naturopathe"), "marie-dupre-naturopathe");
  assert.equal(slugError(slugify("Élodie")), null);
  assert.equal(slugError("ab"), "Au moins 3 caractères.");
  assert.equal(slugError("-abc"), "Ne doit pas commencer ni finir par un tiret.");
});

test("completeness — la bio compte à partir de la longueur recommandée", () => {
  const full = { name: "M", photoUrl: "x", bio: "a".repeat(300), city: "Lyon", phone: "06", specialties: ["Sommeil"] };
  assert.equal(completeness(full).pct, 100);
  const short = completeness({ ...full, bio: "courte" });
  assert.equal(short.pct, 83);
  assert.deepEqual(short.missing.map((m) => m.field), ["bio"]);
});

test("contraste — palettes proposées lisibles, couleur trop claire signalée", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("nope", "#ffffff"), null);
  for (const p of COLOR_PRESETS) assert.ok(primaryIsReadable(p.primary), p.name);
  assert.equal(primaryIsReadable("#f5f5a0"), false);
});
