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

/**
 * Construit le <head> SEO d'une praticienne pour les crawlers : title, meta
 * description et Open Graph (aperçu de partage avec nom, bio, photo).
 * Injecté dans le index.html servi UNIQUEMENT aux bots sur /p/:slug — les
 * humains gardent le SPA hash-routing inchangé.
 */
function buildSeoHead(naturo: { name: string; bio?: string | null; photoUrl?: string | null; city?: string | null; slug: string }, url: string): string {
  const title = `${naturo.name} — Naturopathe${naturo.city ? ` à ${naturo.city}` : ""} | Naturo Pro`;
  const descRaw = naturo.bio?.trim() || `Prenez rendez-vous avec ${naturo.name}, naturopathe${naturo.city ? ` à ${naturo.city}` : ""}. Consultation, accompagnement naturel et bien-être.`;
  const desc = descRaw.slice(0, 300);
  const img = naturo.photoUrl && /^https?:\/\//.test(naturo.photoUrl) ? naturo.photoUrl : "";
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    img ? `<meta property="og:image" content="${esc(img)}" />` : "",
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    img ? `<meta name="twitter:image" content="${esc(img)}" />` : "",
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
 * Enregistre les routes SEO (sitemap, robots.txt, pré-rendu crawler /p/:slug).
 * Appelée AVANT la bifurcation dev/prod dans server/index.ts : ces routes doivent
 * être testables via `npm run dev` (setupVite ne les connaît pas) et pas seulement
 * après build. Voir LOT 1 Action 5 — elles vivaient avant dans serveStatic(), donc
 * invisibles en dev (setupVite prend la main avant que serveStatic() soit appelé).
 */
export function registerSeoRoutes(app: Express) {
  // En prod, l'esbuild bundle en CJS : __dirname est défini nativement, sur dist/
  // → dist/public/index.html (build final). En dev, tsx exécute en ESM réel :
  // __dirname n'existe pas (cf. server/db.ts, server/google.ts pour le même
  // compat dual ESM/CJS), donc import.meta.dirname → on lit le index.html source
  // de Vite directement (suffisant pour le head SEO ; le HMR/transform Vite ne
  // concerne que l'expérience humaine, gérée par setupVite en aval, jamais par
  // cette route réservée aux crawlers).
  const indexPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public", "index.html")
      : path.resolve(import.meta.dirname, "..", "client", "index.html");

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
      let html = fs.readFileSync(indexPath, "utf-8");
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const url = `${proto}://${req.headers.host}/p/${u.slug}`;
      const seoHead = buildSeoHead(u as any, url);
      // Remplace le <title> existant ET la <meta description> statique qui le
      // suit (client/index.html) par le head enrichi — sinon les deux meta
      // description coexistent dans le HTML final (la voulue + la générique).
      // [\s\S] au lieu du flag /s (dotAll) — évite TS1501 sur target < es2018.
      html = html.replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*\/?>/, seoHead);
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

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(indexPath);
  });
}
