/**
 * server/routes/index.ts — orchestrateur des routes (Phase 4.0, split par domaine terminé)
 *
 * Point d'entrée unique du back HTTP. `registerRoutes(httpServer, app)` installe les
 * middlewares globaux (cookies, session, sous-domaine tenant, trial-guard, rate-limiters)
 * puis câble chaque domaine via son `register<Domaine>(app[, ctx])`. Aucune route n'est
 * déclarée inline ici : tout vit dans les sous-modules `server/routes/<domaine>.ts`.
 *
 * Historique : ce fichier remplace l'ancien `server/routes.ts` (2877 lignes au départ),
 * découpé domaine par domaine (étapes 0→14). Voir docs/ARCHITECTURE.md.
 */

import type { Express } from "express";
import type { Server } from "node:http";
import cookieParser from "cookie-parser";
import { apiLimiter, publicLimiter, adminLimiter } from "./limiters";
import { storage } from "../storage";
import { attachUser, type AuthedRequest } from "../auth";
import { startCrons } from "./cron";
import { createContext } from "./_context";
import { registerCategoryRoutes } from "./categories";
import { registerAvailabilityRoutes } from "./availability";
import { registerProfileRoutes } from "./profile";
import { registerClientRoutes } from "./clients";
import { registerAppointmentRoutes } from "./appointments";
import { registerEmailTemplateRoutes } from "./email-templates";
import { registerReminderRoutes } from "./reminders";
import { registerInvoiceRoutes } from "./invoices";
import { registerAdminRoutes } from "./admin";
import { registerGoogleRoutes } from "./google";
import { registerInternalRoutes } from "./internal";
import { registerPublicRoutes } from "./public";
import { registerAuthRoutes } from "./auth";
import { registerAnamneseRoutes } from "./anamnese";
import { registerProgrammeRoutes } from "./programmes";
import { registerDocumentRoutes } from "./documents";
import { registerStatsRoutes } from "./stats";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(cookieParser());
  app.use(attachUser);

  // Phase 3 Lot 2 — Détection de sous-domaine personnel ({slug}.app.ecole-naturo.fr)
  // Si la requête arrive sur un sous-domaine, on résout le naturopathe correspondant
  // et on injecte tenantUserId / tenantSlug pour que les routes publiques puissent
  // répondre sans avoir le slug dans l'URL (variante /api/public/_self).
  const BASE_DOMAIN = (process.env.BASE_DOMAIN || "app.ecole-naturo.fr").toLowerCase();
  const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
  app.use(async (req: AuthedRequest, _res, next) => {
    try {
      const host = (req.hostname || "").toLowerCase();
      if (!host || host === BASE_DOMAIN || host === "localhost" || IP_RE.test(host)) {
        return next();
      }
      // Doit se terminer par ".BASE_DOMAIN" pour être un sous-domaine du SaaS.
      if (!host.endsWith("." + BASE_DOMAIN)) return next();
      const sub = host.slice(0, host.length - ("." + BASE_DOMAIN).length);
      if (!sub || sub === "www") return next();
      // Pas de sous-sous-domaine pour le moment ({foo}.{slug}.app… → on ignore).
      if (sub.includes(".")) return next();
      const u = await storage.getUserBySlug(sub);
      if (u && u.publicPageEnabled) {
        req.tenantUserId = u.id;
        req.tenantSlug = u.slug;
      } else {
        req.tenantNotFound = true;
      }
    } catch (e: any) {
      console.error("[subdomain-tenant]", e?.message || e);
    }
    next();
  });

  // ── Trial guard : bloque les mutations si plan='trial' et trial_ends_at < now
  // Routes exemptées : /api/auth/* (login/logout/onboarding), /api/profile (settings),
  // /api/internal/* (cron), /api/public/* (lecture publique), GET (lecture).
  app.use(async (req: AuthedRequest, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    if (!req.userId) return next();
    const p = req.path;
    if (
      p.startsWith("/api/auth/") ||
      p.startsWith("/api/internal/") ||
      p.startsWith("/api/public/") ||
      p.startsWith("/api/admin/") ||
      p === "/api/profile" ||
      p.startsWith("/api/billing/")
    ) return next();
    if (!p.startsWith("/api/")) return next();
    try {
      const u = await storage.getUserById(req.userId);
      if (u && u.plan === "trial" && u.trialEndsAt && u.trialEndsAt < Date.now()) {
        return res.status(402).json({
          message: "Votre essai gratuit est terminé. Activez votre abonnement pour continuer à utiliser Naturo Pro.",
          code: "TRIAL_EXPIRED",
          trialEndsAt: u.trialEndsAt,
        });
      }
    } catch (e: any) {
      console.error("[trial-guard]", e?.message || e);
    }
    next();
  });

  // Rate limiters : singletons module-level dans ./limiters (mêmes seuils/options
  // qu'avant — comportement identique). createContext() réexpose les mêmes instances
  // aux domaines qui en ont besoin (auth → authLimiter, public → bookingLimiter).
  app.use("/api/public", publicLimiter);
  app.use("/api/admin", adminLimiter);
  app.use("/api", apiLimiter);

  // Contexte partagé (limiters + config env) injecté aux domaines qui en ont besoin.
  const ctx = createContext();

  // ── Câblage des domaines (l'ordre = ordre de matching Express, à préserver) ──
  registerAuthRoutes(app, ctx);
  registerGoogleRoutes(app);
  registerInternalRoutes(app);
  registerProfileRoutes(app);
  registerCategoryRoutes(app);
  registerAvailabilityRoutes(app);
  registerClientRoutes(app);
  registerAppointmentRoutes(app);
  registerPublicRoutes(app, ctx);
  registerInvoiceRoutes(app);
  registerAdminRoutes(app);
  registerReminderRoutes(app);
  registerEmailTemplateRoutes(app);
  registerAnamneseRoutes(app);
  registerProgrammeRoutes(app);
  registerDocumentRoutes(app);
  registerStatsRoutes(app);

  startCrons();

  return httpServer;
}
