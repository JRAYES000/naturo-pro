import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSitemapXml, buildRobotsTxt, buildMetaDescription } from "./static";

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

test("buildMetaDescription — cas complet (ville + spécialités) reste dans 140-160 caractères", () => {
  const desc = buildMetaDescription({ name: "Marie Dupont", city: "Lyon", specialties: '["Gestion du stress","Sommeil","Alimentation vivante"]' });
  assert.ok(desc.length >= 140 && desc.length <= 160, `longueur = ${desc.length}`);
  assert.match(desc, /^Marie Dupont — Naturopathe à Lyon\./);
  assert.match(desc, /Spécialités : Gestion du stress, Sommeil, Alimentation vivante/);
});

test("buildMetaDescription — fallback ville absente reste dans 140-160 caractères", () => {
  const desc = buildMetaDescription({ name: "Jean Martin", city: null, specialties: '["Iridologie"]' });
  assert.ok(desc.length >= 140 && desc.length <= 160, `longueur = ${desc.length}`);
  assert.doesNotMatch(desc, /Naturopathe à /);
});

test("buildMetaDescription — fallback spécialités vides reste dans 140-160 caractères", () => {
  const desc = buildMetaDescription({ name: "Sophie Bernard", city: "Nantes", specialties: "[]" });
  assert.ok(desc.length >= 140 && desc.length <= 160, `longueur = ${desc.length}`);
  assert.doesNotMatch(desc, /Spécialités/);
});

test("buildMetaDescription — fallback ville ET spécialités absentes reste dans 140-160 caractères", () => {
  const desc = buildMetaDescription({ name: "Paul Petit", city: null, specialties: null });
  assert.ok(desc.length >= 140 && desc.length <= 160, `longueur = ${desc.length}`);
});

test("buildMetaDescription — nom très long est tronqué proprement, jamais > 160", () => {
  const desc = buildMetaDescription({ name: "Marie-Alexandra de la Fontaine-Rousseau du Grand Pré", city: "Saint-Jean-de-la-Ruelle", specialties: '["Gestion du stress","Sommeil","Alimentation vivante","Hormones"]' });
  assert.ok(desc.length <= 160, `longueur = ${desc.length}`);
});

test("buildMetaDescription — JSON de spécialités invalide ne plante pas (fallback vide)", () => {
  const desc = buildMetaDescription({ name: "Claire Dubois", city: "Reims", specialties: "pas du json" });
  assert.ok(desc.length >= 140 && desc.length <= 160, `longueur = ${desc.length}`);
  assert.doesNotMatch(desc, /Spécialités/);
});

test("buildRobotsTxt — ligne Sitemap pointe vers la base fournie, sans double slash", () => {
  const txt = buildRobotsTxt("https://app.ecole-naturo.fr/");
  assert.match(txt, /Sitemap: https:\/\/app\.ecole-naturo\.fr\/sitemap\.xml/);
  assert.doesNotMatch(txt, /\.fr\/\/sitemap/);
});
