/**
 * server/routes/packages.ts — domaine Forfaits / carnets de séances
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { insertPackageSchema } from "@shared/schema-active";

const patchPackageSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  totalSessions: z.number().int().positive().optional(),
  usedSessions: z.number().int().min(0).optional(),
  priceCents: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
}).strict();

export function registerPackageRoutes(app: Express): void {
  // Liste tous les forfaits (optionnellement filtrée par clientId)
  app.get("/api/packages", requireAuth, async (req: AuthedRequest, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    res.json(await storage.listPackages(req.userId!, clientId));
  });

  // Détail d'un forfait avec ownership check
  app.get("/api/packages/:id", requireAuth, async (req: AuthedRequest, res) => {
    const pkg = await storage.getPackage(Number(req.params.id));
    if (!pkg || pkg.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(pkg);
  });

  // Création d'un forfait
  app.post("/api/packages", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = insertPackageSchema.safeParse({ ...req.body, userId: req.userId });
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    const pkg = await storage.createPackage({ ...parsed.data, userId: req.userId! });
    res.json(pkg);
  });

  // Mise à jour partielle (y compris incrément usedSessions)
  app.patch("/api/packages/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const pkg = await storage.getPackage(id);
    if (!pkg || pkg.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = patchPackageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    // Borner usedSessions au total
    const patch = { ...parsed.data };
    if (patch.usedSessions !== undefined) {
      const total = patch.totalSessions ?? pkg.totalSessions;
      patch.usedSessions = Math.min(patch.usedSessions, total);
    }
    const updated = await storage.updatePackage(id, patch);
    res.json(updated);
  });

  // Suppression
  app.delete("/api/packages/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const pkg = await storage.getPackage(id);
    if (!pkg || pkg.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await storage.deletePackage(id);
    res.json({ ok: true });
  });
}
