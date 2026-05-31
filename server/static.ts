import express from 'express';
import type { Express, Request } from 'express';
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";

/** Échappement HTML minimal pour injecter des valeurs dans les balises meta. */
function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Détecte les crawlers/bots (Google, Facebook, WhatsApp, Twitter, LinkedIn…). */
function isCrawler(req: Request): boolean {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  if (!ua) return false;
  return /bot|crawler|spider|googlebot|bingbot|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|slackbot|telegrambot|discordbot|embedly|pinterest|preview/i.test(ua);
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

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexPath = path.resolve(distPath, "index.html");

  // ── SEO : pré-rendu pour crawlers sur /p/:slug ───────────────────────────────
  // Les humains utilisent le hash routing (/#/p/:slug) → le serveur ne voit que
  // "/" et sert le SPA normal. Les bots, eux, visitent le PATH /p/:slug : on leur
  // renvoie le même index.html mais avec un <head> enrichi (title + meta + OG)
  // lu depuis la DB. Aucun impact sur l'expérience humaine.
  app.get("/p/:slug", async (req, res, next) => {
    try {
      if (!isCrawler(req)) return next(); // humain → SPA normal (catch-all)
      const u = await storage.getUserBySlug(req.params.slug);
      if (!u || !u.publicPageEnabled) return next();
      let html = fs.readFileSync(indexPath, "utf-8");
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const url = `${proto}://${req.headers.host}/p/${u.slug}`;
      const seoHead = buildSeoHead(u as any, url);
      // Remplace le <title> existant + injecte les meta juste après.
      html = html.replace(/<title>.*?<\/title>/s, seoHead);
      res.set("Content-Type", "text/html; charset=utf-8").send(html);
    } catch {
      next(); // en cas d'erreur, on retombe sur le SPA standard
    }
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(indexPath);
  });
}
