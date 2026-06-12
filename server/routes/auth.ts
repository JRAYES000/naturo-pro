/**
 * server/routes/auth.ts — domaine Auth (Phase 4.0 — dernier domaine fonctionnel)
 *
 * Extrait de server/routes.ts. Handlers verbatim, comportement strictement identique.
 * Sessions Express + bcrypt (pas de Supabase/NextAuth). Routes :
 *   - POST /api/auth/register            (ctx.authLimiter)
 *   - POST /api/auth/verify-email/:token (ctx.authLimiter)
 *   - POST /api/auth/resend-verification (ctx.authLimiter)
 *   - POST /api/auth/forgot-password     (ctx.authLimiter)
 *   - POST /api/auth/reset-password      (ctx.authLimiter)
 *   - POST /api/auth/onboarding          (requireAuth)
 *   - POST /api/auth/login               (ctx.authLimiter)
 *   - POST /api/auth/logout
 *   - GET  /api/auth/me
 *   - GET  /api/auth/me/export           (requireAuth, RGPD)
 *   - DELETE /api/auth/me                (requireAuth, RGPD)
 *
 * ⚠️ Les routes OAuth /api/auth/google* vivent dans server/routes/google.ts (étape 10).
 * `ctx` fournit authLimiter (rate-limit anti-brute-force).
 */

import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { storage } from "../storage";
import {
  requireAuth, hashPassword, verifyPassword, createSessionFor,
  setSessionCookie, clearSessionCookie, SESSION_COOKIE,
  type AuthedRequest,
} from "../auth";
import {
  sendEmail, getSystemEmailConfig,
  renderWelcomeVerifyEmail, renderPasswordResetEmail,
} from "../email";
import { slugify, publicUser } from "./helpers/tokens";
import type { RouteContext } from "./_context";

export function registerAuthRoutes(app: Express, ctx: RouteContext): void {
  // Limiter fourni par le contexte (même instance singleton que ./limiters).
  // Déstructuré en identifiant nu pour rester verbatim côté inventaire (authLimiter).
  const { authLimiter } = ctx;

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
    const trialEndsAt = now + 30 * 24 * 60 * 60 * 1000; // 30 jours
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
      // Apparence — thème clair par défaut (l'utilisateur peut basculer en sombre).
      themePreference: "light",
      createdAt: now,
      // Phase 3 Lot 1 — trial 30 j + verification email
      plan: "trial",
      trialEndsAt,
      emailVerifyToken: verifyToken,
      emailVerifyExpiresAt: verifyExpiresAt,
    } as any);

    // Pré-remplit 3 prestations par défaut pour démarrer rapidement (best effort :
    // un échec ne bloque pas l'inscription). Durée 1 h, tarif 50 €, lieu au défaut.
    try {
      const defaultCategories: Array<{ name: string; color: string }> = [
        { name: "Première consultation", color: "#186749" },
        { name: "Séance de suivi", color: "#17EC9B" },
        { name: "Bilan vitalité", color: "#1b4332" },
      ];
      for (const c of defaultCategories) {
        await storage.createCategory({
          userId: user.id,
          name: c.name,
          durationMinutes: 60,
          priceCents: 5000,
          color: c.color,
        });
      }
    } catch (e: any) {
      console.error("[register] seed default categories failed:", e?.message || e);
    }

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
}
