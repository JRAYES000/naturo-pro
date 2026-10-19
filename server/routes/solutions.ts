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
import { completeJson, AI_DAILY_LIMIT } from "../mistral";
import { zonedDateKey } from "../timezone";
import { SOLUTION_CATEGORIES, SAFETY_KEYS, serializeSafety, serializeList } from "@shared/solutions";
import { buildSolutionDraftMessages, parseSolutionDraft } from "../solutions-ai";

const safetySchema = z.record(z.enum(SAFETY_KEYS as [string, ...string[]]), z.enum(["ci", "prudence"])).nullable().optional();

const solutionBodySchema = z.object({
  name: z.string().min(1).max(255),
  // Lot 5 (QC Bibliothèque) — liste fermée, alignée sur le formulaire : une
  // catégorie libre créait une fiche invisible dès qu'un filtre était actif.
  category: z.enum(SOLUTION_CATEGORIES),
  properties: z.string().max(2000).nullable().optional(),
  contraindications: z.string().max(2000).nullable().optional(),
  usageNotes: z.string().max(2000).nullable().optional(),
  // Précautions structurées et champs complémentaires (stockés en JSON / texte).
  safety: safetySchema,
  form: z.string().max(255).nullable().optional(),
  cureDuration: z.string().max(255).nullable().optional(),
  synergies: z.array(z.string().max(255)).max(20).nullable().optional(),
  sources: z.string().max(2000).nullable().optional(),
});

type SolutionBody = Partial<z.infer<typeof solutionBodySchema>>;

/** Corps validé → colonnes : JSON sérialisé, chaînes vides ramenées à null. */
function toColumns(body: SolutionBody) {
  const { safety, synergies, ...rest } = body;
  const out: Record<string, unknown> = { ...rest };
  for (const k of ["properties", "contraindications", "usageNotes", "form", "cureDuration", "sources"] as const) {
    if (k in out && typeof out[k] === "string") out[k] = (out[k] as string).trim() || null;
  }
  if (safety !== undefined) out.safety = serializeSafety(safety as any);
  if (synergies !== undefined) out.synergies = serializeList(synergies);
  return out;
}

const draftBodySchema = z.object({
  name: z.string().trim().min(2).max(255),
  category: z.enum(SOLUTION_CATEGORIES),
});

export function registerSolutionRoutes(app: Express): void {
  // Liste : globales + perso du praticien
  app.get("/api/solutions", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listNaturalSolutions(req.userId!));
  });

  // Brouillon IA d'une fiche (rien n'est enregistré : le formulaire est pré-rempli).
  app.post("/api/solutions/ai-draft", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = draftBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Indiquez le nom de la solution." });
    const day = zonedDateKey(Date.now());
    if ((await storage.incrementAiChatUsage(req.userId!, day)) > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} générations/jour). Réessayez demain.` });
    }
    try {
      const raw = await completeJson(buildSolutionDraftMessages(parsed.data.name, parsed.data.category), { maxTokens: 1200 });
      const draft = parseSolutionDraft(raw);
      if (!draft) return res.status(422).json({ message: "L'IA n'a pas su proposer de fiche, complétez-la vous-même." });
      res.json(draft);
    } catch (e: any) {
      console.error("[solutions-ai-draft]", e?.message || e);
      res.status(e?.status === 503 ? 503 : 502).json({ message: "La proposition a échoué, réessayez dans un instant." });
    }
  });

  // Création d'une entrée perso
  app.post("/api/solutions", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = solutionBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const sol = await storage.createNaturalSolution({ ...(toColumns(parsed.data) as any), userId: req.userId! });
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
    res.json(await storage.updateNaturalSolution(id, toColumns(parsed.data) as any));
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
