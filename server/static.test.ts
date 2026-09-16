import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import {
  buildSitemapXml, buildRobotsTxt, buildMetaDescription, buildLlmsTxt,
  applySeoHead, applySeoBody, applyNoindex, isSpaPath, registerSeoRoutes,
} from "./static";
import {
  citySlug, titleCase, isIndexable, missingForIndexing, groupByCity,
  MIN_PROFILES_PER_CITY, fitTitle, renderRegisterBody, renderHomeBody,
  renderDirectoryIndex, renderSoftwarePage, REGISTER_TITLE, renderLoginBody,
  LOGIN_TITLE, LOGIN_DESCRIPTION, REGISTER_DESCRIPTION, type SeoProfile,
} from "./seo-pages";

/** Compte les mots d'un fragment HTML (balises et entités retirées). */
function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length ? text.split(" ").length : 0;
}

/** Extrait le contenu de <title>…</title>. */
function extractTitle(html: string): string {
  return (html.match(/<title>([^<]*)<\/title>/) || [, ""])[1];
}

/** Profil complet, donc indexable. Les tests en dérivent par surcharge. */
function profile(over: Partial<SeoProfile> = {}): SeoProfile {
  return {
    slug: "marie-dupont",
    name: "Marie Dupont",
    city: "Lyon",
    address: "12 rue des Lilas",
    bio: "Naturopathe installée à Lyon depuis 2015, j'accompagne mes clients sur l'alimentation, le sommeil et la gestion du stress. ".repeat(3),
    photoUrl: "https://images.unsplash.com/photo-1",
    specialties: ["Gestion du stress", "Sommeil"],
    createdAt: Date.UTC(2026, 0, 15),
    publicPageUpdatedAt: null,
    isDemo: false,
    services: [{ name: "Bilan de vitalité", durationMinutes: 90, priceCents: 7000, description: null }],
    ...over,
  };
}

// ── A11 — critère d'indexation ────────────────────────────────────────────────

test("isIndexable — profil complet : oui", () => {
  assert.equal(isIndexable(profile()), true);
});

test("isIndexable — un compte de démo n'est jamais indexable (A7)", () => {
  assert.equal(isIndexable(profile({ isDemo: true })), false);
});

test("isIndexable — sans ville, sans spécialité, sans bio ou sans prestation : non", () => {
  assert.equal(isIndexable(profile({ city: null })), false);
  assert.equal(isIndexable(profile({ specialties: [] })), false);
  assert.equal(isIndexable(profile({ bio: "Trop court." })), false);
  assert.equal(isIndexable(profile({ services: [] })), false);
});

test("missingForIndexing — nomme précisément ce qui manque", () => {
  const missing = missingForIndexing(profile({ city: null, specialties: [] }));
  assert.equal(missing.length, 2);
  assert.match(missing.join(" "), /ville/);
  assert.match(missing.join(" "), /spécialité/);
  assert.deepEqual(missingForIndexing(profile()), []);
});

// ── A2 — seuil par ville ──────────────────────────────────────────────────────

test("groupByCity — une ville sous le seuil ne produit pas de page", () => {
  const profiles = Array.from({ length: MIN_PROFILES_PER_CITY - 1 }, (_, i) =>
    profile({ slug: `p${i}`, city: "Nantes" }));
  assert.equal(groupByCity(profiles).size, 0);
});

test("groupByCity — au seuil, la ville apparaît avec tous ses praticiens", () => {
  const profiles = Array.from({ length: MIN_PROFILES_PER_CITY }, (_, i) =>
    profile({ slug: `p${i}`, city: "Nantes" }));
  const cities = groupByCity(profiles);
  assert.equal(cities.size, 1);
  assert.equal(cities.get("nantes")?.profiles.length, MIN_PROFILES_PER_CITY);
});

test("groupByCity — les profils non indexables ne comptent pas dans le seuil", () => {
  const profiles = [
    ...Array.from({ length: MIN_PROFILES_PER_CITY }, (_, i) => profile({ slug: `p${i}`, city: "Nantes", bio: "court" })),
    profile({ slug: "ok", city: "Nantes" }),
  ];
  assert.equal(groupByCity(profiles).size, 0);
});

test("citySlug — sans accent ni caractère non-ASCII", () => {
  assert.equal(citySlug("Saint-Étienne"), "saint-etienne");
  assert.equal(citySlug("ST LEGER AUX BOIS"), "st-leger-aux-bois");
});

test("titleCase — corrige le tout-majuscules et le tout-minuscules, laisse la casse mixte", () => {
  assert.equal(titleCase("RAYES"), "Rayes");
  assert.equal(titleCase("nourmo"), "Nourmo");
  assert.equal(titleCase("Fanny Paret-Solet"), "Fanny Paret-Solet");
});

// ── A7 — sitemap ──────────────────────────────────────────────────────────────

test("buildSitemapXml — accueil et page produit toujours présents", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", []);
  assert.match(xml, /<loc>https:\/\/app\.ecole-naturo\.fr\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/app\.ecole-naturo\.fr\/logiciel-naturopathe<\/loc>/);
});

test("buildSitemapXml — un compte de démo est exclu (A7)", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", [profile({ isDemo: true })]);
  assert.doesNotMatch(xml, /marie-dupont/);
});

test("buildSitemapXml — une fiche incomplète est exclue (A11)", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", [profile({ city: null })]);
  assert.doesNotMatch(xml, /\/p\/marie-dupont/);
});

test("buildSitemapXml — lastmod suit la dernière modification réelle, pas la création", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", [
    profile({ publicPageUpdatedAt: Date.UTC(2026, 7, 10) }),
  ]);
  assert.match(xml, /<lastmod>2026-08-10<\/lastmod>/);
  assert.doesNotMatch(xml, /<lastmod>2026-01-15<\/lastmod>/);
});

test("buildSitemapXml — sans modification connue, lastmod retombe sur la création", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", [profile()]);
  assert.match(xml, /<lastmod>2026-01-15<\/lastmod>/);
});

test("buildSitemapXml — les pages ville au-dessus du seuil y figurent", () => {
  const profiles = Array.from({ length: MIN_PROFILES_PER_CITY }, (_, i) =>
    profile({ slug: `p${i}`, city: "Nantes" }));
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", profiles);
  assert.match(xml, /<loc>https:\/\/app\.ecole-naturo\.fr\/naturopathes\/nantes<\/loc>/);
});

test("buildSitemapXml — un slash final sur `base` n'aboutit pas à un double slash", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr/", []);
  assert.doesNotMatch(xml, /\.fr\/\//);
});

test("buildSitemapXml — un slug est échappé (XML valide même avec des caractères spéciaux)", () => {
  const xml = buildSitemapXml("https://app.ecole-naturo.fr", [profile({ slug: "a&b" })]);
  assert.match(xml, /<loc>https:\/\/app\.ecole-naturo\.fr\/p\/a&amp;b<\/loc>/);
});

// ── robots.txt et llms.txt ────────────────────────────────────────────────────

test("buildRobotsTxt — autorise /, /p/ et l'annuaire, bloque les zones privées", () => {
  const txt = buildRobotsTxt("https://app.ecole-naturo.fr");
  assert.match(txt, /User-agent: \*\nAllow: \/\nAllow: \/p\/\nAllow: \/naturopathes/);
  assert.match(txt, /Disallow: \/app\//);
  assert.match(txt, /Disallow: \/admin\//);
  assert.match(txt, /Disallow: \/manage\//);
  assert.match(txt, /Disallow: \/anamnese\//);
  assert.match(txt, /User-agent: GPTBot/);
  assert.match(txt, /User-agent: ClaudeBot/);
});

test("buildLlmsTxt — décrit le produit et liste les fiches indexables (A12)", () => {
  const txt = buildLlmsTxt("https://app.ecole-naturo.fr", [profile(), profile({ slug: "demo", isDemo: true })]);
  assert.match(txt, /^# Naturo Pro/);
  assert.match(txt, /\/logiciel-naturopathe/);
  assert.match(txt, /\/p\/marie-dupont/);
  assert.doesNotMatch(txt, /\/p\/demo/); // les comptes de démo n'y sont pas non plus
});

// ── A10 — meta description ────────────────────────────────────────────────────

test("buildMetaDescription — jamais plus de 160 caractères, quelles que soient les données", () => {
  for (const p of [
    profile(),
    profile({ city: null }),
    profile({ specialties: [] }),
    profile({ bio: null, specialties: [], services: [] }),
    profile({ name: "X".repeat(200) }),
    profile({ specialties: ["A".repeat(80), "B".repeat(80), "C".repeat(80)] }),
  ]) {
    const desc = buildMetaDescription(p);
    assert.ok(desc.length <= 160, `longueur = ${desc.length} pour ${desc}`);
  }
});

test("buildMetaDescription — deux fiches vides ne partagent plus la même description (A10)", () => {
  const a = buildMetaDescription(profile({ name: "Alexandra Chouan", city: null, specialties: [], bio: null, services: [] }));
  const b = buildMetaDescription(profile({ name: "Charlotte Lavisse", city: null, specialties: [], bio: null, services: [] }));
  assert.notEqual(a, b);
  // Et surtout : plus de phrase de remplissage générique héritée de l'ancienne version.
  assert.doesNotMatch(a, /bienveillant/);
});

test("buildMetaDescription — puise dans les données réelles quand elles existent", () => {
  const desc = buildMetaDescription(profile());
  assert.match(desc, /^Marie Dupont — Naturopathe à Lyon\./);
  assert.match(desc, /Spécialités : Gestion du stress, Sommeil\./);
});

test("buildMetaDescription — normalise la casse du nom (A4)", () => {
  assert.match(buildMetaDescription(profile({ name: "RAYES" })), /^Rayes —/);
});

// ── A13 / A1 — injection dans le HTML ─────────────────────────────────────────

const TEMPLATE = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>Naturo Pro</title>
    <meta name="description" content="générique" />
    <meta property="og:title" content="générique" />
    <meta name="twitter:card" content="summary" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

test("applySeoHead — le charset reste AVANT le title injecté (A13)", () => {
  const out = applySeoHead(TEMPLATE, "<title>Fiche</title>");
  assert.ok(out.indexOf("<meta charset") < out.indexOf("<title>Fiche</title>"));
});

test("applySeoHead — les balises génériques sont retirées, pas doublées", () => {
  const out = applySeoHead(TEMPLATE, `<title>Fiche</title>\n<meta name="description" content="vraie" />`);
  assert.equal((out.match(/<title>/g) || []).length, 1);
  assert.equal((out.match(/name="description"/g) || []).length, 1);
  assert.doesNotMatch(out, /générique/);
});

test("applySeoBody — le corps pré-rendu atterrit dans #root (A1)", () => {
  const out = applySeoBody(TEMPLATE, "<h1>Marie Dupont</h1>");
  assert.match(out, /<div id="root"><h1>Marie Dupont<\/h1><\/div>/);
});

// ── applyNoindex — écrans transactionnels et 404 ──────────────────────────────

test("applyNoindex — pose un seul noindex, follow et n'en ajoute pas un second", () => {
  const once = applyNoindex(TEMPLATE);
  assert.match(once, /<meta name="robots" content="noindex, follow" \/>/);
  assert.equal((applyNoindex(once).match(/name="robots"/g) || []).length, 1);
});

test("applyNoindex — respecte une directive robots déjà présente", () => {
  const withRobots = TEMPLATE.replace(/<head>/, `<head>\n    <meta name="robots" content="noindex" />`);
  assert.equal(applyNoindex(withRobots), withRobots);
});

// ── A3 — 404 ──────────────────────────────────────────────────────────────────

test("isSpaPath — les chemins réels de l'app sont servis en 200", () => {
  for (const p of ["/", "/login", "/inscription", "/app", "/app/agenda", "/admin/users", "/manage/abc", "/anamnese/xyz", "/reset-password/tok", "/book/3"]) {
    assert.equal(isSpaPath(p), true, `${p} devrait être servi par le SPA`);
  }
});

test("isSpaPath — tout le reste part en 404 (A3)", () => {
  for (const p of ["/inexistant-abc123", "/annuaire", "/trouver-un-naturopathe", "/wp-admin", "/index.php"]) {
    assert.equal(isSpaPath(p), false, `${p} devrait répondre 404`);
  }
});

// ── fitTitle — titres de gabarit à 65 caractères maximum (audit Ubersuggest 15/09/2026) ──

test("fitTitle — core + suffixe si ça tient", () => {
  assert.equal(fitTitle("Naturopathe à Paris"), "Naturopathe à Paris | Naturo Pro");
});

test("fitTitle — suffixe retiré si core seul tient mais pas avec le suffixe", () => {
  const core = "Naturopathe à Saint-Léger-Aux-Bois - (76340) — 3 praticiens";
  assert.equal(fitTitle(core), core);
  assert.ok(fitTitle(core).length <= 65);
});

test("fitTitle — troncature propre sur une frontière de mot si core seul dépasse aussi max", () => {
  const core = "Un nom de praticien extrêmement long qui dépasse la limite fixée pour un titre";
  const out = fitTitle(core);
  assert.ok(out.length <= 65, `longueur = ${out.length}`);
  assert.ok(out.endsWith("…"));
  // Pas coupé au milieu d'un mot : le caractère juste avant l'ellipse n'est jamais
  // collé à un fragment de mot tronqué (on a coupé sur un espace).
  assert.ok(!/\S…$/.test(out) || core.startsWith(out.slice(0, -1)));
});

test("fitTitle — respecte un max personnalisé", () => {
  assert.equal(fitTitle("abc", " | X", 10), "abc | X");
  assert.equal(fitTitle("abc", " | Suffixe trop long", 6), "abc");
});

// ── Titres ≤ 65 caractères (audit Ubersuggest 15/09/2026) ────────────────────

test("titres fixes — /logiciel-naturopathe, /naturopathes, /inscription et /login ≤ 65 caractères", () => {
  const software = extractTitle(renderSoftwarePage("https://app.ecole-naturo.fr"));
  const directory = extractTitle(renderDirectoryIndex("https://app.ecole-naturo.fr", []));
  assert.ok(software.length <= 65, `logiciel-naturopathe = ${software.length} : "${software}"`);
  assert.ok(directory.length <= 65, `naturopathes = ${directory.length} : "${directory}"`);
  assert.ok(REGISTER_TITLE.length <= 65, `inscription = ${REGISTER_TITLE.length} : "${REGISTER_TITLE}"`);
  assert.ok(LOGIN_TITLE.length <= 65, `login = ${LOGIN_TITLE.length} : "${LOGIN_TITLE}"`);
});

// ── Doublons de title / meta description (erreurs Ubersuggest du 16/09/2026) ──
// "/" et "/login" servaient le même client/index.html, donc le même couple
// title + description. Chaque page pré-rendue doit porter le sien.

test("title et meta description — /inscription et /login diffèrent de l'accueil et entre eux", () => {
  // Le vrai client/index.html, pas le TEMPLATE de test : c'est bien son couple
  // title/description que le catch-all servait sur /login.
  const indexHtml = readFileSync(resolve(process.cwd(), "client/index.html"), "utf-8");
  const homeTitle = extractTitle(indexHtml);
  const homeDesc = (indexHtml.match(/<meta name="description" content="([^"]*)"/) || [, ""])[1];
  assert.ok(homeTitle && homeDesc, "client/index.html doit porter un title et une description");
  const titles = [homeTitle, REGISTER_TITLE, LOGIN_TITLE];
  const descs = [homeDesc, REGISTER_DESCRIPTION, LOGIN_DESCRIPTION];
  assert.equal(new Set(titles).size, titles.length, `titres dupliqués : ${JSON.stringify(titles)}`);
  assert.equal(new Set(descs).size, descs.length, `descriptions dupliquées : ${JSON.stringify(descs)}`);
  for (const d of [REGISTER_DESCRIPTION, LOGIN_DESCRIPTION]) {
    assert.ok(d.length >= 70 && d.length <= 160, `description hors bornes (${d.length}) : "${d}"`);
  }
});

// ── /inscription — contenu (défaut Ubersuggest 15/09/2026 : catch-all SPA, 0 mot, 0 H1) ──

test("renderRegisterBody — exactement un <h1> et au moins 300 mots", () => {
  const body = renderRegisterBody();
  assert.equal((body.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(countWords(body) >= 300, `mots = ${countWords(body)}`);
});

// ── /login — contenu (erreur Ubersuggest 16/09/2026 : catch-all SPA, 0 mot) ──

test("renderLoginBody — exactement un <h1> et au moins 300 mots", () => {
  const body = renderLoginBody();
  assert.equal((body.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(countWords(body) >= 300, `mots = ${countWords(body)}`);
});

test("renderHomeBody et renderDirectoryIndex — au moins 300 mots chacun", () => {
  assert.ok(countWords(renderHomeBody(0)) >= 300, `accueil = ${countWords(renderHomeBody(0))} mots`);
  assert.ok(
    countWords(renderDirectoryIndex("https://app.ecole-naturo.fr", [])) >= 300,
    "l'annuaire doit tenir 300 mots hors fiches praticiens (0 profil ici)",
  );
});

test("accueil, annuaire, inscription et login — aucun paragraphe recopié d'une page à l'autre", () => {
  const extractParagraphs = (html: string) =>
    Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)).map((m) => m[1].replace(/\s+/g, " ").trim());
  const home = extractParagraphs(renderHomeBody(0));
  const register = extractParagraphs(renderRegisterBody());
  const login = extractParagraphs(renderLoginBody());
  const directory = extractParagraphs(renderDirectoryIndex("https://app.ecole-naturo.fr", []));
  const all = [...home, ...register, ...login, ...directory];
  assert.equal(new Set(all).size, all.length, "un même paragraphe apparaît sur plusieurs pages");
});

// ── /register → /inscription — redirection 301 (dev comme prod) ─────────────

test("GET /register redirige en 301 vers /inscription", async () => {
  const app = express();
  registerSeoRoutes(app);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/register`, { redirect: "manual" });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), "/inscription");
  } finally {
    server.close();
  }
});
