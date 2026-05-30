/**
 * server/routes/admin.ts — domaine Admin
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique. Regroupe les DEUX blocs admin qui étaient
 * séparés dans routes.ts :
 *   - GET /api/admin/email-log         (scoped user courant, requireAuth seul)
 *   - /api/admin/users* + impersonate + extend-trial + /api/admin/me (requireAuth+requireAdmin)
 *
 * Le rate-limit admin reste appliqué côté routes.ts via `app.use("/api/admin", adminLimiter)`
 * (middleware de chemin, en amont) → pas besoin de ctx ici.
 *
 * NB : dans GET /api/admin/email-log, l'import dynamique `./storage` de routes.ts devient
 * `../storage` (le module est un niveau plus profond) — ajustement de chemin, pas de comportement.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  requireAuth, requireAdmin, isAdminEmail,
  createSessionFor, setSessionCookie,
  type AuthedRequest,
} from "../auth";
import { publicUser } from "./helpers/tokens";

export function registerAdminRoutes(app: Express): void {
  // ---------- ADMIN: emails log (scoped to current user only) ----------
  app.get("/api/admin/email-log", requireAuth, async (req: AuthedRequest, res) => {
    const { db } = await import("../storage");
    const { emailLog } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    // TODO(roadmap #1/#4 — unification schémas) : `email_log.userId` n'existe ni dans le schéma
    // Drizzle SQLite ni MySQL (seulement via un ALTER best-effort SQLite jamais alimenté par
    // logEmail), donc ce scoping renvoie toujours 0 ligne. Cast pour garder le type vert sans
    // changer le comportement ; à recâbler proprement (ajout colonne userId + logEmail(userId))
    // quand on s'attaquera à l'unification des schémas.
    const rows = (db as any).select().from(emailLog).where(eq((emailLog as any).userId, req.userId!)).all();
    res.json(rows);
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
}
