/**
 * server/routes/profile.ts — domaine Profil praticien
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { publicUser } from "./helpers/tokens";

export function registerProfileRoutes(app: Express): void {
  app.get("/api/profile", requireAuth, async (req: AuthedRequest, res) => {
    const u = await storage.getUserById(req.userId!);
    res.json({ user: publicUser(u) });
  });

  const profilePatchSchema = z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
    bio: z.string().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    specialties: z.array(z.string()).optional(),
    publicPageEnabled: z.boolean().optional(),
    emailRemindersEnabled: z.boolean().optional(),
    primaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    instagram: z.string().nullable().optional(),
    facebook: z.string().nullable().optional(),
    websiteUrl: z.string().nullable().optional(),
    // Phase 0.7 — config email Resend
    resendApiKey: z.string().nullable().optional(),
    emailFromAddress: z.string().email().nullable().optional(),
    emailFromName: z.string().nullable().optional(),
    dailyRecapEnabled: z.boolean().optional(),
    reminderHourLocal: z.number().int().min(0).max(23).optional(),
    recapHourLocal: z.number().int().min(0).max(23).optional(),
    // Phase 1 — Facturation
    billingCompanyName: z.string().nullable().optional(),
    billingSiret: z.string().nullable().optional(),
    billingAddress: z.string().nullable().optional(),
    billingPostalCode: z.string().nullable().optional(),
    billingCity: z.string().nullable().optional(),
    billingCountry: z.string().nullable().optional(),
    billingIban: z.string().nullable().optional(),
    billingBic: z.string().nullable().optional(),
    billingLogoBase64: z.string().nullable().optional(),
    billingVatEnabled: z.boolean().optional(),
    billingVatRate: z.number().int().min(0).max(10000).optional(),
    billingLegalMention: z.string().nullable().optional(),
    billingPaymentTerms: z.string().nullable().optional(),
    autoInvoiceOnCompleted: z.boolean().optional(),
    // Avis Google
    googleReviewUrl: z.string().url().nullable().optional(),
    reviewRequestEnabled: z.boolean().optional(),
  });

  app.patch("/api/profile", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    const patch: any = { ...parsed.data };
    if (patch.specialties) patch.specialties = JSON.stringify(patch.specialties);
    if (patch.slug) {
      const exists = await storage.getUserBySlug(patch.slug);
      if (exists && exists.id !== req.userId) return res.status(409).json({ message: "Slug déjà utilisé" });
    }
    const u = await storage.updateUser(req.userId!, patch);
    res.json({ user: publicUser(u) });
  });
}
