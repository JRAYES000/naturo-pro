/**
 * server/routes/clients.ts — domaine Clients (+ sous-ressources appointments/notes)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique. Les routes /clients/:id/appointments et
 * /clients/:id/notes ne font que des lectures storage scoped client (aucun couplage
 * avec le domaine appointments).
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { insertClientSchema, clientEmailSchema } from "@shared/schema-active";
import { hasFullAccess, sanitizeClientForPlan, stripClientHealthFields } from "@shared/plan-access";
import { parseClientsCsv } from "./helpers/csv-clients";

// Lot 1 (décisions 5-6) — la fiche client du socle gratuit se limite aux
// coordonnées (nom, email, téléphone). Les champs santé/étendus (naissance,
// adresse, allergies, antécédents, hygiène de vie, pense-bête) sont neutralisés
// en lecture ET ignorés en écriture pour un compte sans accès complet : le
// serveur fait foi, l'interface (ClientDetail/Clients) affiche l'état bloqué.
async function fullAccessFor(req: AuthedRequest): Promise<boolean> {
  const u = req.user ?? (await storage.getUserById(req.userId!));
  return hasFullAccess(u);
}

// Limite les champs modifiables via PATCH (empêche le transfert via {userId:X}).
// email réutilise clientEmailSchema (shared/schema.ts) — même règle qu'à la création,
// pour ne plus jamais diverger entre POST et PATCH.
const patchClientSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  email: clientEmailSchema,
  phone: z.string().max(50).nullable().optional(),
  dateOfBirth: z.string().max(20).nullable().optional(),
  address: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  antecedents: z.string().nullable().optional(),
  lifestyleNotes: z.string().nullable().optional(),
  penseBete: z.string().nullable().optional(),
}).strict();

export function registerClientRoutes(app: Express): void {
  // Import CSV de coordonnées (Lot 3) — la vraie barrière d'entrée depuis
  // Excel/carnet. Coordonnées uniquement, jamais de champ santé.
  app.post("/api/clients/import", requireAuth, async (req: AuthedRequest, res) => {
    const schema = z.object({ csv: z.string().min(1).max(500_000) });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Fichier CSV manquant ou trop volumineux" });

    const result = parseClientsCsv(parsed.data.csv);
    if (result.erreurGlobale) return res.status(400).json({ message: result.erreurGlobale });

    const existants = await storage.listClients(req.userId!);
    const emailsVus = new Set(existants.map((c) => (c.email || "").toLowerCase()).filter(Boolean));
    const nomsVus = new Set(existants.map((c) => `${c.firstName} ${c.lastName}`.toLowerCase().trim()));

    let crees = 0;
    let doublons = 0;
    for (const row of result.rows) {
      const cleEmail = (row.email || "").toLowerCase();
      const cleNom = `${row.firstName} ${row.lastName}`.toLowerCase().trim();
      if ((cleEmail && emailsVus.has(cleEmail)) || nomsVus.has(cleNom)) {
        doublons++;
        continue;
      }
      await storage.createClient(req.userId!, {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
      } as any);
      if (cleEmail) emailsVus.add(cleEmail);
      nomsVus.add(cleNom);
      crees++;
    }
    res.json({
      ok: true,
      crees,
      doublons,
      erreurs: result.erreurs.slice(0, 20),
      avertissements: result.avertissements.slice(0, 20),
      totalErreurs: result.erreurs.length,
      totalAvertissements: result.avertissements.length,
    });
  });

  app.get("/api/clients", requireAuth, async (req: AuthedRequest, res) => {
    const search = String(req.query.search || "");
    const full = await fullAccessFor(req);
    const list = await storage.listClients(req.userId!, search);
    res.json(list.map((c) => sanitizeClientForPlan(c as any, full)));
  });
  app.get("/api/clients/:id", requireAuth, async (req: AuthedRequest, res) => {
    const c = await storage.getClient(Number(req.params.id));
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(sanitizeClientForPlan(c as any, await fullAccessFor(req)));
  });
  app.post("/api/clients", requireAuth, async (req: AuthedRequest, res) => {
    const full = await fullAccessFor(req);
    const parsed = insertClientSchema.safeParse(stripClientHealthFields(req.body ?? {}, full));
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    const created = await storage.createClient(req.userId!, parsed.data);
    res.json(sanitizeClientForPlan(created as any, full));
  });
  app.patch("/api/clients/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const c = await storage.getClient(id);
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const full = await fullAccessFor(req);
    const parsed = patchClientSchema.safeParse(stripClientHealthFields(req.body ?? {}, full));
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const updated = await storage.updateClient(id, parsed.data as any);
    res.json(sanitizeClientForPlan(updated as any, full));
  });
  app.delete("/api/clients/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const c = await storage.getClient(id);
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await storage.detachClientFromDiscussions(id); // les discussions deviennent « Non classé », les échanges restent
    await storage.deleteClient(id);
    res.json({ ok: true });
  });
  app.get("/api/clients/:id/appointments", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const c = await storage.getClient(id);
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(await storage.listClientAppointments(id));
  });
  app.get("/api/clients/:id/notes", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const c = await storage.getClient(id);
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(await storage.listClientNotes(id));
  });
}
