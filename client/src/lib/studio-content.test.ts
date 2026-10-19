import { test } from "node:test";
import assert from "node:assert/strict";
import { filterContentPosts, countByStatus, captionLength, countHashtags, slugify, pickRandom } from "./studio-content";

const POSTS = [
  { channel: "instagram", format: "carrousel", status: "brouillon", title: "Carrousel · Sommeil", body: "Mieux dormir avec la mélisse #sommeil", theme: "Sommeil" },
  { channel: "facebook", format: "post_groupe", status: "publie", title: "Post · Digestion", body: "Le gingembre et la digestion", theme: "Digestion" },
  { channel: "instagram", format: "reel", status: "a_publier", title: "Reel · Stress", body: "Trois respirations", theme: null },
];

test("filterContentPosts — statut, canal et recherche sans accents", () => {
  assert.equal(filterContentPosts(POSTS, { status: "all" }).length, 3);
  assert.deepEqual(filterContentPosts(POSTS, { status: "publie" }).map((p) => p.theme), ["Digestion"]);
  assert.equal(filterContentPosts(POSTS, { channel: "instagram" }).length, 2);
  assert.deepEqual(filterContentPosts(POSTS, { query: "MELISSE" }).map((p) => p.theme), ["Sommeil"]);
  assert.equal(filterContentPosts(POSTS, { query: "reel stress" }).length, 1);
  assert.equal(filterContentPosts(POSTS, { query: "reel digestion" }).length, 0);
});

test("countByStatus", () => {
  assert.deepEqual(countByStatus(POSTS), { all: 3, brouillon: 1, a_publier: 1, publie: 1 });
});

test("captionLength — limite Instagram 2200", () => {
  assert.deepEqual(captionLength("abc", "instagram"), { count: 3, limit: 2200, over: false });
  assert.equal(captionLength("x".repeat(2201), "instagram").over, true);
  assert.equal(captionLength("x".repeat(2201), "facebook").over, false);
});

test("countHashtags — ignore les titres markdown", () => {
  assert.equal(countHashtags("## Titre\nTexte #sommeil #naturopathie #bien_être"), 3);
});

test("slugify et pickRandom", () => {
  assert.equal(slugify("Jeûne intermittent !"), "jeune-intermittent");
  assert.equal(slugify("!!!", "carrousel"), "carrousel");
  assert.equal(pickRandom(["a", "b"], "a", () => 0), "b");
  assert.equal(pickRandom([], undefined), undefined);
});
