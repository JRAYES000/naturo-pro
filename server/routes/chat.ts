/**
 * server/routes/chat.ts — Assistant IA naturopathie (Mistral)
 *
 * Conversation continue unique par utilisatrice. POST appelle Mistral puis
 * persiste le message + la réponse. Historique scopé par userId.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { askNaturoAssistant, type ChatTurn } from "../mistral";

const chatBodySchema = z.object({
  message: z.string().trim().min(1, "Message vide").max(4000, "Message trop long"),
});

const HISTORY_LIMIT = 50; // messages renvoyés à l'affichage
const CONTEXT_LIMIT = 30; // messages chargés comme contexte pour Mistral

export function registerChatRoutes(app: Express): void {
  // Historique de la conversation
  app.get("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listAiChatMessages(req.userId!, HISTORY_LIMIT));
  });

  // Envoi d'un message → réponse de l'assistant
  app.post("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    }
    const userMessage = parsed.data.message;

    const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
    const day = new Date().toISOString().slice(0, 10);
    const used = await storage.incrementAiChatUsage(req.userId!, day);
    if (used > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} messages/jour). Réessaie demain.` });
    }

    // Contexte récent (chronologique) → tours pour Mistral
    const recent = await storage.listAiChatMessages(req.userId!, CONTEXT_LIMIT);
    const history: ChatTurn[] = recent.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const result = await askNaturoAssistant(history, userMessage);
    if (!result.ok) {
      const message =
        result.status === 503
          ? "L'assistant n'est pas encore disponible. Réessaie plus tard."
          : "L'assistant n'a pas pu répondre, réessaie dans un instant.";
      return res.status(result.status).json({ message });
    }

    // Persistance : message utilisateur puis réponse assistant
    const userRow = await storage.createAiChatMessage({
      userId: req.userId!,
      role: "user",
      content: userMessage,
    });
    const assistantRow = await storage.createAiChatMessage({
      userId: req.userId!,
      role: "assistant",
      content: result.reply,
    });

    res.json({ userMessage: userRow, assistantMessage: assistantRow });
  });

  // Effacement de l'historique (= droit à l'effacement RGPD)
  app.delete("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
    await storage.deleteAiChatMessages(req.userId!);
    res.json({ ok: true });
  });
}
