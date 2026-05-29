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
import { insertClientSchema } from "@shared/schema-active";

// Limite les champs modifiables via PATCH (empêche le transfert via {userId:X}).
const patchClientSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().max(50).nullable().optional(),
  dateOfBirth: z.string().max(20).nullable().optional(),
  address: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  antecedents: z.string().nullable().optional(),
  lifestyleNotes: z.string().nullable().optional(),
  penseBete: z.string().nullable().optional(),
}).strict();

export function registerClientRoutes(app: Express): void {
  app.get("/api/clients", requireAuth, async (req: AuthedRequest, res) => {
    const search = String(req.query.search || "");
    res.json(await storage.listClients(req.userId!, search));
  });
  app.get("/api/clients/:id", requireAuth, async (req: AuthedRequest, res) => {
    const c = await storage.getClient(Number(req.params.id));
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(c);
  });
  app.post("/api/clients", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = insertClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    res.json(await storage.createClient(req.userId!, parsed.data));
  });
  app.patch("/api/clients/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const c = await storage.getClient(id);
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = patchClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    res.json(await storage.updateClient(id, parsed.data as any));
  });
  app.delete("/api/clients/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const c = await storage.getClient(id);
    if (!c || c.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
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
