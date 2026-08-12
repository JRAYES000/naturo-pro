/**
 * server/routes/availability.ts — domaine Disponibilités (horaires hebdo + dates bloquées)
 *
 * Lot 5 (QC Disponibilité) : les validations fin > début et non-chevauchement,
 * jusqu'ici uniquement côté client, sont désormais appliquées côté serveur —
 * une plage inversée faisait disparaître silencieusement la journée sur la page
 * publique, et deux plages qui se chevauchent affichaient le même créneau deux fois.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";

interface WeeklySlot { dayOfWeek: number; startTime: string; endTime: string }

/** Valide fin > début et absence de chevauchement par jour. Retourne un message d'erreur ou null. */
export function validateWeeklySlots(slots: WeeklySlot[]): string | null {
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  for (const s of slots) {
    if (s.endTime <= s.startTime) {
      return `Plage invalide le ${JOURS[s.dayOfWeek]} : l'heure de fin (${s.endTime}) doit être après l'heure de début (${s.startTime}).`;
    }
  }
  for (let d = 0; d <= 6; d++) {
    const jour = slots.filter((s) => s.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < jour.length; i++) {
      if (jour[i].startTime < jour[i - 1].endTime) {
        return `Deux plages se chevauchent le ${JOURS[d]} (${jour[i - 1].startTime}–${jour[i - 1].endTime} et ${jour[i].startTime}–${jour[i].endTime}).`;
      }
    }
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const erreur = validateWeeklySlots(parsed.data);
    if (erreur) return res.status(400).json({ message: erreur });
    const slots = parsed.data.map(s => ({ ...s, userId: req.userId! }));
    res.json(await storage.replaceAvailability(req.userId!, slots));
  });

  // ── Lot 5 — dates bloquées (congés, fermetures ponctuelles) ────────────────

  app.get("/api/blocked-dates", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listBlockedDates(req.userId!));
  });

  app.post("/api/blocked-dates", requireAuth, async (req: AuthedRequest, res) => {
    const schema = z.object({
      startDate: z.string().regex(DATE_RE),
      endDate: z.string().regex(DATE_RE),
      reason: z.string().max(255).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    if (parsed.data.endDate < parsed.data.startDate) {
      return res.status(400).json({ message: "La date de fin doit être postérieure ou égale à la date de début." });
    }
    const bd = await storage.createBlockedDate({ ...parsed.data, reason: parsed.data.reason ?? null, userId: req.userId! });
    res.status(201).json(bd);
  });

  app.delete("/api/blocked-dates/:id", requireAuth, async (req: AuthedRequest, res) => {
    const bd = await storage.getBlockedDate(Number(req.params.id));
    if (!bd || bd.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await storage.deleteBlockedDate(bd.id);
    res.json({ ok: true });
  });
}
