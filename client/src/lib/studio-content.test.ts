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

test("dates — aller-retour input date ↔ timestamp à midi local", async () => {
  const { toDateInputValue, fromDateInputValue } = await import("./studio-content");
  const ms = fromDateInputValue("2026-10-31")!;
  assert.equal(new Date(ms).getHours(), 12);
  assert.equal(toDateInputValue(ms), "2026-10-31");
  assert.equal(fromDateInputValue("31/10/2026"), null);
  assert.equal(toDateInputValue(null), "");
});

test("buildMonthGrid — commence un lundi et couvre tout le mois", async () => {
  const { buildMonthGrid, dayKey } = await import("./studio-content");
  const g = buildMonthGrid(2026, 9); // octobre 2026 : 1er = jeudi
  assert.equal(g[0][0].getDay(), 1);
  assert.equal(dayKey(g[0][3]), "2026-10-01");
  const all = g.flat().map(dayKey);
  assert.ok(all.includes("2026-10-31"));
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(g.length, 5);
});

test("groupPostsByDay — sépare datés et non datés", async () => {
  const { groupPostsByDay, fromDateInputValue } = await import("./studio-content");
  const d = fromDateInputValue("2026-10-20");
  const { byDay, undated } = groupPostsByDay([{ publishedAt: d }, { publishedAt: d }, { publishedAt: null }]);
  assert.equal(byDay.get("2026-10-20")?.length, 2);
  assert.equal(undated.length, 1);
});
