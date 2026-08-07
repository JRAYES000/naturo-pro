import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";

/** Échappement HTML minimal pour injecter des valeurs dans les balises meta. */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Parse défensif des spécialités stockées en JSON texte. Ne plante jamais. */
function parseSpecialtiesForSeo(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/**
 * Construit la meta description serveur : Nom praticien / Ville / Métier /
 * Spécialités, dans une fourchette stricte de 140 à 160 caractères (LOT 0,
 * Action 7 — corrige l'ancienne version qui recopiait la bio libre de la
 * praticienne telle quelle, sans contrôle de longueur ni structure garantie).
 * Fallback géré explicitement pour ville absente et spécialités vides : la
 * description reste toujours cohérente et dans la fourchette de longueur.
 */
export function buildMetaDescription(naturo: { name: string; city?: string | null; specialties?: string | null }): string {
  const specialties = parseSpecialtiesForSeo(naturo.specialties).slice(0, 4);
  const name = naturo.name.trim();
  const city = naturo.city?.trim();

  const core = `${name} — Naturopathe${city ? ` à ${city}` : ""}.`;
  // Assez longue pour amener même le nom le plus court au-delà de 140
  // caractères une fois ajoutée ; l'étape de troncature qui suit ramène
  // ensuite systématiquement le résultat à 160 caractères maximum.
  // Neutre en genre à dessein (Action 7, 07/08/2026) : "Elle vous propose" était
  // appliqué indistinctement à tous les comptes, y compris masculins.
  const filler = " Un accompagnement personnalisé et bienveillant, à l'écoute de vos besoins, pour retrouver équilibre et bien-être au quotidien.";

  const withSpecialties = (list: string[]) =>
    core + (list.length > 0 ? ` Spécialités : ${list.join(", ")}.` : "");

  // Trop long : retirer des spécialités une à une avant de tronquer le texte.
  let desc = withSpecialties(specialties);
  const local = [...specialties];
  while (desc.length > 160 && local.length > 0) {
    local.pop();
    desc = withSpecialties(local);
  }

  // Trop court : compléter avec une relance générique, toujours vraie (chaque
  // praticienne active dispose d'une page de réservation).
  if (desc.length < 140) desc += filler;

  // Garde-fou final, quelle que soit la branche empruntée ci-dessus : jamais
  // plus de 160 caractères.
  if (desc.length > 160) {
    desc = desc.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  }

  return desc;
}

/**
 * Construit le <head> SEO d'une praticienne pour les crawlers : title, meta
 * description et Open Graph (aperçu de partage avec nom, bio, photo).
 * Injecté dans le index.html servi UNIQUEMENT aux bots sur /p/:slug — les
 * humains gardent le SPA hash-routing inchangé.
 */
/**
 * Force un format 1200×630 (ratio attendu par les aperçus de partage Open Graph),
 * au lieu du 400×400 utilisé pour l'affichage in-app — Action 12, 07/08/2026.
 * Aujourd'hui, seul le CDN Unsplash (photos de démo) supporte ce redimensionnement
 * à la volée via des paramètres d'URL ; toute autre source https est renvoyée
 * inchangée (aucun moyen générique de la recadrer côté serveur).
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

function buildSeoHead(naturo: { name: string; bio?: string | null; photoUrl?: string | null; city?: string | null; slug: string; specialties?: string | null }, url: string): string {
  const title = `${naturo.name} — Naturopathe${naturo.city ? ` à ${naturo.city}` : ""} | Naturo Pro`;
  const desc = buildMetaDescription(naturo);
  const img = naturo.photoUrl && /^https?:\/\//.test(naturo.photoUrl) ? naturo.photoUrl : "";
  const ogImg = img ? ogSizedImage(img) : "";
  // Piste LCP (investigation du 06/08, page praticien à photo externe non
  // uploadée, ex. Unsplash) : préconnecter au CDN de la photo dès le <head>
  // pour paralléliser l'ouverture TCP/TLS avec le reste du chargement, plutôt
  // que de la découvrir seulement une fois le <img> atteint côté client.
  // N'agit pas sur les photos uploadées (stockées en data: URL, même origine).
  let imgOrigin = "";
  if (img) {
    try { imgOrigin = new URL(img).origin; } catch { /* URL malformée : pas de preconnect */ }
  }
  return [
    `<title>${esc(title)}</title>`,
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
  ].filter(Boolean).join("\n    ");
}

/** Date ISO (jour) à partir d'un timestamp ms — format attendu par <lastmod>. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Construit le XML du sitemap : accueil + une entrée par page praticien active.
 * lastmod = date de CRÉATION du compte (users.created_at), faute d'un champ
 * updated_at qui tracerait la dernière modification réelle de la page publique
 * (bio/photo/spécialités) — donnée réelle, mais approximative : elle ne bouge
 * pas quand la praticienne modifie sa page après coup.
 */
export function buildSitemapXml(base: string, pages: { slug: string; createdAt: number }[]): string {
  const root = base.replace(/\/$/, "");
  const urls = [
    `  <url>\n    <loc>${esc(root)}/</loc>\n  </url>`,
    ...pages.map(
      (p) =>
        `  <url>\n    <loc>${esc(root)}/p/${esc(p.slug)}</loc>\n    <lastmod>${isoDate(p.createdAt)}</lastmod>\n  </url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/**
 * robots.txt — même liste de crawlers IA que ecole-naturo.fr (accès autorisé, pour
 * la citation par les LLM), adaptée aux chemins réels de Naturo Pro (l'app n'a pas
 * de /wp-admin/ : les zones privées sont /app/, /admin/, /manage/, /anamnese/).
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
  const sharedRules = ["Allow: /", "Allow: /p/", "Disallow: /app/", "Disallow: /admin/", "Disallow: /manage/", "Disallow: /anamnese/"];
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
 * Injecte un head SEO dans un document HTML : retire le <title>, la meta
 * description et TOUTES les balises Open Graph / Twitter Card statiques de
 * client/index.html (Action 12 du LOT 2), puis injecte le head enrichi
 * juste après <head>. Un simple remplacement de <title> + description ne
 * suffit plus depuis l'ajout des balises OG/Twitter à index.html : sans ce
 * nettoyage, les deux jeux de balises coexistaient (doublon détecté en test
 * réel sur /p/:slug avant cette correction).
 */
export function applySeoHead(html: string, seoHead: string): string {
  // [\s\S] au lieu du flag /s (dotAll) — évite TS1501 sur target < es2018.
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta name="description"[^>]*\/?>/g, "")
    .replace(/<meta property="og:[^"]*"[^>]*\/?>/g, "")
    .replace(/<meta name="twitter:[^"]*"[^>]*\/?>/g, "");
  return cleaned.replace(/<head>/, `<head>\n    ${seoHead}`);
}

/**
 * Enregistre les routes SEO (sitemap, robots.txt, pré-rendu crawler /p/:slug).
 * Appelée AVANT la bifurcation dev/prod dans server/index.ts : ces routes doivent
 * être testables via `npm run dev` (setupVite ne les connaît pas) et pas seulement
 * après build. Voir LOT 1 Action 5 — elles vivaient avant dans serveStatic(), donc
 * invisibles en dev (setupVite prend la main avant que serveStatic() soit appelé).
 */
export function registerSeoRoutes(app: Express) {
  // Utilisé uniquement en prod (bundle esbuild CJS, __dirname défini nativement).
  // Ne pas évaluer __dirname en dev : tsx exécute en ESM réel, où __dirname
  // n'existe pas (cf. server/db.ts, server/google.ts pour le même compat dual
  // ESM/CJS) — la branche dev ci-dessous ne s'en sert jamais.
  const indexPath =
    process.env.NODE_ENV === "production" ? path.resolve(__dirname, "public", "index.html") : "";

  // ── sitemap.xml : accueil + pages praticiens actives ─────────────────────────
  app.get("/sitemap.xml", async (_req, res) => {
    const base = process.env.PUBLIC_URL || "http://localhost:3000";
    const pages = await storage.listPublicPagesForSitemap();
    res.set("Content-Type", "application/xml; charset=utf-8").send(buildSitemapXml(base, pages));
  });

  // ── robots.txt ────────────────────────────────────────────────────────────────
  app.get("/robots.txt", (_req, res) => {
    const base = process.env.PUBLIC_URL || "http://localhost:3000";
    res.set("Content-Type", "text/plain; charset=utf-8").send(buildRobotsTxt(base));
  });

  // ── SEO : pré-rendu de /p/:slug — IDENTIQUE pour tout le monde ──────────────
  // Title + meta description + OG lus depuis la DB, servis à l'humain comme au
  // bot (Googlebot, DataForSEO, Google-InspectionTool…) : plus de détection de
  // user-agent, qui s'est révélée peu fiable (cf. audit LOT 1 Action 7 — un
  // crawler réel recevait le head générique de la Landing faute de matcher le
  // filtre isCrawler()). Aucun changement pour le <body> / le script React :
  // seul le <head> diffère, l'app humaine s'hydrate normalement.
  app.get("/p/:slug", async (req, res, next) => {
    try {
      const u = await storage.getUserBySlug(req.params.slug);
      if (!u || !u.publicPageEnabled) return next();
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const url = `${proto}://${req.headers.host}/p/${u.slug}`;
      const seoHead = buildSeoHead(u as any, url);
      if (process.env.NODE_ENV !== "production") {
        // Dev : le HTML doit passer par vite.transformIndexHtml (setupVite, en
        // aval) pour que le runtime React Refresh soit injecté — sans lui, React
        // ne se monte pas du tout ("#root" reste vide). On ne fait donc QUE
        // transmettre le head déjà calculé, via res.locals ; c'est le catch-all
        // de server/vite.ts qui l'injecte réellement dans le HTML transformé.
        res.locals.seoHead = seoHead;
        return next();
      }
      const html = applySeoHead(fs.readFileSync(indexPath, "utf-8"), seoHead);
      res.set("Content-Type", "text/html; charset=utf-8").send(html);
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

  // Assets Vite (JS/CSS) : le nom de fichier contient un hash de contenu
  // (index-D4YqlVjJ.js, vendor-react-J4kObT73.js…) — un changement de contenu
  // produit toujours un nouveau nom. Cache long-terme sûr par construction,
  // monté AVANT le static général pour ne s'appliquer qu'à /assets. index.html,
  // favicon.svg, naturobot.jpg et les polices n'ont pas de hash dans leur nom :
  // ils restent volontairement sur le comportement par défaut ci-dessous
  // (max-age=0), servi par express.static(distPath) sans option.
  app.use("/assets", express.static(path.resolve(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(indexPath);
  });
}
