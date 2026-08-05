import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSitemapXml, buildRobotsTxt } from "./static";

test("buildSitemapXml — accueil toujours présent, sans lastmod", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", []);
  assert.match(xml, /<loc>https:\/\/app\.ecole-naturo\.fr\/<\/loc>/);
  assert.equal((xml.match(/<url>/g) || []).length, 1);
});

test("buildSitemapXml — une entrée par page praticien active, avec lastmod réel", () => {
  const createdAt = Date.UTC(2026, 0, 15); // 2026-01-15
  const xml = buildSitemapXml("https://app.ecole-naturo.fr/", [{ slug: "marie-dupont", createdAt }]);
  assert.match(xml, /<loc>https:\/\/app\.ecole-naturo\.fr\/p\/marie-dupont<\/loc>/);
  assert.match(xml, /<lastmod>2026-01-15<\/lastmod>/);
  assert.equal((xml.match(/<url>/g) || []).length, 2);
});

test("buildSitemapXml — un slash final sur `base` n'aboutit pas à un double slash", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr/", []);
  assert.doesNotMatch(xml, /\.fr\/\//);
});

test("buildSitemapXml — un slug est échappé (XML valide même avec des caractères spéciaux)", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", [{ slug: "a&b", createdAt: 0 }]);
  assert.match(xml, /<loc>https:\/\/app\.ecole-naturo\.fr\/p\/a&amp;b<\/loc>/);
});

test("buildRobotsTxt — autorise / et /p/, bloque les zones privées, pour * et les crawlers IA", () => {
  const txt = buildRobotsTxt("https://app.ecole-naturo.fr");
  assert.match(txt, /User-agent: \*\nAllow: \/\nAllow: \/p\//);
  assert.match(txt, /Disallow: \/app\//);
  assert.match(txt, /Disallow: \/admin\//);
  assert.match(txt, /Disallow: \/manage\//);
  assert.match(txt, /Disallow: \/anamnese\//);
  assert.match(txt, /User-agent: GPTBot/);
  assert.match(txt, /User-agent: ClaudeBot/);
});

test("buildRobotsTxt — ligne Sitemap pointe vers la base fournie, sans double slash", () => {
  const txt = buildRobotsTxt("https://app.ecole-naturo.fr/");
  assert.match(txt, /Sitemap: https:\/\/app\.ecole-naturo\.fr\/sitemap\.xml/);
  assert.doesNotMatch(txt, /\.fr\/\/sitemap/);
});
