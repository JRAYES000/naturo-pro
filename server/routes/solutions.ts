/**
 * server/routes/solutions.ts — Base de solutions naturelles
 *
 * Catalogue de référence (entrées globales userId=NULL + entrées perso du
 * praticien). Le praticien peut consulter tout, mais ne peut modifier/supprimer
 * que SES propres entrées (les globales sont en lecture seule).
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";

const solutionBodySchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(80),
  properties: z.string().max(2000).nullable().optional(),
  contraindications: z.string().max(2000).nullable().optional(),
  usageNotes: z.string().max(2000).nullable().optional(),
});

export function registerSolutionRoutes(app: Express): void {
  // Liste : globales + perso du praticien
  app.get("/api/solutions", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listNaturalSolutions(req.userId!));
  });

  // Création d'une entrée perso
  app.post("/api/solutions", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = solutionBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const sol = await storage.createNaturalSolution({ ...parsed.data, userId: req.userId! });
    res.json(sol);
  });

  // Modification — uniquement ses propres entrées (pas les globales)
  app.patch("/api/solutions/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getNaturalSolution(id);
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ message: "Solution introuvable ou non modifiable" });
    }
    const parsed = solutionBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    res.json(await storage.updateNaturalSolution(id, parsed.data));
  });

  // Suppression — uniquement ses propres entrées
  app.delete("/api/solutions/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getNaturalSolution(id);
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ message: "Solution introuvable ou non supprimable" });
    }
    await storage.deleteNaturalSolution(id);
    res.json({ ok: true });
  });
}
