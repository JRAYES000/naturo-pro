/**
 * server/routes/categories.ts — domaine Catégories (prestations)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique (mêmes codes HTTP, mêmes messages, même ordre).
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { insertCategorySchema } from "@shared/schema-active";

// Limite les champs modifiables via PATCH, empêchant un attaquant de transférer
// une ressource vers un autre user via {userId:X}. Exporté pour test (categories.test.ts) :
// le client ne doit jamais envoyer id/userId dans le corps d'un PATCH, ce schéma les rejette.
export const patchCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive().optional(),
  priceCents: z.number().int().min(0).optional(),
  color: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
  location: z.string().max(50).nullable().optional(),
}).strict();

export function registerCategoryRoutes(app: Express): void {
  app.get("/api/categories", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listCategories(req.userId!));
  });
  // Lot 5 — isolation : GET détail avec ownership filter
  app.get("/api/categories/:id", requireAuth, async (req: AuthedRequest, res) => {
    const cat = await storage.getCategory(Number(req.params.id));
    if (!cat || cat.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(cat);
  });
  // Lot 5 (QC Prestation) — mêmes bornes qu'en PATCH : une durée nulle ou un
  // tarif négatif étaient acceptés à la création et partaient tels quels sur la
  // page de réservation publique.
  const createBoundsSchema = z.object({
    durationMinutes: z.number().int().positive().optional(),
    priceCents: z.number().int().min(0).optional(),
  }).passthrough();

  app.post("/api/categories", requireAuth, async (req: AuthedRequest, res) => {
    const bounds = createBoundsSchema.safeParse(req.body ?? {});
    if (!bounds.success) {
      return res.status(400).json({ message: "Durée et tarif doivent être positifs", errors: bounds.error.errors });
    }
    const parsed = insertCategorySchema.safeParse({ ...req.body, userId: req.userId });
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    const c = await storage.createCategory(parsed.data);
    res.json(c);
  });
  app.patch("/api/categories/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const cat = await storage.getCategory(id);
    if (!cat || cat.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = patchCategorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const c = await storage.updateCategory(id, parsed.data);
    res.json(c);
  });
  app.delete("/api/categories/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const cat = await storage.getCategory(id);
    if (!cat || cat.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    // Lot 5 (QC Prestation) — supprimer une prestation utilisée par des RDV
    // laissait des categoryId orphelins (nom vidé sur l'Agenda et la fiche client).
    // On prévient et on suggère la désactivation ; ?force=1 supprime quand même.
    if (String(req.query.force || "") !== "1") {
      const appts = await storage.listAppointments(req.userId!, 0, Date.now() + 366 * 86400000);
      const nb = appts.filter((a) => a.categoryId === id).length;
      if (nb > 0) {
        return res.status(409).json({
          message: `${nb} rendez-vous utilise${nb > 1 ? "nt" : ""} cette prestation : préférez la désactiver `
            + `(elle disparaît de la réservation en ligne, l'historique reste lisible). Supprimer quand même effacera son nom de ces RDV.`,
          usedBy: nb,
        });
      }
    }
    await storage.deleteCategory(id);
    res.json({ ok: true });
  });
}
