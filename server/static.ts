/**
 * server/static.ts — service des fichiers statiques et rendu SEO serveur.
 *
 * Refonte du 15/08/2026 suite à l'audit docs/AUDIT-SEO-2026-08-15.md. Ce que le
 * fichier faisait déjà : head SEO pré-rendu sur /p/:slug, robots.txt, sitemap.
 * Ce qui a changé, et pourquoi :
 *
 *   A1  Le <body> est pré-rendu, pas seulement le <head>. Aucun crawler IA
 *       n'exécute le JS : ils recevaient une page vide.
 *   A3  Une URL inconnue renvoie 404, plus 200. Tout répondait 200 + index.html,
 *       ce qui fabriquait des soft-404 en série.
 *   A5  <link rel="canonical"> partout — l'app est multi-tenant, la même fiche
 *       est atteignable en /p/{slug} ET en {slug}.app.ecole-naturo.fr.
 *   A6  JSON-LD sur toutes les pages publiques.
 *   A7  Sitemap : comptes de démo exclus, lastmod = dernière modif réelle.
 *   A10 Meta description construite sur des données réelles, plus sur un texte
 *       de remplissage identique d'une fiche à l'autre.
 *   A12 /llms.txt, qui n'existait pas (le catch-all renvoyait le SPA en 200).
 *   A13 <meta charset> avant <title> dans le head injecté.
 */

import express from 'express';
import type { Express, Request, Response } from 'express';
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";
import {
  esc, citySlug, titleCase, groupByCity, isIndexable, renderDirectoryIndex,
  renderCityPage, renderSoftwarePage, renderProfileBody, buildProfileJsonLd,
  renderHomeBody, buildHomeJsonLd, formatPrice, type SeoProfile,
} from "./seo-pages";

export { esc };

/**
 * Meta description d'une fiche praticien (A10).
 *
 * L'ancienne version complétait toute description trop courte avec une phrase
 * générique identique pour tout le monde ; les fiches peu remplies partageaient
 * donc mot pour mot la même description, que Google réécrivait. On puise
 * désormais dans les données réelles, dans cet ordre : identité → spécialités →
 * première phrase de bio → prestation principale. Et si vraiment rien n'est
 * renseigné, on s'arrête : une description courte et vraie vaut mieux qu'un
 * remplissage partagé par toutes les pages du site.
 *
 * Garantie conservée : jamais plus de 160 caractères.
 */
export function buildMetaDescription(p: {
  name: string;
  city?: string | null;
  specialties?: string[] | null;
  bio?: string | null;
  services?: { name: string; durationMinutes: number; priceCents: number }[] | null;
}): string {
  const name = titleCase(p.name);
  const city = p.city?.trim();
  const specialties = (p.specialties ?? []).filter((s) => s && s.trim());

  let desc = `${name} — Naturopathe${city ? ` à ${titleCase(city)}` : ""}.`;

  // 1. Spécialités : retirées une à une si elles font déborder.
  if (specialties.length) {
    const local = [...specialties].slice(0, 4);
    while (local.length > 0) {
      const candidate = `${desc} Spécialités : ${local.join(", ")}.`;
      if (candidate.length <= 160) { desc = candidate; break; }
      local.pop();
    }
  }

  // 2. Première phrase de la bio, si elle tient dans ce qui reste.
  if (desc.length < 140) {
    const firstSentence = (p.bio || "").trim().replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0];
    if (firstSentence && firstSentence.length > 20) {
      const candidate = `${desc} ${firstSentence}`;
      if (candidate.length <= 160) desc = candidate;
    }
  }

  // 3. Prestation principale : concret, chiffré, et différent d'une fiche à l'autre.
  if (desc.length < 140 && p.services && p.services.length > 0) {
    const s = p.services[0];
    const candidate = `${desc} ${s.name} : ${s.durationMinutes} min, ${formatPrice(s.priceCents)}. Réservation en ligne.`;
    if (candidate.length <= 160) desc = candidate;
  }

  // 4. Relance courte, seulement s'il reste vraiment de la place et rien à dire.
  if (desc.length < 110) {
    const candidate = `${desc} Prenez rendez-vous en ligne.`;
    if (candidate.length <= 160) desc = candidate;
  }

  if (desc.length > 160) desc = `${desc.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  return desc;
}

/**
 * Force un format 1200×630 (ratio attendu par les aperçus Open Graph) au lieu du
 * 400×400 utilisé in-app. Seul le CDN Unsplash (photos de démo) sait redimensionner
 * à la volée par paramètres d'URL ; toute autre source https est renvoyée telle quelle.
 */
function ogSizedImage(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "images.unsplash.com") {
      u.searchParams.set("w", "1200");
      u.searchParams.set("h", "630");
      u.searchParams.set("fit", "crop");
      return u.toString();
    }
  } catch { /* URL malformée : renvoyée telle quelle */ }
  return url;
}

/**
 * <head> SEO d'une fiche praticien : title, description, canonical, Open Graph,
 * JSON-LD, et noindex quand la fiche est trop incomplète pour mériter l'index.
 */
export function buildSeoHead(p: SeoProfile, url: string, canonical: string): string {
  const name = titleCase(p.name);
  const title = `${name} — Naturopathe${p.city ? ` à ${titleCase(p.city)}` : ""} | Naturo Pro`;
  const desc = buildMetaDescription(p);
  const img = p.photoUrl && /^https?:\/\//.test(p.photoUrl) ? p.photoUrl : "";
  const ogImg = img ? ogSizedImage(img) : "";

  // Piste LCP (fiche à photo externe, ex. Unsplash) : préconnecter au CDN dès le
  // <head> plutôt que de le découvrir au moment du <img>.
  let imgOrigin = "";
  if (img) {
    try { imgOrigin = new URL(img).origin; } catch { /* URL malformée : pas de preconnect */ }
  }

  const jsonLd = JSON.stringify(buildProfileJsonLd(p, canonical)).replace(/</g, "\\u003c");

  return [
    `<title>${esc(title)}</title>`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    // Fiche incomplète (A11) : accessible par son lien, mais hors index — douze
    // pages quasi vides sur un site santé, c'est le profil thin content.
    isIndexable(p) ? "" : `<meta name="robots" content="noindex, follow" />`,
    imgOrigin ? `<link rel="preconnect" href="${esc(imgOrigin)}" crossorigin />` : "",
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:site_name" content="Naturo Pro" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    ogImg ? `<meta property="og:image" content="${esc(ogImg)}" />` : "",
    ogImg ? `<meta property="og:image:width" content="1200" />` : "",
    ogImg ? `<meta property="og:image:height" content="630" />` : "",
    `<meta name="twitter:card" content="${ogImg ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    ogImg ? `<meta name="twitter:image" content="${esc(ogImg)}" />` : "",
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].filter(Boolean).join("\n    ");
}

/** Date ISO (jour) à partir d'un timestamp ms — format attendu par <lastmod>. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Sitemap (A7) : accueil, pages éditoriales, annuaire, pages ville, et les fiches
 * praticien RÉELLEMENT indexables.
 *
 * Ce qui a changé : les comptes de démonstration et de test en sont exclus
 * (soumettre un praticien de santé fictif est un signal de qualité négatif), les
 * fiches trop incomplètes aussi, et <lastmod> s'appuie sur la dernière modification
 * réelle de la page publique au lieu de la date de création du compte, qui ne
 * bougeait jamais.
 */
export function buildSitemapXml(base: string, profiles: SeoProfile[]): string {
  const root = base.replace(/\/$/, "");
  const indexable = profiles.filter(isIndexable);
  const cities = groupByCity(profiles);

  const entry = (loc: string, lastmod?: number) =>
    `  <url>\n    <loc>${esc(loc)}</loc>${lastmod ? `\n    <lastmod>${isoDate(lastmod)}</lastmod>` : ""}\n  </url>`;

  const urls = [
    entry(`${root}/`),
    entry(`${root}/logiciel-naturopathe`),
    // L'annuaire n'entre au sitemap que s'il a quelque chose à montrer.
    ...(indexable.length > 0 ? [entry(`${root}/naturopathes`)] : []),
    ...Array.from(cities.keys()).map((slug) => entry(`${root}/naturopathes/${slug}`)),
    ...indexable.map((p) => entry(`${root}/p/${p.slug}`, p.publicPageUpdatedAt ?? p.createdAt)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/**
 * robots.txt — même liste de crawlers IA que ecole-naturo.fr (accès autorisé, pour
 * la citation par les LLM), adaptée aux chemins réels de Naturo Pro : les zones
 * privées sont /app/, /admin/, /manage/, /anamnese/.
 */
export function buildRobotsTxt(base: string): string {
  const root = base.replace(/\/$/, "");
  const aiCrawlers = [
    "GPTBot", "ChatGPT-User", "OAI-SearchBot",
    "ClaudeBot", "anthropic-ai", "Claude-Web", "Claude-SearchBot",
    "PerplexityBot", "Perplexity-User",
    "Google-Extended", "Applebot-Extended", "Bytespider", "CCBot", "Diffbot",
    "DuckAssistBot", "cohere-ai", "cohere-training-data-crawler",
    "Meta-ExternalAgent", "FacebookBot", "YouBot", "MistralAI-User",
  ];
  const sharedRules = [
    "Allow: /", "Allow: /p/", "Allow: /naturopathes",
    "Disallow: /app/", "Disallow: /admin/", "Disallow: /manage/", "Disallow: /anamnese/",
  ];
  return [
    "# robots.txt — Naturo Pro",
    "# Crawlers IA (mêmes user-agents que ecole-naturo.fr) : accès autorisé pour la citation par les LLM.",
    "",
    ...aiCrawlers.map((ua) => `User-agent: ${ua}`),
    ...sharedRules,
    "",
    "User-agent: *",
    ...sharedRules,
    "",
    `Sitemap: ${root}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * llms.txt (A12) — carte du site en texte, pour les assistants IA.
 *
 * Le fichier n'existait pas : /llms.txt tombait sur le catch-all et renvoyait le
 * SPA en 200 avec un Content-Type HTML, ce qui se lit comme un fichier présent
 * mais illisible.
 */
export function buildLlmsTxt(base: string, profiles: SeoProfile[]): string {
  const root = base.replace(/\/$/, "");
  const indexable = profiles.filter(isIndexable);
  const cities = groupByCity(profiles);

  const lines = [
    "# Naturo Pro",
    "",
    "> Logiciel de gestion pour naturopathes et praticiens du bien-être : agenda,",
    "> réservation en ligne, dossiers clients, questionnaire d'anamnèse, forfaits et",
    "> facturation. Édité en France, interface en français. Chaque praticien dispose",
    "> d'une page publique de réservation hébergée sur ce domaine.",
    "",
    "## Pages principales",
    "",
    `- [Le logiciel pour naturopathe](${root}/logiciel-naturopathe) : fonctions, tarifs et questions fréquentes.`,
    `- [Annuaire des naturopathes](${root}/naturopathes) : praticiens acceptant la réservation en ligne.`,
    "",
  ];

  if (cities.size > 0) {
    lines.push("## Annuaire par ville", "");
    for (const [slug, e] of Array.from(cities.entries())) {
      lines.push(`- [Naturopathe à ${e.city}](${root}/naturopathes/${slug}) : ${e.profiles.length} praticiens.`);
    }
    lines.push("");
  }

  if (indexable.length > 0) {
    lines.push("## Fiches praticiens", "");
    for (const p of indexable) {
      const where = p.city ? ` à ${titleCase(p.city)}` : "";
      const spec = p.specialties.length ? ` Spécialités : ${p.specialties.join(", ")}.` : "";
      lines.push(`- [${titleCase(p.name)}](${root}/p/${p.slug}) : naturopathe${where}.${spec}`);
    }
    lines.push("");
  }

  lines.push(
    "## À savoir",
    "",
    "- La naturopathie est une approche de bien-être et de prévention. Elle ne remplace",
    "  ni un diagnostic ni un traitement médical.",
    "- Les créneaux affichés sur les pages praticiens sont les disponibilités réelles,",
    "  mises à jour en continu.",
    "",
  );
  return lines.join("\n");
}

/**
 * Injecte le head SEO dans un document HTML.
 *
 * Retire le <title>, la meta description et TOUTES les balises Open Graph /
 * Twitter statiques de client/index.html — sans ce nettoyage, les deux jeux
 * coexistaient. L'insertion se fait après <meta charset> et non après <head>
 * (A13) : un <title> accentué placé avant la déclaration d'encodage n'est
 * décodable que grâce à l'en-tête HTTP, ce qui n'est pas garanti côté parseurs tiers.
 */
export function applySeoHead(html: string, seoHead: string): string {
  // [\s\S] au lieu du flag /s (dotAll) — évite TS1501 sur target < es2018.
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta name="description"[^>]*\/?>/g, "")
    .replace(/<meta property="og:[^"]*"[^>]*\/?>/g, "")
    .replace(/<meta name="twitter:[^"]*"[^>]*\/?>/g, "")
    // Lignes laissées vides par les suppressions ci-dessus.
    .replace(/^[ \t]*\r?\n(?=[ \t]*\r?\n)/gm, "");

  const charset = cleaned.match(/<meta\s+charset=["'][^"']*["']\s*\/?>/i);
  if (charset) {
    return cleaned.replace(charset[0], `${charset[0]}\n    ${seoHead}`);
  }
  return cleaned.replace(/<head>/, `<head>\n    ${seoHead}`);
}

/**
 * Injecte le corps pré-rendu dans le conteneur React (A1).
 *
 * React écrase ce contenu au montage : il n'existe que pour les crawlers qui
 * n'exécutent pas le JS. Ce n'est pas du cloaking — le même HTML est servi à
 * tout le monde, humains compris, et il dit la même chose que la page React.
 */
export function applySeoBody(html: string, bodyHtml: string): string {
  return html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${bodyHtml}</div>`);
}

/**
 * Chemins réels (hors hash) que le SPA sait servir. Tout le reste part en 404 (A3).
 *
 * Rappel du fonctionnement : l'app privée est en hash routing (/#/agenda), donc le
 * serveur ne voit jamais ces routes. Les chemins ci-dessous sont ceux que
 * client/src/main.tsx convertit en hash au montage, plus les routes publiques
 * qu'il laisse en URL propre (/ et /p/:slug).
 */
const SPA_PATHS = new Set([
  "/", "/login", "/register", "/forgot-password", "/book",
]);
const SPA_PREFIXES = [
  "/app", "/admin", "/book/", "/manage/", "/anamnese/",
  "/verify-email/", "/reset-password/",
];

export function isSpaPath(pathname: string): boolean {
  // Toujours appelé avec req.originalUrl, jamais req.path : dans un middleware
  // monté par app.use("/{*path}"), req.path est relatif au point de montage et
  // ne vaut pas ce qu'on croit — c'est ce qui a fait répondre 200 au premier jet.
  const clean = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (SPA_PATHS.has(clean)) return true;
  return SPA_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(prefix));
}

/** URL canonique d'une fiche : toujours la forme en chemin, jamais le sous-domaine tenant (A5). */
function canonicalProfileUrl(base: string, slug: string): string {
  return `${base.replace(/\/$/, "")}/p/${slug}`;
}

/**
 * Enregistre les routes SEO. Appelée AVANT la bifurcation dev/prod dans
 * server/index.ts : ces routes doivent être testables via `npm run dev`
 * (setupVite ne les connaît pas) et pas seulement après build.
 */
export function registerSeoRoutes(app: Express) {
  // Utilisé uniquement en prod (bundle esbuild CJS, __dirname défini nativement).
  // Ne pas évaluer __dirname en dev : tsx exécute en ESM réel, où __dirname n'existe pas.
  const indexPath =
    process.env.NODE_ENV === "production" ? path.resolve(__dirname, "public", "index.html") : "";
  const baseUrl = () => process.env.PUBLIC_URL || "http://localhost:3000";

  const sendHtml = (res: Response, html: string, status = 200) =>
    res.status(status).set("Content-Type", "text/html; charset=utf-8").send(html);

  // ── sitemap.xml ─────────────────────────────────────────────────────────────
  app.get("/sitemap.xml", async (_req, res) => {
    const profiles = await storage.listPublicProfilesForSeo();
    res.set("Content-Type", "application/xml; charset=utf-8").send(buildSitemapXml(baseUrl(), profiles));
  });

  // ── robots.txt ──────────────────────────────────────────────────────────────
  app.get("/robots.txt", (_req, res) => {
    res.set("Content-Type", "text/plain; charset=utf-8").send(buildRobotsTxt(baseUrl()));
  });

  // ── llms.txt (A12) ──────────────────────────────────────────────────────────
  app.get("/llms.txt", async (_req, res) => {
    const profiles = await storage.listPublicProfilesForSeo();
    res.set("Content-Type", "text/plain; charset=utf-8").send(buildLlmsTxt(baseUrl(), profiles));
  });

  // ── /logiciel-naturopathe (A8) ──────────────────────────────────────────────
  app.get("/logiciel-naturopathe", (_req, res) => {
    sendHtml(res, renderSoftwarePage(baseUrl().replace(/\/$/, "")));
  });

  // ── /naturopathes — annuaire (A2) ───────────────────────────────────────────
  app.get("/naturopathes", async (_req, res) => {
    const profiles = await storage.listPublicProfilesForSeo();
    sendHtml(res, renderDirectoryIndex(baseUrl().replace(/\/$/, ""), profiles));
  });

  // ── /naturopathes/:city — page ville (A2) ───────────────────────────────────
  // Pas de page si la ville n'atteint pas le seuil : groupByCity l'a déjà écartée,
  // et on répond 404 plutôt que d'inventer une page vide.
  app.get("/naturopathes/:city", async (req, res, next) => {
    const profiles = await storage.listPublicProfilesForSeo();
    const cities = groupByCity(profiles);
    const slug = citySlug(req.params.city);
    const entry = cities.get(slug);
    if (!entry) return next();
    sendHtml(res, renderCityPage(baseUrl().replace(/\/$/, ""), entry.city, slug, entry.profiles));
  });

  // ── / — accueil, corps et JSON-LD pré-rendus (A1 + A2 + A6) ─────────────────
  // La landing vit entièrement dans le bundle React : sans cette route, le HTML
  // servi sur `/` ne contient ni texte ni lien, et les pages liées depuis le
  // footer React restent orphelines pour tout crawler qui n'exécute pas le JS.
  app.get("/", async (_req, res, next) => {
    if (process.env.NODE_ENV !== "production") return next();
    try {
      const profiles = await storage.listPublicProfilesForSeo();
      const base = baseUrl().replace(/\/$/, "");
      const head = [
        `<link rel="canonical" href="${esc(base)}/" />`,
        `<script type="application/ld+json">${JSON.stringify(buildHomeJsonLd(base)).replace(/</g, "\\u003c")}</script>`,
      ].join("\n    ");
      const html = fs.readFileSync(indexPath, "utf-8");
      const withHead = html.replace(/<\/head>/, `  ${head}\n  </head>`);
      sendHtml(res, applySeoBody(withHead, renderHomeBody(profiles.filter(isIndexable).length)));
    } catch {
      next(); // en cas d'erreur, l'accueil statique habituel
    }
  });

  // ── /p/:slug — fiche praticien, head ET corps pré-rendus (A1) ───────────────
  // Servi IDENTIQUEMENT aux humains et aux bots : plus de détection de user-agent,
  // qui s'était révélée peu fiable (un crawler réel recevait le head générique de
  // la Landing faute de matcher le filtre isCrawler()).
  app.get("/p/:slug", async (req, res, next) => {
    try {
      const p = await storage.getSeoProfileBySlug(req.params.slug);
      if (!p) return next(); // slug inconnu → 404 par le catch-all (A3)

      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const url = `${proto}://${req.headers.host}/p/${p.slug}`;
      const canonical = canonicalProfileUrl(baseUrl(), p.slug);
      const seoHead = buildSeoHead(p, url, canonical);
      const seoBody = renderProfileBody(p);

      if (process.env.NODE_ENV !== "production") {
        // Dev : le HTML doit passer par vite.transformIndexHtml (setupVite, en aval)
        // pour que le runtime React Refresh soit injecté — sans lui, React ne se
        // monte pas du tout. On transmet donc via res.locals ; c'est le catch-all
        // de server/vite.ts qui injecte réellement.
        res.locals.seoHead = seoHead;
        res.locals.seoBody = seoBody;
        return next();
      }

      const html = applySeoBody(applySeoHead(fs.readFileSync(indexPath, "utf-8"), seoHead), seoBody);
      sendHtml(res, html);
    } catch {
      next(); // en cas d'erreur, on retombe sur le SPA standard
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexPath = path.resolve(distPath, "index.html");

  // Assets Vite (JS/CSS) : le nom de fichier contient un hash de contenu — un
  // changement de contenu produit toujours un nouveau nom. Cache long-terme sûr
  // par construction, monté AVANT le static général pour ne s'appliquer qu'à
  // /assets. index.html, favicon.svg, naturobot.jpg et les polices n'ont pas de
  // hash dans leur nom : ils restent sur le comportement par défaut (max-age=0).
  app.use("/assets", express.static(path.resolve(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));

  app.use(express.static(distPath));

  // Catch-all (A3) — une URL connue du SPA est servie en 200, tout le reste en
  // 404 + noindex. Avant cette correction, /inexistant, /annuaire ou
  // /p/slug-qui-nexiste-pas renvoyaient tous 200 avec la même page : autant de
  // soft-404 pour Google, et un budget de crawl dépensé pour rien.
  app.use("/{*path}", (req: Request, res: Response) => {
    const html = fs.readFileSync(indexPath, "utf-8");
    if (isSpaPath(req.originalUrl)) {
      return res.status(200).set("Content-Type", "text/html; charset=utf-8").send(html);
    }
    const notFound = html.replace(
      /<head>/,
      `<head>\n    <meta name="robots" content="noindex, follow" />`,
    );
    res.status(404).set("Content-Type", "text/html; charset=utf-8").send(notFound);
  });
}
