import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSitemapXml, buildRobotsTxt, buildMetaDescription, buildLlmsTxt,
  applySeoHead, applySeoBody, isSpaPath,
} from "./static";
import {
  citySlug, titleCase, isIndexable, missingForIndexing, groupByCity,
  MIN_PROFILES_PER_CITY, type SeoProfile,
} from "./seo-pages";

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

// ── A3 — 404 ──────────────────────────────────────────────────────────────────

test("isSpaPath — les chemins réels de l'app sont servis en 200", () => {
  for (const p of ["/", "/login", "/register", "/app", "/app/agenda", "/admin/users", "/manage/abc", "/anamnese/xyz", "/reset-password/tok", "/book/3"]) {
    assert.equal(isSpaPath(p), true, `${p} devrait être servi par le SPA`);
  }
});

test("isSpaPath — tout le reste part en 404 (A3)", () => {
  for (const p of ["/inexistant-abc123", "/annuaire", "/trouver-un-naturopathe", "/wp-admin", "/index.php"]) {
    assert.equal(isSpaPath(p), false, `${p} devrait répondre 404`);
  }
});
