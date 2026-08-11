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
import { SYSTEM_PROMPT, completeText, AI_DAILY_LIMIT } from "../mistral";
import { programmeFromMarkdown } from "./helpers/programme-bridge";
import { recordEvent } from "../analytics";

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

// Miroir de isAnswerEmpty côté client (AnamnesePublic.tsx) : le serveur ne peut
// pas faire confiance à la validation du navigateur, un POST direct pouvait
// jusqu'ici soumettre des réponses vides malgré des questions "required".
function isAnswerEmpty(ans: string | string[] | number | undefined): boolean {
  return ans === undefined || ans === "" || (Array.isArray(ans) && ans.length === 0);
}

export function findMissingRequiredAnswers(
  questions: { id: string; required?: boolean }[],
  answers: Record<string, string | string[] | number>,
): string[] {
  return questions
    .filter(q => q.required && isAnswerEmpty(answers[q.id]))
    .map(q => q.id);
}

/**
 * Prompt de génération de programme depuis une anamnèse soumise (Lot 2, action 15).
 * Fonction PURE (testée) : questions + réponses → consigne markdown structurée.
 * Le cadre de sécurité (pas de diagnostic, pas de prescription) vient du
 * SYSTEM_PROMPT commun, envoyé en message system à côté de ce prompt.
 */
export function buildProgrammePrompt(opts: {
  templateName: string;
  questions: Array<{ id: string; label: string }>;
  answers: Record<string, string | string[] | number>;
  clientFirstName?: string | null;
}): string {
  const labelById = new Map(opts.questions.map((q) => [q.id, q.label]));
  const lines: string[] = [];
  for (const [id, ans] of Object.entries(opts.answers)) {
    const val = Array.isArray(ans) ? ans.join(", ") : String(ans);
    if (!val.trim()) continue;
    lines.push(`- ${labelById.get(id) || id} : ${val}`);
  }
  const pour = opts.clientFirstName ? ` pour ${opts.clientFirstName}` : "";
  return [
    `Voici les réponses au questionnaire d'anamnèse « ${opts.templateName} »${pour} :`,
    "",
    ...lines,
    "",
    "À partir de cette anamnèse, rédige un PROGRAMME D'HYGIÈNE DE VIE personnalisé, directement exploitable par la praticienne.",
    "Format STRICT : 4 à 6 sections markdown (## Titre de section), chacune avec 3 à 6 puces courtes, concrètes et actionnables.",
    "Sections attendues (adapte selon l'anamnèse) : alimentation, hygiène de vie/sommeil, activité physique, gestion du stress, plantes et compléments (avec prudence), suivi.",
    "Pas d'introduction ni de conclusion hors sections, pas de diagnostic, pas de prescription médicamenteuse.",
  ].join("\n");
}

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

  // ── Génération IA d'un programme depuis une anamnèse soumise (action 15) ──
  // Le programme est créé en BROUILLON : la praticienne relit et ajuste avant
  // tout envoi (même logique de validation humaine que le pont Naturobot).
  app.post("/api/anamnesis-responses/:id/generate-programme", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const resp = await storage.getAnamnesisResponse(Number(req.params.id));
      if (!resp || resp.userId !== req.userId) return res.status(404).json({ message: "Réponse introuvable" });
      if (!resp.submittedAt || !resp.answers) {
        return res.status(400).json({ message: "Ce questionnaire n'a pas encore été rempli par la cliente." });
      }

      const day = new Date().toISOString().slice(0, 10);
      if ((await storage.incrementAiChatUsage(req.userId!, day)) > AI_DAILY_LIMIT) {
        return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} générations/jour). Réessaie demain.` });
      }

      const tpl = resp.templateId ? await storage.getAnamnesisTemplate(resp.templateId) : null;
      let questions: Array<{ id: string; label: string }> = [];
      try { questions = JSON.parse(tpl?.questions || "[]"); } catch { questions = []; }
      let answers: Record<string, string | string[] | number> = {};
      try { answers = JSON.parse(resp.answers); } catch { answers = {}; }

      let clientFirstName: string | null = null;
      let clientName: string | null = null;
      if (resp.clientId) {
        const c = await storage.getClient(resp.clientId);
        if (c && c.userId === req.userId) {
          clientFirstName = c.firstName;
          clientName = `${c.firstName} ${c.lastName}`.trim();
        }
      }

      const prompt = buildProgrammePrompt({
        templateName: tpl?.name || "Anamnèse",
        questions,
        answers,
        clientFirstName,
      });
      const markdown = await completeText([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ]);
      const sections = programmeFromMarkdown(markdown);
      if (!sections.length) return res.status(502).json({ message: "La génération n'a rien produit d'exploitable, réessaie." });

      const prog = await storage.createProgram({
        userId: req.userId!,
        clientId: resp.clientId ?? null,
        appointmentId: resp.appointmentId ?? null,
        title: `Programme proposé — ${clientName || tpl?.name || "anamnèse"}`,
        content: JSON.stringify(sections),
        status: "draft",
      });
      recordEvent(req.userId!, "programme_ia_genere", { anamnesisResponseId: resp.id, programId: prog.id });
      res.json(prog);
    } catch (e: any) {
      if (e?.status === 503) return res.status(503).json({ message: "La génération IA n'est pas disponible (clé API absente)." });
      console.error("[anamnese generate-programme]", e?.message || e);
      res.status(502).json({ message: "La génération a échoué, réessaie dans un instant." });
    }
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

    if (resp.templateId) {
      const tpl = await storage.getAnamnesisTemplate(resp.templateId);
      let questions: { id: string; required?: boolean }[] = [];
      try { questions = JSON.parse(tpl?.questions || "[]"); } catch { questions = []; }
      const missingIds = findMissingRequiredAnswers(questions, parsed.data.answers);
      if (missingIds.length > 0) {
        return res.status(400).json({
          message: "Certaines réponses obligatoires sont manquantes",
          missingQuestionIds: missingIds,
        });
      }
    }

    const updated = await storage.updateAnamnesisResponse(resp.id, {
      answers: JSON.stringify(parsed.data.answers),
      submittedAt: Date.now(),
    });
    res.json({ ok: true, submittedAt: updated?.submittedAt });
  });
}
