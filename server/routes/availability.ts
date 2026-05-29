/**
 * server/routes/availability.ts — domaine Disponibilités (horaires hebdo)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";

export function registerAvailabilityRoutes(app: Express): void {
  app.get("/api/availability", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listAvailability(req.userId!));
  });
  app.put("/api/availability", requireAuth, async (req: AuthedRequest, res) => {
    const arrSchema = z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    }));
    const parsed = arrSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    const slots = parsed.data.map(s => ({ ...s, userId: req.userId! }));
    res.json(await storage.replaceAvailability(req.userId!, slots));
  });
}
