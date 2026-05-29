import type { Express, Response, NextFunction } from "express";
import type { Server } from "node:http";
import cookieParser from "cookie-parser";
import { authLimiter, apiLimiter, publicLimiter, adminLimiter } from "./routes/limiters";
import { z } from "zod";
import { storage } from "./storage";
import {
  insertUserSchema, insertCategorySchema, insertAvailabilitySchema, insertClientSchema,
  insertAppointmentSchema, insertNoteSchema,
} from "@shared/schema-active";
import type { Invoice, InvoiceItem } from "@shared/schema-active";
import {
  computeInvoiceTotals, computeItemTotal, buildPractitionerSnapshot,
  buildInvoiceNumber, getYearFromMs, generateInvoicePdf, renderInvoiceEmail,
  type PractitionerSnapshot, type InvoiceItemDraft,
} from "./invoices";
import {
  attachUser, requireAuth, requireAdmin, isAdminEmail,
  hashPassword, verifyPassword, createSessionFor,
  setSessionCookie, clearSessionCookie, SESSION_COOKIE,
  type AuthedRequest,
} from "./auth";
import {
  sendEmail,
  renderReminderEmail,
  renderRecapEmail,
  renderClientCancellationEmail,
  renderWelcomeVerifyEmail,
  renderPasswordResetEmail,
  getSystemEmailConfig,
  formatRdvDate,
  formatRdvTime,
  type EmailConfig,
  type RecapAppointmentRow,
} from "./email";
import { randomBytes } from "node:crypto";
import { buildIcsForAppointment } from "./ics";
import { renderConfirmationEmail } from "./email-templates/confirmation";
import { renderUserTemplate } from "./email-templates/render-user";
import type { TemplateVars } from "./email-templates/render";
import {
  isGoogleConfigured, getAuthUrl, getTokensFromCode, decodeIdTokenEmail,
  signState, verifyState,
  pushEventToCalendar, updateEventInCalendar, deleteEventFromCalendar,
  listEventsFromCalendar, formatRdvDescription,
  type GoogleTokens, type CalendarEventInput, type GoogleEventLite,
} from "./google";

// Helpers extraits par domaine (Phase 4.0 — voir server/routes/helpers/*).
// Importés sous leur nom d'origine → les sites d'appel restent inchangés.
import { genToken, slugify, publicUser } from "./routes/helpers/tokens";
import { escapeHtmlMin, htmlFeedbackPage } from "./routes/helpers/html";
import { syncApptToGoogle, importFromGoogleForUser } from "./routes/helpers/google-sync";
import { createInvoiceFromAppointment } from "./routes/helpers/invoices";
import { getEmailConfigForUser, sendBookingConfirmationEmail } from "./routes/helpers/email-sending";
import { sendRemindersForUser, sendDailyRecapForUser } from "./routes/helpers/reminders";
import { startCrons } from "./routes/cron";
import { registerCategoryRoutes } from "./routes/categories";
import { registerAvailabilityRoutes } from "./routes/availability";
import { registerProfileRoutes } from "./routes/profile";
import { registerClientRoutes } from "./routes/clients";
import { registerAppointmentRoutes } from "./routes/appointments";
import { registerEmailTemplateRoutes } from "./routes/email-templates";
import { registerReminderRoutes } from "./routes/reminders";
import { registerInvoiceRoutes } from "./routes/invoices";
import { registerAdminRoutes } from "./routes/admin";
import { registerGoogleRoutes } from "./routes/google";
import { registerInternalRoutes } from "./routes/internal";
import { registerPublicRoutes } from "./routes/public";
import { registerAuthRoutes } from "./routes/auth";
import { createContext } from "./routes/_context";

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

  // Rate limiters : singletons module-level dans ./routes/limiters (mêmes seuils/options
  // qu'avant — comportement identique). Importés en tête de fichier ; createContext()
  // réexpose les mêmes instances au domaine public (bookingLimiter).
  app.use("/api/public", publicLimiter);
  app.use("/api/admin", adminLimiter);
  app.use("/api", apiLimiter);

  // Contexte partagé (limiters + config env) injecté aux domaines qui en ont besoin.
  const ctx = createContext();

  // ---------- AUTH ----------
  registerAuthRoutes(app, ctx);

  // ---------- GOOGLE (OAuth + sync manuel) ----------
  registerGoogleRoutes(app);

  // Expose for cron module
  (registerRoutes as any).__importFromGoogleForUser = importFromGoogleForUser;

  // ---------- INTERNAL (déclencheurs cron HTTP, token-gated) ----------
  registerInternalRoutes(app);

  // ---------- PROFILE ----------
  registerProfileRoutes(app);

  // ---------- CATEGORIES ----------
  registerCategoryRoutes(app);

  // ---------- AVAILABILITY ----------
  registerAvailabilityRoutes(app);

  // ---------- CLIENTS ----------
  registerClientRoutes(app);

  // ---------- APPOINTMENTS ----------
  registerAppointmentRoutes(app);

  // ---------- PUBLIC / BOOKING / MANAGE ----------
  // Domaine public (non authentifié) extrait dans server/routes/public.ts.
  // ctx fournit APP_URL (liens email) + bookingLimiter. Le rate-limit /api/public
  // reste assuré par `app.use("/api/public", publicLimiter)` ci-dessus.
  registerPublicRoutes(app, ctx);

  // ---------- INVOICES (Phase 1 facturation) ----------
  registerInvoiceRoutes(app);

  // ---------- ADMIN (email-log + users + impersonate + extend-trial + me) ----------
  registerAdminRoutes(app);

  // ────── PHASE 3 — Reminders UI endpoints (+ rappel manuel PHASE 3.5-D) ──────
  registerReminderRoutes(app);

  // ────── PHASE 3.5-C — Email templates ──────
  registerEmailTemplateRoutes(app);

  startCrons();

  return httpServer;
}
