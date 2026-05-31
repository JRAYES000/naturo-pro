/**
 * server/routes/anamnese.ts — domaine Anamnèse (questionnaires d'intake)
 *
 * CRUD des templates (authentifié, filtré par userId) +
 * endpoints publics par token pour que les clientes remplissent le questionnaire.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { genToken } from "./helpers/tokens";

// ── Schémas de validation ─────────────────────────────────────────────────────

const questionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "choice", "multi", "scale"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  questions: z.array(questionSchema).default([]),
  isActive: z.boolean().optional(),
});

const patchTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  questions: z.array(questionSchema).optional(),
  isActive: z.boolean().optional(),
}).strict();

const createResponseSchema = z.object({
  templateId: z.number().int().positive(),
  clientId: z.number().int().positive().optional(),
  appointmentId: z.number().int().positive().optional(),
});

const submitAnswersSchema = z.object({
  answers: z.record(z.union([z.string(), z.array(z.string()), z.number()])),
});

// ── Enregistrement des routes ─────────────────────────────────────────────────

export function registerAnamneseRoutes(app: Express): void {

  // ── CRUD templates (auth requis) ──────────────────────────────────────────

  app.get("/api/anamnesis-templates", requireAuth, async (req: AuthedRequest, res) => {
    const list = await storage.listAnamnesisTemplates(req.userId!);
    res.json(list);
  });

  app.get("/api/anamnesis-templates/:id", requireAuth, async (req: AuthedRequest, res) => {
    const tpl = await storage.getAnamnesisTemplate(Number(req.params.id));
    if (!tpl || tpl.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(tpl);
  });

  app.post("/api/anamnesis-templates", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const tpl = await storage.createAnamnesisTemplate({
      ...parsed.data,
      userId: req.userId!,
      questions: JSON.stringify(parsed.data.questions),
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive ?? true,
    });
    res.json(tpl);
  });

  app.patch("/api/anamnesis-templates/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const tpl = await storage.getAnamnesisTemplate(id);
    if (!tpl || tpl.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = patchTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.questions !== undefined) {
      patch.questions = JSON.stringify(parsed.data.questions);
    }
    const updated = await storage.updateAnamnesisTemplate(id, patch as any);
    res.json(updated);
  });

  app.delete("/api/anamnesis-templates/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const tpl = await storage.getAnamnesisTemplate(id);
    if (!tpl || tpl.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await storage.deleteAnamnesisTemplate(id);
    res.json({ ok: true });
  });

  // ── Création d'un lien de partage (auth requis) ───────────────────────────

  app.post("/api/anamnesis-responses", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = createResponseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    // Vérifier ownership du template
    const tpl = await storage.getAnamnesisTemplate(parsed.data.templateId);
    if (!tpl || tpl.userId !== req.userId) return res.status(404).json({ message: "Template introuvable" });
    const token = genToken();
    const resp = await storage.createAnamnesisResponse({
      userId: req.userId!,
      templateId: parsed.data.templateId,
      clientId: parsed.data.clientId ?? null,
      appointmentId: parsed.data.appointmentId ?? null,
      token,
      answers: null,
      submittedAt: null,
    });
    const APP_URL = process.env.PUBLIC_URL || "http://localhost:5000";
    res.json({ ...resp, link: `${APP_URL}/#/anamnese/${token}` });
  });

  // ── Liste des réponses reçues (auth requis) ────────────────────────────────

  app.get("/api/anamnesis-responses", requireAuth, async (req: AuthedRequest, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const list = await storage.listAnamnesisResponses(req.userId!, clientId);
    res.json(list);
  });

  // ── Endpoints publics par token (sans auth) ───────────────────────────────

  // GET /api/public/anamnese/:token — retourne le template (nom + questions) si non soumis
  app.get("/api/public/anamnese/:token", async (req, res) => {
    const resp = await storage.getAnamnesisResponseByToken(req.params.token);
    if (!resp) return res.status(404).json({ message: "Questionnaire introuvable" });
    if (resp.submittedAt) return res.status(410).json({ message: "Ce questionnaire a déjà été soumis." });
    if (!resp.templateId) return res.status(404).json({ message: "Questionnaire sans modèle" });
    const tpl = await storage.getAnamnesisTemplate(resp.templateId);
    if (!tpl) return res.status(404).json({ message: "Modèle introuvable" });
    let questions: unknown[] = [];
    try { questions = JSON.parse(tpl.questions || "[]"); } catch { questions = []; }
    res.json({ name: tpl.name, description: tpl.description ?? null, questions });
  });

  // POST /api/public/anamnese/:token — enregistre les réponses
  app.post("/api/public/anamnese/:token", async (req, res) => {
    const resp = await storage.getAnamnesisResponseByToken(req.params.token);
    if (!resp) return res.status(404).json({ message: "Questionnaire introuvable" });
    if (resp.submittedAt) return res.status(410).json({ message: "Ce questionnaire a déjà été soumis." });
    const parsed = submitAnswersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const updated = await storage.updateAnamnesisResponse(resp.id, {
      answers: JSON.stringify(parsed.data.answers),
      submittedAt: Date.now(),
    });
    res.json({ ok: true, submittedAt: updated?.submittedAt });
  });
}
