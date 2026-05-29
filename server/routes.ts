import type { Express, Response, NextFunction } from "express";
import type { Server } from "node:http";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
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

  // Rate limiter for auth + public booking — protects against brute force
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de tentatives, réessayez dans quelques minutes." },
  });
  const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de réservations depuis cette adresse." },
  });

  // ── Phase 3 Lot 5 — Rate limiting global renforcé ────────────────────────
  // apiLimiter : limite générale pour endpoints API authentifiés (anti-abus).
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200,            // 200 req/min/IP — confortable pour un user actif
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de requêtes, ralentissez un peu." },
    skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
  });
  // publicLimiter : protection des endpoints publics contre l'énumération de slugs.
  const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 req/min/IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de requêtes publiques." },
  });
  // adminLimiter : strict, protection en profondeur.
  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de requêtes admin." },
  });
  app.use("/api/public", publicLimiter);
  app.use("/api/admin", adminLimiter);
  app.use("/api", apiLimiter);

  // ---------- AUTH ----------
  const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
  });

  app.post("/api/auth/register", authLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const { email, password, name } = parsed.data;
    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ message: "Un compte existe déjà avec cet email." });

    let baseSlug = slugify(name);
    let slug = baseSlug;
    let n = 1;
    while (await storage.getUserBySlug(slug)) { slug = `${baseSlug}-${n++}`; }

    const now = Date.now();
    const trialEndsAt = now + 7 * 24 * 60 * 60 * 1000; // 7 jours
    const verifyToken = randomBytes(32).toString("hex");
    const verifyExpiresAt = now + 24 * 60 * 60 * 1000; // 24 h

    const user = await storage.createUser({
      email,
      passwordHash: hashPassword(password),
      googleId: null,
      name, slug,
      bio: "",
      photoUrl: null,
      phone: null,
      specialties: "[]",
      address: null,
      city: null,
      googleCalendarToken: null,
      googleCalendarEmail: null,
      emailRemindersEnabled: true,
      publicPageEnabled: true,
      primaryColor: "#186749",
      accentColor: "#17EC9B",
      createdAt: now,
      // Phase 3 Lot 1 — trial 7 j + verification email
      plan: "trial",
      trialEndsAt,
      emailVerifyToken: verifyToken,
      emailVerifyExpiresAt: verifyExpiresAt,
    } as any);

    // Envoi email de confirmation (best effort)
    try {
      const sysCfg = getSystemEmailConfig();
      if (sysCfg) {
        const appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
        const verifyUrl = `${appUrl}/#/verify-email/${verifyToken}`;
        const tpl = renderWelcomeVerifyEmail({
          firstName: name.split(" ")[0] || name,
          verifyUrl,
          appUrl,
        });
        await sendEmail(sysCfg, email, tpl.subject, tpl.html, tpl.text);
      } else {
        console.warn("[register] RESEND_API_KEY non configuré, email de confirmation non envoyé");
      }
    } catch (e: any) {
      console.error("[register] welcome email failed:", e?.message || e);
    }

    const token = await createSessionFor(user.id);
    setSessionCookie(res, token);
    res.json({ user: publicUser(user), token });
  });

  // ---------- PHASE 3 LOT 1 — EMAIL VERIFICATION & PASSWORD RESET ----------
  app.post("/api/auth/verify-email/:token", authLimiter, async (req, res) => {
    const tk = String(req.params.token || "");
    if (!tk || tk.length < 16) return res.status(400).json({ message: "Token invalide" });
    const u = await storage.getUserByEmailVerifyToken(tk);
    if (!u) return res.status(404).json({ message: "Lien invalide ou déjà utilisé" });
    if (u.emailVerifyExpiresAt && u.emailVerifyExpiresAt < Date.now()) {
      return res.status(410).json({ message: "Lien expiré. Demandez un nouveau lien depuis votre compte." });
    }
    const updated = await storage.updateUser(u.id, {
      emailVerifiedAt: Date.now(),
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
    } as any);
    res.json({ ok: true, user: publicUser(updated) });
  });

  app.post("/api/auth/resend-verification", authLimiter, async (req: AuthedRequest, res) => {
    if (!req.userId) return res.status(401).json({ message: "Non authentifié" });
    const u = await storage.getUserById(req.userId);
    if (!u) return res.status(404).json({ message: "Introuvable" });
    if (u.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    const verifyToken = randomBytes(32).toString("hex");
    const verifyExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await storage.updateUser(u.id, {
      emailVerifyToken: verifyToken,
      emailVerifyExpiresAt: verifyExpiresAt,
    } as any);
    try {
      const sysCfg = getSystemEmailConfig();
      if (sysCfg) {
        const appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
        const verifyUrl = `${appUrl}/#/verify-email/${verifyToken}`;
        const tpl = renderWelcomeVerifyEmail({
          firstName: u.name.split(" ")[0] || u.name,
          verifyUrl, appUrl,
        });
        await sendEmail(sysCfg, u.email, tpl.subject, tpl.html, tpl.text);
      }
    } catch (e: any) {
      console.error("[resend-verification]", e?.message || e);
    }
    res.json({ ok: true });
  });

  const forgotSchema = z.object({ email: z.string().email() });
  app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Email invalide" });
    const u = await storage.getUserByEmail(parsed.data.email);
    // Anti-énumération : on répond toujours OK même si email inconnu
    if (u) {
      const resetToken = randomBytes(32).toString("hex");
      const resetExpiresAt = Date.now() + 60 * 60 * 1000; // 1 h
      await storage.updateUser(u.id, {
        passwordResetToken: resetToken,
        passwordResetExpiresAt: resetExpiresAt,
      } as any);
      try {
        const sysCfg = getSystemEmailConfig();
        if (sysCfg) {
          const appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
          const resetUrl = `${appUrl}/#/reset-password/${resetToken}`;
          const tpl = renderPasswordResetEmail({
            firstName: u.name.split(" ")[0] || u.name,
            resetUrl,
          });
          await sendEmail(sysCfg, u.email, tpl.subject, tpl.html, tpl.text);
        }
      } catch (e: any) {
        console.error("[forgot-password]", e?.message || e);
      }
    }
    res.json({ ok: true });
  });

  const resetSchema = z.object({
    token: z.string().min(16),
    password: z.string().min(8),
  });
  app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const u = await storage.getUserByPasswordResetToken(parsed.data.token);
    if (!u) return res.status(404).json({ message: "Lien invalide ou déjà utilisé" });
    if (u.passwordResetExpiresAt && u.passwordResetExpiresAt < Date.now()) {
      return res.status(410).json({ message: "Lien expiré. Demandez un nouveau lien." });
    }
    await storage.updateUser(u.id, {
      passwordHash: hashPassword(parsed.data.password),
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    } as any);
    res.json({ ok: true });
  });

  // Onboarding wizard — first login
  const onboardingSchema = z.object({
    bio: z.string().max(2000).optional(),
    phone: z.string().max(50).optional(),
    city: z.string().max(255).optional(),
    address: z.string().max(500).optional(),
    specialties: z.array(z.string().max(100)).max(20).optional(),
    firstCategory: z.object({
      name: z.string().min(1).max(255),
      durationMinutes: z.number().int().positive(),
      priceCents: z.number().int().min(0),
    }).optional(),
  }).strict();
  app.post("/api/auth/onboarding", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const u = await storage.getUserById(req.userId!);
    if (!u) return res.status(404).json({ message: "Introuvable" });
    const patch: any = { onboardingCompletedAt: Date.now() };
    if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;
    if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
    if (parsed.data.city !== undefined) patch.city = parsed.data.city;
    if (parsed.data.address !== undefined) patch.address = parsed.data.address;
    if (parsed.data.specialties !== undefined) patch.specialties = JSON.stringify(parsed.data.specialties);
    const updated = await storage.updateUser(u.id, patch);
    if (parsed.data.firstCategory) {
      try {
        await storage.createCategory({
          userId: u.id,
          name: parsed.data.firstCategory.name,
          durationMinutes: parsed.data.firstCategory.durationMinutes,
          priceCents: parsed.data.firstCategory.priceCents,
          isActive: true,
        } as any);
      } catch (e: any) {
        console.error("[onboarding] create first category:", e?.message || e);
      }
    }
    res.json({ ok: true, user: publicUser(updated) });
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email et mot de passe requis" });
    const user = await storage.getUserByEmail(email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: "Identifiants incorrects" });
    }
    const token = await createSessionFor(user.id);
    setSessionCookie(res, token);
    res.json({ user: publicUser(user), token });
  });

  app.post("/api/auth/logout", async (req: AuthedRequest, res) => {
    const token = (req as any).cookies?.[SESSION_COOKIE];
    if (token) await storage.deleteSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req: AuthedRequest, res) => {
    if (!req.userId) return res.status(401).json({ message: "Non authentifié" });
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    res.json({ user: publicUser(user) });
  });

  // ---------- PHASE 3 LOT 5 — GDPR (export + suppression compte) ----------
  // Export complet des données du user authentifié (droit d'accès RGPD).
  app.get("/api/auth/me/export", requireAuth, async (req: AuthedRequest, res) => {
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const [categories, allClients, allAppointments, allNotes, allInvoices] = await Promise.all([
      storage.listCategories(user.id),
      storage.listClients(user.id),
      storage.listAppointments(user.id),
      storage.listNotesForUser(user.id),
      storage.listInvoices(user.id),
    ]);
    // Pour chaque facture, on récupère ses items.
    const invoicesWithItems = await Promise.all(
      allInvoices.map(async (inv) => ({
        ...inv,
        items: await storage.getInvoiceItems(inv.id),
      }))
    );
    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: publicUser(user),
      categories,
      clients: allClients,
      appointments: allAppointments,
      notes: allNotes,
      invoices: invoicesWithItems,
      counts: {
        categories: categories.length,
        clients: allClients.length,
        appointments: allAppointments.length,
        notes: allNotes.length,
        invoices: invoicesWithItems.length,
      },
    };
    const filename = `naturo-pro-export-${user.slug}-${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportData, null, 2));
  });

  // Suppression définitive du compte (droit à l'effacement RGPD).
  // Confirmation par mot de passe + flag `confirm: true` requis.
  const deleteMeSchema = z.object({
    password: z.string().min(1),
    confirm: z.literal(true),
  });
  app.delete("/api/auth/me", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = deleteMeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Confirmation invalide", errors: parsed.error.errors });
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    if (hashPassword(parsed.data.password) !== user.passwordHash) {
      return res.status(403).json({ message: "Mot de passe incorrect" });
    }
    // Bloquer la suppression du compte demo et du compte owner pour sécurité.
    if (user.email === "marie@demo.fr" || user.email === "jrayes000@gmail.com") {
      return res.status(403).json({ message: "Ce compte est protégé et ne peut pas être supprimé." });
    }
    console.log(`[gdpr-delete] user=${user.id} email=${user.email} slug=${user.slug}`);
    await storage.deleteUserCascade(user.id);
    // Clear cookie
    res.clearCookie("naturo_session", { path: "/" });
    res.json({ ok: true, message: "Votre compte et toutes vos données ont été supprimés." });
  });

  // Initiate OAuth — must be authenticated so we can attach tokens to the right user.
  app.get("/api/auth/google", async (req: AuthedRequest, res) => {
    if (!isGoogleConfigured()) {
      return res.status(503).json({ message: "Connexion Google non configurée. Définissez GOOGLE_CLIENT_ID." });
    }
    if (!req.userId) {
      return res.redirect("/?error=not_authenticated#/login");
    }
    const state = signState({ userId: req.userId });
    const url = getAuthUrl(state);
    res.redirect(url!);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    if (!isGoogleConfigured()) return res.redirect("/?google=error&reason=not_configured#/app/settings");
    try {
      if (req.query.error) {
        return res.redirect("/?google=error&reason=" + encodeURIComponent(String(req.query.error)) + "#/app/settings");
      }
      const code = String(req.query.code || "");
      const stateRaw = String(req.query.state || "");
      const state = verifyState(stateRaw);
      if (!state || !state.userId) {
        return res.redirect("/?google=error&reason=invalid_state#/app/settings");
      }
      const tokens = await getTokensFromCode(code);
      if (!tokens) return res.redirect("/?google=error&reason=no_tokens#/app/settings");
      const email = decodeIdTokenEmail(tokens.id_token);
      await storage.updateUser(state.userId, {
        googleCalendarToken: JSON.stringify(tokens),
        googleCalendarEmail: email,
      });
      console.log("[google] tokens stored for user", state.userId, "email=", email);
      res.redirect("/?google=ok#/app/settings");
    } catch (e: any) {
      console.error("[google] callback error:", e?.message || e);
      res.redirect("/?google=error&reason=" + encodeURIComponent(e?.message || "unknown") + "#/app/settings");
    }
  });

  // Status: configured server-side + connected for current user.
  app.get("/api/google/status", async (req: AuthedRequest, res) => {
    const configured = isGoogleConfigured();
    let connected = false;
    let email: string | null = null;
    if (req.userId) {
      const u = await storage.getUserById(req.userId);
      connected = !!(u?.googleCalendarToken);
      email = u?.googleCalendarEmail || null;
    }
    res.json({ configured, connected, email });
  });

  // Disconnect: clear stored tokens for current user.
  app.post("/api/google/disconnect", requireAuth, async (req: AuthedRequest, res) => {
    await storage.updateUser(req.userId!, {
      googleCalendarToken: null,
      googleCalendarEmail: null,
    });
    res.json({ ok: true });
  });

  // Expose for cron module
  (registerRoutes as any).__importFromGoogleForUser = importFromGoogleForUser;

  // ---------- Manual sync trigger (UI button) ----------
  app.post("/api/google/sync-import", requireAuth, async (req: AuthedRequest, res) => {
    if (!isGoogleConfigured()) return res.status(400).json({ message: "Google non configuré" });
    const u = await storage.getUserById(req.userId!);
    if (!u?.googleCalendarToken) return res.status(400).json({ message: "Compte Google non connecté" });
    const stats = await importFromGoogleForUser(req.userId!);
    res.json({ ok: true, ...stats });
  });

  // ---------- Internal cron-trigger endpoint (token-protected) ----------
  // Called by Hostinger cron every 15 minutes via curl with X-Internal-Token header.
  app.post("/api/internal/sync-google-all", async (req, res) => {
    const expected = process.env.INTERNAL_CRON_TOKEN;
    if (!expected) return res.status(500).json({ message: "INTERNAL_CRON_TOKEN missing" });
    const provided = req.header("X-Internal-Token") || req.query.token;
    if (provided !== expected) return res.status(403).json({ message: "Forbidden" });

    const usersWithToken = await storage.listUsersWithGoogleToken();
    const results: any[] = [];
    for (const u of usersWithToken) {
      try {
        const stats = await importFromGoogleForUser(u.id);
        results.push({ userId: u.id, email: u.email, ...stats });
      } catch (e: any) {
        results.push({ userId: u.id, email: u.email, error: e?.message || String(e) });
      }
    }
    res.json({ ok: true, processedAt: Date.now(), results });
  });

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

  // ---------- PUBLIC ----------
  // Phase 3 Lot 2 — Variante "tenant courant" pour les sous-domaines personnels.
  // Le frontend utilise cette route quand il détecte qu'il est sur {slug}.app.ecole-naturo.fr
  // (le slug est déjà résolu côté serveur via le middleware subdomainTenant).
  app.get("/api/public/_self", async (req: AuthedRequest, res) => {
    if (req.tenantNotFound) return res.status(404).json({ message: "Page introuvable" });
    if (!req.tenantUserId) return res.status(404).json({ message: "Page introuvable" });
    const u = await storage.getUserById(req.tenantUserId);
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });
    const cats = (await storage.listCategories(u.id)).filter(c => c.isActive);
    res.json({
      naturo: {
        name: u.name, slug: u.slug, bio: u.bio, photoUrl: u.photoUrl,
        city: u.city, address: u.address,
        specialties: JSON.parse(u.specialties || "[]"),
        primaryColor: u.primaryColor, accentColor: u.accentColor,
      },
      categories: cats,
    });
  });

  app.get("/api/public/:slug", async (req, res) => {
    const u = await storage.getUserBySlug(req.params.slug);
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });
    const cats = (await storage.listCategories(u.id)).filter(c => c.isActive);
    res.json({
      naturo: {
        name: u.name, slug: u.slug, bio: u.bio, photoUrl: u.photoUrl,
        city: u.city, address: u.address,
        specialties: JSON.parse(u.specialties || "[]"),
        primaryColor: u.primaryColor, accentColor: u.accentColor,
      },
      categories: cats,
    });
  });

  // Compute available slots for a slug between from..to (timestamps ms)
  app.get("/api/public/:slug/availability", async (req, res) => {
    const u = await storage.getUserBySlug(req.params.slug);
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });
    const from = req.query.from ? Number(req.query.from) : Date.now();
    const to = req.query.to ? Number(req.query.to) : (Date.now() + 21 * 86400000);
    const durationMin = Math.max(15, Number(req.query.duration || 60));
    const stepMin = 30;

    const avail = await storage.listAvailability(u.id);
    const appts = await storage.listAppointments(u.id, from, to);
    const apptRanges = appts.filter(a => a.status !== "cancelled").map(a => [a.startAt, a.endAt] as [number, number]);

    const slotsByDay: Record<string, string[]> = {};
    const minBookHorizon = Date.now() + 2 * 3600 * 1000;

    for (let t = from; t <= to; t += 86400000) {
      const d = new Date(t); d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      const todays = avail.filter(a => a.dayOfWeek === dow);
      for (const a of todays) {
        const [sh, sm] = a.startTime.split(":").map(Number);
        const [eh, em] = a.endTime.split(":").map(Number);
        const start = new Date(d); start.setHours(sh, sm, 0, 0);
        const end = new Date(d); end.setHours(eh, em, 0, 0);
        for (let cur = start.getTime(); cur + durationMin * 60000 <= end.getTime(); cur += stepMin * 60000) {
          if (cur < minBookHorizon) continue;
          const slotEnd = cur + durationMin * 60000;
          const overlaps = apptRanges.some(([s, e]) => cur < e && slotEnd > s);
          if (overlaps) continue;
          const key = new Date(cur).toISOString().slice(0, 10);
          if (!slotsByDay[key]) slotsByDay[key] = [];
          slotsByDay[key].push(new Date(cur).toISOString());
        }
      }
    }
    res.json({ slotsByDay });
  });

  app.post("/api/public/:slug/book", async (req, res) => {
    const u = await storage.getUserBySlug(req.params.slug);
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });

    const schema = z.object({
      categoryId: z.number().int(),
      startAt: z.number().int(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(4),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    const { categoryId, startAt, firstName, lastName, email, phone, notes } = parsed.data;

    const cat = await storage.getCategory(categoryId);
    if (!cat || cat.userId !== u.id) return res.status(400).json({ message: "Catégorie invalide" });
    if (startAt < Date.now() + 2 * 3600 * 1000) return res.status(400).json({ message: "Créneau trop proche" });

    const endAt = startAt + cat.durationMinutes * 60000;
    // Check no overlap
    const sameDayAppts = await storage.listAppointments(u.id, startAt - 86400000, endAt + 86400000);
    const overlap = sameDayAppts.some(a => a.status !== "cancelled" && startAt < a.endAt && endAt > a.startAt);
    if (overlap) return res.status(409).json({ message: "Ce créneau n'est plus disponible" });

    let appt = await storage.createAppointment({
      userId: u.id, clientId: null, categoryId,
      startAt, endAt, status: "confirmed",
      clientFirstName: firstName, clientLastName: lastName,
      clientEmail: email, clientPhone: phone,
      notesBefore: notes || null,
      location: cat.location, googleEventId: null, reminderSent: false,
    });

    // Push to Google Calendar if practitioner has connected
    const eventId = await syncApptToGoogle("create", u.id, appt);
    if (eventId) {
      const refreshed = await storage.updateAppointment(appt.id, { googleEventId: eventId });
      if (refreshed) appt = refreshed;
    }

    // ── Phase 3.5-A : email de confirmation au client ────────────────────────
    // Envoyé uniquement si le client a fourni une adresse email.
    // Wrap en try/catch : un échec d'email ne bloque JAMAIS la création du RDV.
    if (email) {
      void sendBookingConfirmationEmail(u, appt, cat).catch((e) =>
        console.error("[booking-confirm] unexpected:", e),
      );
    }

    res.json({ appointment: appt, category: cat });
  });

  // ---------- INVOICES (Phase 1 facturation) ----------
  registerInvoiceRoutes(app);

  // ---------- ADMIN (email-log + users + impersonate + extend-trial + me) ----------
  registerAdminRoutes(app);

  const APP_URL = process.env.APP_URL || "https://app.ecole-naturo.fr";
  const INTERNAL_TOKEN = process.env.INTERNAL_CRON_TOKEN;

  app.get("/api/rdv/confirm/:token", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByConfirmToken(token);
    if (!appt) {
      return res.status(404).type("html").send(htmlFeedbackPage(
        "error",
        "Lien invalide ou expiré",
        "Ce lien de confirmation n'est pas valide. Si vous avez un doute, contactez directement votre praticienne.",
      ));
    }
    if ((appt as any).clientCancelledAt) {
      return res.type("html").send(htmlFeedbackPage(
        "warning",
        "Rendez-vous déjà annulé",
        "Ce rendez-vous a déjà été annulé via le lien d'annulation.",
      ));
    }
    const dateText = formatRdvDate(appt.startAt);
    if (!(appt as any).clientConfirmedAt) {
      await storage.updateAppointment(appt.id, { clientConfirmedAt: Date.now() } as any);
    }
    return res.type("html").send(htmlFeedbackPage(
      "success",
      "Présence confirmée — merci",
      `Votre présence est bien confirmée pour le <strong>${escapeHtmlMin(dateText)}</strong>. À très vite.`,
    ));
  });

  // ─── Endpoint public : annulation client par token ──────────────────────────
  app.get("/api/rdv/cancel/:token", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) {
      return res.status(404).type("html").send(htmlFeedbackPage(
        "error",
        "Lien invalide ou expiré",
        "Ce lien d'annulation n'est pas valide. Contactez directement votre praticienne pour annuler.",
      ));
    }
    if ((appt as any).clientCancelledAt) {
      const dateText = formatRdvDate(appt.startAt);
      return res.type("html").send(htmlFeedbackPage(
        "warning",
        "Rendez-vous déjà annulé",
        `Votre rendez-vous du ${escapeHtmlMin(dateText)} a déjà été annulé. Si c'est une erreur, contactez votre praticienne.`,
      ));
    }

    const dateText = formatRdvDate(appt.startAt);
    await storage.updateAppointment(appt.id, {
      clientCancelledAt: Date.now(),
      status: "cancelled",
    } as any);

    // Prévenir la praticienne par email
    try {
      const user = await storage.getUserById(appt.userId);
      const cfg = user ? getEmailConfigForUser(user) : null;
      if (user && cfg && user.email) {
        let clientName = `${appt.clientFirstName || ""} ${appt.clientLastName || ""}`.trim();
        if (appt.clientId) {
          const c = await storage.getClient(appt.clientId);
          if (c) clientName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
        }
        const { subject, html, text } = renderClientCancellationEmail({
          practitionerFirstName: (user.name || user.email).split(" ")[0],
          clientName: clientName || "(client inconnu)",
          rdvDateText: dateText,
          appUrl: APP_URL,
        });
        await sendEmail(cfg, user.email, subject, html, text);
      }
    } catch (e: any) {
      console.error("[cancel-notify]", e?.message || e);
    }

    return res.type("html").send(htmlFeedbackPage(
      "success",
      "Rendez-vous annulé",
      `Votre rendez-vous du ${escapeHtmlMin(dateText)} a bien été annulé. Votre praticienne a été prévenue. À bientôt.`,
    ));
  });

  // ─── Endpoints internes (X-Internal-Token gated) ────────────────────────────
  function checkInternalToken(req: any, res: any): boolean {
    if (!INTERNAL_TOKEN) {
      res.status(500).json({ message: "INTERNAL_CRON_TOKEN non configuré côté serveur" });
      return false;
    }
    const token = req.headers["x-internal-token"];
    if (token !== INTERNAL_TOKEN) {
      res.status(401).json({ message: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.post("/api/internal/send-reminders", async (req, res) => {
    if (!checkInternalToken(req, res)) return;
    const users = await storage.listUsersWithEmailConfig();
    const results: any[] = [];
    for (const u of users) {
      try {
        const r = await sendRemindersForUser(u);
        results.push({ userId: u.id, ...r });
      } catch (e: any) {
        results.push({ userId: u.id, error: e?.message || String(e) });
      }
    }
    res.json({ ok: true, totalUsers: users.length, results });
  });

  app.post("/api/internal/send-daily-recap", async (req, res) => {
    if (!checkInternalToken(req, res)) return;
    const users = await storage.listUsersWithEmailConfig();
    const results: any[] = [];
    for (const u of users) {
      try {
        const r = await sendDailyRecapForUser(u);
        results.push({ userId: u.id, ...r });
      } catch (e: any) {
        results.push({ userId: u.id, error: e?.message || String(e) });
      }
    }
    res.json({ ok: true, totalUsers: users.length, results });
  });

  // ────── PHASE 3 — Reminders UI endpoints (+ rappel manuel PHASE 3.5-D) ──────
  registerReminderRoutes(app);

  // ────── PHASE 3.5-C — Email templates ──────
  registerEmailTemplateRoutes(app);


  // ────── PHASE 3.5-B — Public manage routes ──────────────────────────────────
  // Toutes sous /api/public/* => déjà couvertes par publicLimiter (60/min/IP)

  /**
   * GET /api/public/manage/:token
   * Retourne les infos du RDV associé au cancelToken.
   * 404 si token invalide ou RDV passé ET non annulé.
   */
  app.get("/api/public/manage/:token", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const now = Date.now();
    const isPast = appt.startAt < now;
    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;

    // RDV passé et non annulé => 404
    if (isPast && !isCancelled) return res.status(404).json({ message: "Ce lien n'est plus valide (RDV passé)" });

    const user = await storage.getUserById(appt.userId);
    const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;

    const canCancel = !isCancelled && !isPast;
    const canReschedule = !isCancelled && !isPast;

    res.json({
      appointment: {
        id: appt.id,
        date: appt.startAt,
        time: appt.startAt,
        duration: cat ? cat.durationMinutes : Math.round(((appt as any).endAt - appt.startAt) / 60000),
        categoryName: cat ? cat.name : null,
        practitionerName: user ? user.name : null,
        practitionerSlug: user ? user.slug : null,
        address: user ? (user.address || user.city || null) : null,
        status: appt.status || "confirmed",
        startAt: appt.startAt,
        endAt: (appt as any).endAt,
        clientFirstName: appt.clientFirstName,
        clientLastName: appt.clientLastName,
      },
      canCancel,
      canReschedule,
    });
  });

  /**
   * POST /api/public/manage/:token/cancel
   * Annule le RDV. 409 si déjà annulé.
   */
  app.post("/api/public/manage/:token/cancel", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;
    if (isCancelled) return res.status(409).json({ message: "Ce RDV est déjà annulé" });

    const isPast = appt.startAt < Date.now();
    if (isPast) return res.status(409).json({ message: "Ce RDV est déjà passé" });

    await storage.updateAppointment(appt.id, {
      status: "cancelled",
      clientCancelledAt: Date.now(),
    } as any);

    // Notifier la praticienne — PHASE 3.5.5 : try DB-editable template first, fallback hardcodé
    try {
      const user = await storage.getUserById(appt.userId);
      const cfg = user ? getEmailConfigForUser(user) : null;
      if (user && cfg && user.email) {
        let clientName = `${appt.clientFirstName || ""} ${appt.clientLastName || ""}`.trim();
        let clientEmailAddr = appt.clientEmail || "";
        if (appt.clientId) {
          const c = await storage.getClient(appt.clientId);
          if (c) {
            clientName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
            clientEmailAddr = c.email || clientEmailAddr;
          }
        }
        const rdvDateText = formatRdvDate(appt.startAt);
        const fallback = renderClientCancellationEmail({
          practitionerFirstName: (user.name || user.email).split(" ")[0],
          clientName: clientName || "(client inconnu)",
          rdvDateText,
          appUrl: APP_URL,
        });

        const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
        const startDate = new Date(appt.startAt);
        const hh = String(startDate.getHours()).padStart(2, "0");
        const mm = String(startDate.getMinutes()).padStart(2, "0");
        const tplVars: TemplateVars = {
          "client.name": clientName || "(client inconnu)",
          "client.email": clientEmailAddr,
          "appointment.date": rdvDateText,
          "appointment.time": `${hh}:${mm}`,
          "appointment.duration": cat?.durationMinutes ? `${cat.durationMinutes} min` : "",
          "appointment.category": cat?.name || "",
          "appointment.address": appt.location || cat?.location || "",
          "practitioner.name": user.name || user.email || "",
          "practitioner.email": user.email || "",
          "cancelLink": "",
        };
        const userTpl = await renderUserTemplate(user.id, "cancellation", tplVars);
        const subject = userTpl?.subject ?? fallback.subject;
        const html = userTpl?.html ?? fallback.html;
        const text = fallback.text;
        await sendEmail(cfg, user.email, subject, html, text);
      }
    } catch (e: any) {
      console.error("[manage/cancel-notify]", e?.message || e);
    }

    res.json({ ok: true, message: "RDV annulé avec succès" });
  });

  /**
   * GET /api/public/manage/:token/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Retourne les créneaux dispos du même praticien.
   * Par défaut : 7 jours à partir d'aujourd'hui.
   */
  app.get("/api/public/manage/:token/slots", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;
    if (isCancelled) return res.status(409).json({ message: "RDV déjà annulé" });

    const u = await storage.getUserById(appt.userId);
    if (!u) return res.status(404).json({ message: "Praticien introuvable" });

    const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
    const durationMin = cat ? cat.durationMinutes : 60;

    // Fenêtre par défaut : 7 jours
    const fromParam = req.query.from ? new Date(req.query.from as string).getTime() : Date.now();
    const toParam = req.query.to ? new Date(req.query.to as string).getTime() : (Date.now() + 7 * 86400000);
    const from = isNaN(fromParam) ? Date.now() : fromParam;
    const to = isNaN(toParam) ? (Date.now() + 7 * 86400000) : toParam;
    const stepMin = 30;

    const avail = await storage.listAvailability(u.id);
    const existing = await storage.listAppointments(u.id, from, to);
    // Exclure le RDV courant de la liste des conflits (il sera remplacé)
    const apptRanges = existing
      .filter(a => a.status !== "cancelled" && a.id !== appt.id)
      .map(a => [a.startAt, (a as any).endAt] as [number, number]);

    const slotsByDay: Record<string, string[]> = {};
    const minBookHorizon = Date.now() + 2 * 3600 * 1000;

    for (let t = from; t <= to; t += 86400000) {
      const d = new Date(t); d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      const todays = avail.filter(a => a.dayOfWeek === dow);
      for (const a of todays) {
        const [sh, sm] = a.startTime.split(":").map(Number);
        const [eh, em] = a.endTime.split(":").map(Number);
        const start = new Date(d); start.setHours(sh, sm, 0, 0);
        const end = new Date(d); end.setHours(eh, em, 0, 0);
        for (let cur = start.getTime(); cur + durationMin * 60000 <= end.getTime(); cur += stepMin * 60000) {
          if (cur < minBookHorizon) continue;
          const slotEnd = cur + durationMin * 60000;
          const overlaps = apptRanges.some(([s, e]) => cur < e && slotEnd > s);
          if (overlaps) continue;
          const key = new Date(cur).toISOString().slice(0, 10);
          if (!slotsByDay[key]) slotsByDay[key] = [];
          slotsByDay[key].push(new Date(cur).toISOString());
        }
      }
    }

    res.json({ slotsByDay, durationMinutes: durationMin });
  });

  /**
   * POST /api/public/manage/:token/reschedule
   * Body: { newStartMs: number }
   * Annule l'ancien RDV, crée un nouveau, retourne le nouveau token.
   */
  app.post("/api/public/manage/:token/reschedule", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;
    if (isCancelled) return res.status(409).json({ message: "Ce RDV est déjà annulé" });

    const isPast = appt.startAt < Date.now();
    if (isPast) return res.status(409).json({ message: "Ce RDV est déjà passé" });

    const rescheduleSchema = z.object({ newStartMs: z.number().int() });
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "newStartMs requis" });
    const { newStartMs } = parsed.data;

    if (newStartMs < Date.now() + 2 * 3600 * 1000) {
      return res.status(400).json({ message: "Créneau trop proche" });
    }

    const u = await storage.getUserById(appt.userId);
    if (!u) return res.status(404).json({ message: "Praticien introuvable" });

    const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
    const durationMin = cat ? cat.durationMinutes : Math.round(((appt as any).endAt - appt.startAt) / 60000);
    const newEndMs = newStartMs + durationMin * 60000;

    // Vérifier non-chevauchement (exclusion du RDV actuel)
    const sameDayAppts = await storage.listAppointments(u.id, newStartMs - 86400000, newEndMs + 86400000);
    const overlap = sameDayAppts.some(a =>
      a.status !== "cancelled" && a.id !== appt.id && newStartMs < (a as any).endAt && newEndMs > a.startAt
    );
    if (overlap) return res.status(409).json({ message: "Ce créneau n'est plus disponible" });

    // Annuler l'ancien RDV
    await storage.updateAppointment(appt.id, {
      status: "cancelled",
      clientCancelledAt: Date.now(),
    } as any);

    // Générer un nouveau cancelToken
    const newCancelToken = randomBytes(16).toString("hex");

    // Créer le nouveau RDV
    const newAppt = await storage.createAppointment({
      userId: appt.userId,
      clientId: appt.clientId,
      categoryId: appt.categoryId,
      startAt: newStartMs,
      endAt: newEndMs,
      status: "confirmed",
      clientFirstName: appt.clientFirstName,
      clientLastName: appt.clientLastName,
      clientEmail: appt.clientEmail,
      clientPhone: appt.clientPhone,
      notesBefore: appt.notesBefore,
      location: appt.location,
      googleEventId: null,
      reminderSent: false,
      cancelToken: newCancelToken,
    } as any);

    res.json({
      ok: true,
      newToken: newCancelToken,
      appointment: {
        id: newAppt.id,
        startAt: newAppt.startAt,
        endAt: (newAppt as any).endAt,
        status: newAppt.status,
      },
    });
  });

  startCrons();

  return httpServer;
}
