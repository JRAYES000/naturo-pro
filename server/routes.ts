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

// ── Mass-assignment whitelists (Phase 3 Lot 1 — security hardening) ─────────
// Ces schémas Zod limitent les champs modifiables via PATCH/POST, empêchant
// un attaquant de transférer une ressource vers un autre user via {userId:X}.
const patchAppointmentSchema = z.object({
  clientId: z.number().int().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  startAt: z.number().int().optional(),
  endAt: z.number().int().optional(),
  status: z.enum(["confirmed", "cancelled", "completed", "blocked"]).optional(),
  clientFirstName: z.string().nullable().optional(),
  clientLastName: z.string().nullable().optional(),
  clientEmail: z.string().nullable().optional(),
  clientPhone: z.string().nullable().optional(),
  notesBefore: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  reminderSent: z.boolean().optional(),
  paymentStatus: z.enum(["unpaid", "paid", "partial"]).optional(),
  paymentAmountCents: z.number().int().min(0).optional(),
  clientConfirmedAt: z.number().int().nullable().optional(),
  clientCancelledAt: z.number().int().nullable().optional(),
}).strict();

const noteContentSchema = z.object({
  motif: z.string().nullable().optional(),
  anamnese: z.string().nullable().optional(),
  bilan: z.string().nullable().optional(),
  conseilsAlimentaires: z.string().nullable().optional(),
  hygieneDeVie: z.string().nullable().optional(),
  suivi: z.string().nullable().optional(),
  notesLibres: z.string().nullable().optional(),
}).strict();

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
  app.get("/api/appointments", requireAuth, async (req: AuthedRequest, res) => {
    const from = req.query.from ? Number(req.query.from) : undefined;
    const to = req.query.to ? Number(req.query.to) : undefined;
    res.json(await storage.listAppointments(req.userId!, from, to));
  });
  app.post("/api/appointments", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = insertAppointmentSchema.safeParse({ ...req.body, userId: req.userId });
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    let appt = await storage.createAppointment(parsed.data);
    const eventId = await syncApptToGoogle("create", req.userId!, appt);
    if (eventId) {
      const refreshed = await storage.updateAppointment(appt.id, { googleEventId: eventId });
      if (refreshed) appt = refreshed;
    }
    res.json(appt);
  });
  // Lot 5 — isolation : GET détail avec ownership filter
  app.get("/api/appointments/:id", requireAuth, async (req: AuthedRequest, res) => {
    const a = await storage.getAppointment(Number(req.params.id));
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(a);
  });
  app.patch("/api/appointments/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const a = await storage.getAppointment(id);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = patchAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const wasCompleted = a.status === "completed";
    let updated = await storage.updateAppointment(id, parsed.data as any);
    if (!updated) return res.status(404).json({ message: "Introuvable" });
    const eventId = await syncApptToGoogle("update", req.userId!, updated);
    if (eventId && eventId !== updated.googleEventId) {
      const refreshed = await storage.updateAppointment(id, { googleEventId: eventId });
      if (refreshed) updated = refreshed;
    }
    // Hook auto-facture : si le RDV passe en "completed" et toggle activé
    if (!wasCompleted && updated.status === "completed") {
      try {
        const user = await storage.getUserById(req.userId!);
        if (user?.autoInvoiceOnCompleted) {
          const existing = await storage.getInvoiceByAppointment(id);
          if (!existing) {
            await createInvoiceFromAppointment(req.userId!, updated, user);
          }
        }
      } catch (e: any) {
        console.error("[auto-invoice]", e?.message || e);
      }
    }
    res.json(updated);
  });
  app.delete("/api/appointments/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const a = await storage.getAppointment(id);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await syncApptToGoogle("delete", req.userId!, a);
    await storage.deleteAppointment(id);
    res.json({ ok: true });
  });

  // ---------- NOTES ----------
  app.get("/api/appointments/:id/note", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const a = await storage.getAppointment(id);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(await storage.getNoteByAppointment(id) || null);
  });
  app.post("/api/appointments/:id/note", requireAuth, async (req: AuthedRequest, res) => {
    const apptId = Number(req.params.id);
    const a = await storage.getAppointment(apptId);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = noteContentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const existing = await storage.getNoteByAppointment(apptId);
    if (existing) return res.json(await storage.updateNote(existing.id, { ...parsed.data, updatedAt: Date.now() } as any));
    const tnow = Date.now();
    const note = await storage.createNote({
      ...parsed.data,
      appointmentId: apptId,
      clientId: a.clientId!,
      userId: req.userId!,
      createdAt: tnow, updatedAt: tnow,
    } as any);
    res.json(note);
  });
  app.patch("/api/notes/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const n = await storage.getNote(id);
    if (!n || n.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = noteContentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    res.json(await storage.updateNote(id, { ...parsed.data, updatedAt: Date.now() } as any));
  });

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

  // Helper interne : créer une facture à partir d'un RDV (utilisé par auto-hook + endpoint manuel)
  // GET /api/invoices?status=&from=&to=&clientId=
  app.get("/api/invoices", requireAuth, async (req: AuthedRequest, res) => {
    const opts: any = {};
    if (req.query.status) opts.status = String(req.query.status);
    if (req.query.from) opts.from = Number(req.query.from);
    if (req.query.to) opts.to = Number(req.query.to);
    if (req.query.clientId) opts.clientId = Number(req.query.clientId);
    const list = await storage.listInvoices(req.userId!, opts);
    res.json(list);
  });

  // GET /api/invoices/:id
  app.get("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    res.json({ ...inv, items });
  });

  // POST /api/invoices  (création manuelle libre)
  const invoiceItemSchema = z.object({
    description: z.string().min(1),
    quantity: z.number().min(0).default(1),
    unitPriceCents: z.number().int().nonnegative().default(0),
  });
  const invoiceCreateSchema = z.object({
    clientId: z.number().int().positive().nullable().optional(),
    appointmentId: z.number().int().positive().nullable().optional(),
    clientFirstName: z.string().optional(),
    clientLastName: z.string().optional(),
    clientEmail: z.string().optional(),
    clientAddress: z.string().nullable().optional(),
    clientPostalCode: z.string().nullable().optional(),
    clientCity: z.string().nullable().optional(),
    issueDate: z.number().optional(),
    dueDate: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).min(1),
  });
  app.post("/api/invoices", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = invoiceCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
    const data = parsed.data;
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });

    let clientFirstName = data.clientFirstName || "";
    let clientLastName = data.clientLastName || "";
    let clientEmail = data.clientEmail || "";
    let clientAddress = data.clientAddress ?? null;
    let clientPostalCode = data.clientPostalCode ?? null;
    let clientCity = data.clientCity ?? null;
    if (data.clientId) {
      const c = await storage.getClient(data.clientId);
      if (c && c.userId === req.userId) {
        clientFirstName = clientFirstName || c.firstName || "";
        clientLastName = clientLastName || c.lastName || "";
        clientEmail = clientEmail || c.email || "";
        clientAddress = clientAddress ?? ((c as any).address || null);
        clientPostalCode = clientPostalCode ?? ((c as any).postalCode || null);
        clientCity = clientCity ?? ((c as any).city || null);
      }
    }

    const vatEnabled = !!user.billingVatEnabled;
    const vatRate = user.billingVatRate ?? 2000;
    const totals = computeInvoiceTotals(data.items, vatEnabled, vatRate);
    const issueDate = data.issueDate || Date.now();
    const year = getYearFromMs(issueDate);
    const counter = await storage.nextInvoiceCounter(req.userId!, year);
    const number = buildInvoiceNumber(year, counter);
    const snapshot = buildPractitionerSnapshot(user);

    const inv = await storage.createInvoice({
      userId: req.userId!,
      number,
      status: "draft",
      issueDate,
      dueDate: data.dueDate ?? null,
      appointmentId: data.appointmentId ?? null,
      clientId: data.clientId ?? null,
      clientFirstName,
      clientLastName,
      clientEmail,
      clientAddress,
      clientPostalCode,
      clientCity,
      subtotalCents: totals.subtotalCents,
      vatCents: totals.vatCents,
      totalCents: totals.totalCents,
      vatRate,
      vatEnabled,
      paymentMethod: null,
      paidAt: null,
      sentAt: null,
      notes: data.notes ?? null,
      practitionerSnapshot: JSON.stringify(snapshot),
      createdAt: issueDate,
      updatedAt: issueDate,
    } as any);

    await storage.replaceInvoiceItems(inv.id, data.items.map((it, i) => ({
      invoiceId: inv.id,
      position: i,
      description: it.description,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      totalCents: computeItemTotal(it.quantity, it.unitPriceCents),
    })) as any);

    const items = await storage.getInvoiceItems(inv.id);
    res.status(201).json({ ...inv, items });
  });

  // POST /api/invoices/from-appointment/:id  (création pré-remplie depuis un RDV)
  app.post("/api/invoices/from-appointment/:id", requireAuth, async (req: AuthedRequest, res) => {
    const apptId = Number(req.params.id);
    const appt = await storage.getAppointment(apptId);
    if (!appt || appt.userId !== req.userId) return res.status(404).json({ message: "RDV introuvable" });
    const existing = await storage.getInvoiceByAppointment(apptId);
    if (existing) {
      const items = await storage.getInvoiceItems(existing.id);
      return res.status(200).json({ ...existing, items, alreadyExists: true });
    }
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const inv = await createInvoiceFromAppointment(req.userId!, appt, user);
    const items = await storage.getInvoiceItems(inv.id);
    res.status(201).json({ ...inv, items });
  });

  // PATCH /api/invoices/:id  (statut, paiement, lignes, notes)
  const invoicePatchSchema = z.object({
    status: z.enum(["draft", "sent", "paid", "cancelled"]).optional(),
    paymentMethod: z.enum(["cash", "check", "transfer", "card"]).nullable().optional(),
    paidAt: z.number().nullable().optional(),
    dueDate: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).optional(),
    clientFirstName: z.string().optional(),
    clientLastName: z.string().optional(),
    clientEmail: z.string().optional(),
    clientAddress: z.string().nullable().optional(),
    clientPostalCode: z.string().nullable().optional(),
    clientCity: z.string().nullable().optional(),
  });
  app.patch("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = invoicePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
    const data = parsed.data;
    const patch: any = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.paymentMethod !== undefined) patch.paymentMethod = data.paymentMethod;
    if (data.paidAt !== undefined) patch.paidAt = data.paidAt;
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.clientFirstName !== undefined) patch.clientFirstName = data.clientFirstName;
    if (data.clientLastName !== undefined) patch.clientLastName = data.clientLastName;
    if (data.clientEmail !== undefined) patch.clientEmail = data.clientEmail;
    if (data.clientAddress !== undefined) patch.clientAddress = data.clientAddress;
    if (data.clientPostalCode !== undefined) patch.clientPostalCode = data.clientPostalCode;
    if (data.clientCity !== undefined) patch.clientCity = data.clientCity;

    // Auto-set paidAt si status passe à paid sans date
    if (data.status === "paid" && !inv.paidAt && data.paidAt === undefined) {
      patch.paidAt = Date.now();
    }

    // Si lignes mises à jour, recalculer totaux
    if (data.items) {
      const totals = computeInvoiceTotals(data.items, !!inv.vatEnabled, inv.vatRate ?? 0);
      patch.subtotalCents = totals.subtotalCents;
      patch.vatCents = totals.vatCents;
      patch.totalCents = totals.totalCents;
      await storage.replaceInvoiceItems(id, data.items.map((it, i) => ({
        invoiceId: id,
        position: i,
        description: it.description,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
        totalCents: computeItemTotal(it.quantity, it.unitPriceCents),
      })) as any);
    }
    const updated = await storage.updateInvoice(id, patch);
    if (!updated) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    res.json({ ...updated, items });
  });

  // DELETE /api/invoices/:id
  app.delete("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await storage.deleteInvoice(id);
    res.json({ ok: true });
  });

  // GET /api/invoices/:id/pdf
  app.get("/api/invoices/:id/pdf", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    let snapshot: PractitionerSnapshot;
    try {
      snapshot = JSON.parse(inv.practitionerSnapshot || "{}");
    } catch {
      snapshot = {} as any;
    }
    try {
      const pdf = await generateInvoicePdf(inv as any, items as any, snapshot);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${inv.number}.pdf"`);
      res.send(pdf);
    } catch (e: any) {
      console.error("[invoice pdf]", e?.message || e);
      res.status(500).json({ message: "Erreur génération PDF" });
    }
  });

  // POST /api/invoices/:id/send  (envoi par email avec PDF en pièce jointe)
  app.post("/api/invoices/:id/send", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (!inv.clientEmail) return res.status(400).json({ message: "Email du client manquant" });
    const user = await storage.getUserById(req.userId!);
    const cfg = user ? getEmailConfigForUser(user) : null;
    if (!cfg) return res.status(400).json({ message: "Configuration email manquante (clé Resend + adresse expéditeur)" });
    const items = await storage.getInvoiceItems(id);
    let snapshot: PractitionerSnapshot;
    try {
      snapshot = JSON.parse(inv.practitionerSnapshot || "{}");
    } catch {
      snapshot = {} as any;
    }
    try {
      const pdf = await generateInvoicePdf(inv as any, items as any, snapshot);
      const email = renderInvoiceEmail({
        invoiceNumber: inv.number,
        clientFirstName: inv.clientFirstName || "",
        practitionerName: snapshot.companyName || user?.name || "votre praticienne",
        totalCents: inv.totalCents,
        notes: inv.notes,
      });
      const r = await sendEmail(cfg, inv.clientEmail, email.subject, email.html, email.text, [{
        filename: `${inv.number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      }]);
      if (!r.ok) return res.status(502).json({ message: r.error || "Erreur envoi" });
      const patch: any = { sentAt: Date.now() };
      if (inv.status === "draft") patch.status = "sent";
      const updated = await storage.updateInvoice(id, patch);
      res.json({ ok: true, invoice: updated });
    } catch (e: any) {
      console.error("[invoice send]", e?.message || e);
      res.status(500).json({ message: e?.message || "Erreur envoi facture" });
    }
  });

  // ---------- ADMIN: emails log (scoped to current user only) ----------
  app.get("/api/admin/email-log", requireAuth, async (req: AuthedRequest, res) => {
    const { db } = await import("./storage");
    const { emailLog } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const rows = (db as any).select().from(emailLog).where(eq(emailLog.userId, req.userId!)).all();
    res.json(rows);
  });

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

  // ---------- ADMIN (Phase 3 Lot 4) ----------
  // Toutes les routes ci-dessous nécessitent requireAuth + requireAdmin.
  // L'admin est défini par la whitelist ADMIN_EMAILS (défaut: jrayes000@gmail.com).

  const patchAdminUserSchema = z.object({
    plan: z.enum(["trial", "active", "suspended"]).optional(),
    trialEndsAt: z.number().int().nullable().optional(),
    emailVerifiedAt: z.number().int().nullable().optional(),
  }).strict();

  const extendTrialSchema = z.object({
    days: z.number().int().min(1).max(365),
  }).strict();

  async function userWithStats(u: any) {
    const [appts, clientsCount, invoicesCount] = await Promise.all([
      storage.countAppointmentsForUser(u.id),
      storage.countClientsForUser(u.id),
      storage.countInvoicesForUser(u.id),
    ]);
    return {
      ...publicUser(u),
      _stats: { appointments: appts, clients: clientsCount, invoices: invoicesCount },
    };
  }

  app.get("/api/admin/users", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
    const all = await storage.listAllUsers();
    const total = all.length;
    const slice = all.slice(offset, offset + limit);
    const enriched = await Promise.all(slice.map(userWithStats));
    res.setHeader("X-Total-Count", String(total));
    res.json({ users: enriched, total });
  });

  app.get("/api/admin/users/:id", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const u = await storage.getUserById(id);
    if (!u) return res.status(404).json({ message: "Utilisateur introuvable" });
    res.json({ user: await userWithStats(u) });
  });

  app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const parsed = patchAdminUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const existing = await storage.getUserById(id);
    if (!existing) return res.status(404).json({ message: "Utilisateur introuvable" });
    const updated = await storage.updateUser(id, parsed.data as any);
    res.json({ user: await userWithStats(updated) });
  });

  app.post("/api/admin/users/:id/impersonate", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const target = await storage.getUserById(id);
    if (!target) return res.status(404).json({ message: "Utilisateur introuvable" });
    const adminUser = await storage.getUserById(req.userId!);
    console.log(`[admin][impersonate] admin=${adminUser?.email || req.userId} impersonates user=${target.email} (id=${target.id})`);
    const token = await createSessionFor(target.id);
    setSessionCookie(res, token);
    res.json({ user: publicUser(target), token });
  });

  app.post("/api/admin/users/:id/extend-trial", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const parsed = extendTrialSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const target = await storage.getUserById(id);
    if (!target) return res.status(404).json({ message: "Utilisateur introuvable" });
    const now = Date.now();
    const base = Math.max(now, (target as any).trialEndsAt || 0);
    const newEnd = base + parsed.data.days * 24 * 60 * 60 * 1000;
    const updated = await storage.updateUser(id, { plan: "trial", trialEndsAt: newEnd } as any);
    res.json({ user: await userWithStats(updated) });
  });

  // Helper côté client pour savoir si l'utilisateur courant est admin
  app.get("/api/admin/me", requireAuth, async (req: AuthedRequest, res) => {
    const u = await storage.getUserById(req.userId!);
    res.json({ isAdmin: isAdminEmail(u?.email) });
  });

  // ────── PHASE 3 — Reminders UI endpoints ──────

  /**
   * GET /api/reminders/log
   * Liste des RDV à venir + passés récents (J-7 à J+30) avec leur statut rappel.
   * Triés par date desc (récents d'abord). Max 100 résultats.
   */
  app.get("/api/reminders/log", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const now = Date.now();
      const fromTs = now - 7 * 24 * 60 * 60 * 1000;  // J-7
      const toTs   = now + 30 * 24 * 60 * 60 * 1000; // J+30

      const appts = await storage.listAppointmentsForReminderLog(userId, fromTs, toTs);

      // Récupère les emails clients (via client lié si pas d'email direct)
      const enriched = await Promise.all(
        appts.slice(0, 100).map(async (a: any) => {
          let clientName = `${a.clientFirstName || ""} ${a.clientLastName || ""}`.trim();
          let clientEmail: string | null = a.clientEmail || null;

          if (a.clientId) {
            const c = await storage.getClient(a.clientId);
            if (c) {
              if (!clientName) clientName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
              if (!clientEmail) clientEmail = c.email || null;
            }
          }

          const isPast = a.startAt < now;
          let status: string;
          if (a.status === "cancelled" || a.clientCancelledAt) {
            status = "past"; // annulé, ne comptera pas comme pending
          } else if (!clientEmail) {
            status = "disabled";
          } else if (a.reminderSent) {
            status = "sent";
          } else if (isPast) {
            status = "past";
          } else {
            status = "pending";
          }

          return {
            id: a.id,
            clientName: clientName || "(sans nom)",
            clientEmail,
            scheduledAt: a.startAt,
            status,
            reminderSentAt: a.reminderSentAt || null,
          };
        }),
      );

      res.json(enriched);
    } catch (e: any) {
      console.error("[reminders/log]", e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  /**
   * GET /api/reminders/stats
   * Compteurs : envoyés ce mois-ci, total lifetime, à venir non encore envoyés,
   * prochain envoi prévu (date du prochain RDV J-1).
   */
  app.get("/api/reminders/stats", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const now = Date.now();

      // J-7 à J+30 pour les compteurs courants
      const fromTs = now - 7 * 24 * 60 * 60 * 1000;
      const toTs   = now + 30 * 24 * 60 * 60 * 1000;
      const appts  = await storage.listAppointmentsForReminderLog(userId, fromTs, toTs);

      // Pour total lifetime : tous les RDV depuis le début
      const allAppts = await storage.listAppointments(userId);

      // Début du mois courant (minuit local)
      const nowDate = new Date(now);
      const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();

      const sentThisMonth = (allAppts as any[]).filter(
        (a: any) => a.reminderSent && a.reminderSentAt && a.reminderSentAt >= startOfMonth,
      ).length;

      const sentTotal = (allAppts as any[]).filter((a: any) => a.reminderSent).length;

      // RDV à venir non encore envoyés (dans les 30j)
      const pendingCount = appts.filter((a: any) => {
        const isPast = a.startAt < now;
        return !isPast && !a.reminderSent && a.status !== "cancelled" && !a.clientCancelledAt;
      }).length;

      // Prochain envoi prévu = prochain RDV dont la date J-1 est à venir et reminder non envoyé
      let nextSendAt: number | null = null;
      const upcoming = appts
        .filter((a: any) => !a.reminderSent && a.startAt > now && a.status !== "cancelled" && !a.clientCancelledAt)
        .sort((a: any, b: any) => a.startAt - b.startAt);
      if (upcoming.length > 0) {
        const nextAppt = upcoming[0] as any;
        nextSendAt = nextAppt.startAt - 24 * 60 * 60 * 1000; // J-1
      }

      res.json({
        sentThisMonth,
        sentTotal,
        pendingCount,
        nextSendAt,
      });
    } catch (e: any) {
      console.error("[reminders/stats]", e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });


  // ────── PHASE 3.5-D — Manual reminder ──────
  app.post("/api/appointments/:id/send-reminder", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const apptId = Number(req.params.id);
      if (isNaN(apptId)) return res.status(400).json({ message: "ID invalide" });

      const a = await storage.getAppointment(apptId);
      if (!a || (a as any).userId !== req.userId) return res.status(404).json({ message: "RDV introuvable" });

      // Vérifie email client
      let clientEmail = (a as any).clientEmail || null;
      if ((a as any).clientId) {
        const c = await storage.getClient((a as any).clientId);
        if (c?.email) clientEmail = c.email;
      }
      if (!clientEmail) return res.status(400).json({ message: "Le client n'a pas d'email" });

      // Vérifie que le RDV est dans le futur
      if ((a as any).startAt <= Date.now()) return res.status(400).json({ message: "Le RDV est passé" });

      const user = await storage.getUserById(req.userId!);
      const cfg = user ? getEmailConfigForUser(user) : null;
      if (!cfg) return res.status(400).json({ message: "Configuration email manquante (clé Resend + adresse expéditeur)" });

      const alreadySent = !!(a as any).reminderSent;

      // Générer tokens si manquants
      let confirmToken = (a as any).confirmToken;
      let cancelToken = (a as any).cancelToken;
      const patch: any = { reminderSent: true, reminderSentAt: Date.now() };
      if (!confirmToken) { confirmToken = genToken(); patch.confirmToken = confirmToken; }
      if (!cancelToken) { cancelToken = genToken(); patch.cancelToken = cancelToken; }

      // Construire le contexte pour l'email
      const cat = (a as any).categoryId ? await storage.getCategory((a as any).categoryId) : null;
      let clientFirstName = (a as any).clientFirstName || "";
      let clientLastName = (a as any).clientLastName || "";
      if ((a as any).clientId) {
        const c = await storage.getClient((a as any).clientId);
        if (c) {
          clientFirstName = c.firstName || clientFirstName;
          clientLastName = c.lastName || clientLastName;
        }
      }

      const dateText = formatRdvDate((a as any).startAt);
      const { subject, html, text } = renderReminderEmail({
        clientFirstName: clientFirstName || "",
        practitionerName: user!.name || user!.email || "",
        practitionerEmail: user!.email,
        practitionerPhone: (user as any).phone || null,
        rdvDateText: dateText,
        categoryName: cat?.name || null,
        durationMinutes: cat?.durationMinutes || null,
        priceCents: cat?.priceCents || null,
        location: (a as any).location || cat?.location || null,
        paymentStatus: (a as any).paymentStatus || null,
        confirmUrl: `${APP_URL}/api/rdv/confirm/${confirmToken}`,
        cancelUrl: `${APP_URL}/api/rdv/cancel/${cancelToken}`,
        notesBefore: (a as any).notesBefore || null,
      });

      const r = await sendEmail(cfg, clientEmail, subject, html, text);
      if (!r.ok) return res.status(502).json({ message: r.error || "Erreur envoi email" });

      await storage.updateAppointment(apptId, patch);
      return res.json({ success: true, alreadySent, sentAt: patch.reminderSentAt });
    } catch (e: any) {
      console.error("[send-reminder manual]", e?.message || e);
      res.status(500).json({ message: e?.message || "Erreur serveur" });
    }
  });

  // ────── PHASE 3.5-C — Email templates ──────
  // Import lazily inside the block to avoid circular deps
  const { getDefaultTemplate } = await import("./email-templates/defaults");
  const { renderTemplate } = await import("./email-templates/render");

  const VALID_KINDS = ["confirmation", "reminder_d1", "cancellation"] as const;
  type ValidKind = typeof VALID_KINDS[number];

  function isValidKind(k: string): k is ValidKind {
    return (VALID_KINDS as readonly string[]).includes(k);
  }

  /**
   * GET /api/email-templates
   * Retourne les 3 templates (custom ou défaut) pour l'utilisateur connecté.
   */
  app.get("/api/email-templates", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const saved = await storage.listEmailTemplates(userId);
      const byKind: Record<string, any> = {};
      for (const t of saved) byKind[t.kind] = t;

      const result = VALID_KINDS.map((kind) => {
        if (byKind[kind]) return byKind[kind];
        const def = getDefaultTemplate(kind);
        return { id: null, userId, kind, subject: def.subject, bodyHtml: def.bodyHtml, updatedAt: null, isDefault: true };
      });
      res.json(result);
    } catch (e: any) {
      console.error("[email-templates GET list]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * GET /api/email-templates/:kind
   * Retourne un template spécifique (custom ou défaut).
   */
  app.get("/api/email-templates/:kind", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const kind = req.params.kind;
      if (!isValidKind(kind)) return res.status(400).json({ message: "kind invalide (confirmation|reminder_d1|cancellation)" });
      const userId = req.userId!;
      const saved = await storage.getEmailTemplate(userId, kind);
      if (saved) return res.json(saved);
      const def = getDefaultTemplate(kind);
      return res.json({ id: null, userId, kind, subject: def.subject, bodyHtml: def.bodyHtml, updatedAt: null, isDefault: true });
    } catch (e: any) {
      console.error("[email-templates GET :kind]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * PUT /api/email-templates/:kind
   * Upsert (crée ou met à jour) un template pour l'utilisateur connecté.
   * Body: { subject: string, bodyHtml: string }
   */
  app.put("/api/email-templates/:kind", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const kind = req.params.kind;
      if (!isValidKind(kind)) return res.status(400).json({ message: "kind invalide (confirmation|reminder_d1|cancellation)" });
      const schema = z.object({
        subject: z.string().min(1).max(500),
        bodyHtml: z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      const result = await storage.upsertEmailTemplate(req.userId!, kind, parsed.data);
      res.json(result);
    } catch (e: any) {
      console.error("[email-templates PUT]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * POST /api/email-templates/:kind/preview
   * Retourne le template interpolé avec un vrai RDV ou des données fictives.
   * Body: { appointmentId?: number }
   * Response: { subject: string, html: string }
   */
  app.post("/api/email-templates/:kind/preview", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const kind = req.params.kind;
      if (!isValidKind(kind)) return res.status(400).json({ message: "kind invalide" });
      const userId = req.userId!;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(401).json({ message: "Non autorisé" });

      // Récupère le template (custom ou défaut)
      const saved = await storage.getEmailTemplate(userId, kind);
      const template = saved ?? {
        subject: getDefaultTemplate(kind).subject,
        bodyHtml: getDefaultTemplate(kind).bodyHtml,
      };

      // Données fictives par défaut
      let vars: Parameters<typeof renderTemplate>[1] = {
        "client.name": "Marie Dupont",
        "client.email": "marie@exemple.fr",
        "appointment.date": "samedi 9 mai 2026",
        "appointment.time": "14h00",
        "appointment.duration": "60 min",
        "appointment.category": "Consultation naturopathie",
        "appointment.address": user.address ? `${user.address}, ${user.city || ""}`.trim().replace(/,$/, "") : "",
        "practitioner.name": user.name,
        "practitioner.email": user.email,
        "cancelLink": "https://exemple.fr/annuler/XXXXX",
      };

      // Si un appointmentId est fourni, on essaie de charger le vrai RDV
      const { appointmentId } = req.body || {};
      if (appointmentId && typeof appointmentId === "number") {
        const appt = await storage.getAppointment(appointmentId);
        if (appt && (appt as any).userId === userId) {
          const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
          const client = appt.clientId ? await storage.getClient(appt.clientId) : null;
          const dateText = new Intl.DateTimeFormat("fr-FR", {
            timeZone: "Europe/Paris",
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          }).format(new Date(appt.startAt));
          const timeText = formatRdvTime(appt.startAt);
          const durationMin = cat?.durationMinutes
            ? `${cat.durationMinutes} min`
            : appt.endAt && appt.startAt ? `${Math.round((appt.endAt - appt.startAt) / 60000)} min` : "";
          vars = {
            "client.name": client ? `${client.firstName} ${client.lastName}` : (appt.clientFirstName ? `${appt.clientFirstName} ${appt.clientLastName || ""}`.trim() : "Marie Dupont"),
            "client.email": client?.email || appt.clientEmail || "marie@exemple.fr",
            "appointment.date": dateText,
            "appointment.time": timeText,
            "appointment.duration": durationMin,
            "appointment.category": cat?.name || "",
            "appointment.address": appt.location || (user.address ? `${user.address}, ${user.city || ""}`.trim().replace(/,$/, "") : ""),
            "practitioner.name": user.name,
            "practitioner.email": user.email,
            "cancelLink": (appt as any).cancelToken ? `${req.protocol}://${req.get("host")}/api/public/cancel/${(appt as any).cancelToken}` : "https://exemple.fr/annuler/TOKEN",
          };
        }
      }

      const rendered = renderTemplate(template, vars);
      res.json(rendered);
    } catch (e: any) {
      console.error("[email-templates preview]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });


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
