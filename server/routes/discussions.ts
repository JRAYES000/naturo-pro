import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { streamNaturoAssistant, generateDiscussionMeta, type ChatTurn } from "../mistral";
import { retrieveRelevantChunks } from "../rag";
import type { Client } from "@shared/schema";

const CONTEXT_LIMIT = 30;
const createSchema = z.object({
  clientId: z.number().int().positive().nullable().optional(),
  theme: z.string().max(120).nullable().optional(),
});
const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  theme: z.string().max(120).nullable().optional(),
  clientId: z.number().int().positive().nullable().optional(),
});
const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) });

// Construit le bloc « fiche cliente » injecté dans le contexte (champs santé seulement).
function buildClientContext(c: Client): string {
  const lines: string[] = [];
  lines.push(`- Prénom : ${c.firstName}`);
  if (c.dateOfBirth) {
    const age = Math.floor((Date.now() - new Date(c.dateOfBirth).getTime()) / 3.15576e10);
    if (Number.isFinite(age) && age > 0 && age < 120) lines.push(`- Âge : ${age} ans`);
  }
  if (c.antecedents?.trim()) lines.push(`- Antécédents : ${c.antecedents.trim()}`);
  if (c.allergies?.trim()) lines.push(`- Allergies : ${c.allergies.trim()}`);
  if (c.lifestyleNotes?.trim()) lines.push(`- Hygiène de vie : ${c.lifestyleNotes.trim()}`);
  if (c.penseBete?.trim()) lines.push(`- Notes : ${c.penseBete.trim()}`);
  return `Fiche de la cliente concernée (confidentiel, à prendre en compte) :\n${lines.join("\n")}`;
}

// Vérifie que la discussion existe et appartient à la praticienne.
async function ownDiscussion(req: AuthedRequest, id: number) {
  const d = await storage.getDiscussion(id);
  if (!d || d.userId !== req.userId) return null;
  return d;
}

export function registerDiscussionRoutes(app: Express): void {
  app.get("/api/discussions", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listDiscussions(req.userId!));
  });

  app.post("/api/discussions", requireAuth, async (req: AuthedRequest, res) => {
    const p = createSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    let clientId = p.data.clientId ?? null;
    if (clientId != null) {
      const c = await storage.getClient(clientId);
      if (!c || c.userId !== req.userId) return res.status(403).json({ message: "Cliente introuvable" });
    }
    const disc = await storage.createDiscussion({ userId: req.userId!, clientId, theme: p.data.theme ?? null });
    res.json(disc);
  });

  app.patch("/api/discussions/:id", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    const p = patchSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    if (p.data.clientId != null) {
      const c = await storage.getClient(p.data.clientId);
      if (!c || c.userId !== req.userId) return res.status(403).json({ message: "Cliente introuvable" });
    }
    res.json(await storage.updateDiscussion(d.id, p.data));
  });

  app.delete("/api/discussions/:id", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    await storage.deleteDiscussion(d.id);
    res.json({ ok: true });
  });

  app.get("/api/discussions/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    res.json(await storage.listDiscussionMessages(d.id));
  });

  app.post("/api/discussions/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    const p = messageSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    const userMessage = p.data.message;

    const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
    const day = new Date().toISOString().slice(0, 10);
    if ((await storage.incrementAiChatUsage(req.userId!, day)) > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} messages/jour). Réessaie demain.` });
    }

    const prior = await storage.listDiscussionMessages(d.id, CONTEXT_LIMIT);
    const history: ChatTurn[] = prior.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    const isFirstExchange = prior.length === 0;
    // Démarre la génération titre/thème EN PARALLÈLE du streaming (1er échange) :
    // elle se termine pendant la réponse, donc sans rallonger le temps perçu.
    const metaPromise = isFirstExchange ? generateDiscussionMeta(userMessage).catch(() => null) : null;
    const instructions = await storage.getAssistantInstructions();

    let clientContext: string | undefined;
    if (d.clientId != null) {
      const c = await storage.getClient(d.clientId);
      if (c && c.userId === req.userId) clientContext = buildClientContext(c);
    }
    let retrieved: { content: string; documentId: number }[] = [];
    try { retrieved = await retrieveRelevantChunks(userMessage); } catch { retrieved = []; }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    let full = "";
    try {
      for await (const delta of streamNaturoAssistant(history, userMessage, {
        customInstructions: instructions,
        contextChunks: retrieved.map((r) => r.content),
        clientContext,
      })) {
        full += delta;
        res.write(delta);
      }
    } catch (e: any) {
      if (!full) {
        res.statusCode = e?.status === 503 ? 503 : 502;
        return res.end(e?.status === 503
          ? "L'assistant n'est pas encore disponible. Réessaie plus tard."
          : "L'assistant n'a pas pu répondre, réessaie dans un instant.");
      }
    }

    if (retrieved.length) {
      const ids = Array.from(new Set(retrieved.map((r) => r.documentId)));
      const docs = await storage.listKbDocuments();
      const names = ids.map((id) => docs.find((doc) => doc.id === id)?.title).filter(Boolean);
      if (names.length) res.write(`\n@@SOURCES@@:${JSON.stringify(names)}`);
    }

    await storage.createDiscussionMessage({ discussionId: d.id, userId: req.userId!, role: "user", content: userMessage });
    await storage.createDiscussionMessage({ discussionId: d.id, userId: req.userId!, role: "assistant", content: full });
    await storage.touchDiscussion(d.id);

    // Applique le titre/thème (généré en parallèle) AVANT de clore la réponse, pour
    // que la liste des discussions réinvalidée côté client l'affiche immédiatement.
    if (metaPromise) {
      const meta = await metaPromise;
      if (meta) {
        const patch: { title: string; theme?: string } = { title: meta.title };
        if (d.clientId == null && !d.theme) patch.theme = meta.theme;
        await storage.updateDiscussion(d.id, patch);
      }
    }
    res.end();
  });
}
