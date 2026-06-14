import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { ASSISTANT_THEMES, THEME_OTHER } from "@shared/assistant-themes";
import { retrieveRelevantChunks } from "../rag";
import { streamContentStudio, suggestContentAngles, type Channel, type ContentFormat } from "../social-content";

const CHANNELS = ["instagram", "facebook"] as const;
const FORMATS = ["carrousel", "reel", "story", "post_groupe", "legende"] as const;
const THEME_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const generateSchema = z.object({
  channel: z.enum(CHANNELS),
  format: z.enum(FORMATS),
  topicType: z.enum(["client_theme", "theme", "libre"]),
  topic: z.string().trim().min(1).max(200),
});
const suggestSchema = z.object({ themes: z.array(z.string().min(1).max(120)).min(1).max(10) });
const savePostSchema = z.object({
  channel: z.enum(CHANNELS),
  format: z.enum(FORMATS),
  theme: z.string().max(200).nullable().optional(),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
});
const patchPostSchema = z.object({
  body: z.string().min(1).optional(),
  status: z.enum(["brouillon", "a_publier", "publie"]).optional(),
});
const profileSchema = z.object({
  marketingTone: z.string().max(64).nullable().optional(),
  marketingAudience: z.string().max(255).nullable().optional(),
});

export function registerContentRoutes(app: Express): void {
  // Sources d'idées : thèmes réels des clientes (agrégés) + thèmes prédéfinis.
  app.get("/api/content/idea-sources", requireAuth, async (req: AuthedRequest, res) => {
    const clientThemes = await storage.getClientThemeStats(req.userId!, Date.now() - THEME_WINDOW_MS);
    res.json({ clientThemes, predefinedThemes: ASSISTANT_THEMES.filter((t) => t !== THEME_OTHER) });
  });

  // Suggestions d'angles (Feature 2).
  app.post("/api/content/suggest", requireAuth, async (req: AuthedRequest, res) => {
    const p = suggestSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(404).json({ message: "Compte introuvable" });
    res.json({ angles: await suggestContentAngles(p.data.themes, { name: user.name }) });
  });

  // Génération streamée d'un contenu (plain-text stream, comme les discussions).
  app.post("/api/content/generate", requireAuth, async (req: AuthedRequest, res) => {
    const p = generateSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    // topicType est validé mais non utilisé côté serveur : la génération est pilotée par `topic` ;
    // il est conservé dans le contrat pour l'intention côté client (UX) et la compatibilité future.
    const { channel, format, topic } = p.data;

    const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
    const day = new Date().toISOString().slice(0, 10);
    if ((await storage.incrementAiChatUsage(req.userId!, day)) > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} générations/jour). Réessaie demain.` });
    }

    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(404).json({ message: "Compte introuvable" });

    let contextChunks: string[] = [];
    try { contextChunks = (await retrieveRelevantChunks(topic)).map((r) => r.content); } catch { contextChunks = []; }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    let full = "";
    try {
      for await (const delta of streamContentStudio({
        channel: channel as Channel,
        format: format as ContentFormat,
        topic,
        voice: {
          name: user.name, specialties: user.specialties, city: user.city,
          marketingTone: user.marketingTone, marketingAudience: user.marketingAudience,
          slug: user.slug, publicPageEnabled: user.publicPageEnabled,
        },
        contextChunks,
      })) {
        full += delta;
        res.write(delta);
      }
    } catch (e: any) {
      if (!full) {
        res.statusCode = e?.status === 503 ? 503 : 502;
        return res.end(e?.status === 503
          ? "Le studio de contenu n'est pas encore disponible. Réessaie plus tard."
          : "La génération a échoué, réessaie dans un instant.");
      }
    }
    res.end();
  });

  // Bibliothèque « Mes contenus ».
  app.get("/api/content/posts", requireAuth, async (req: AuthedRequest, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(await storage.listContentPosts(req.userId!, status));
  });
  app.post("/api/content/posts", requireAuth, async (req: AuthedRequest, res) => {
    const p = savePostSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    const post = await storage.createContentPost({ userId: req.userId!, ...p.data, theme: p.data.theme ?? null });
    res.json(post);
  });
  app.patch("/api/content/posts/:id", requireAuth, async (req: AuthedRequest, res) => {
    const existing = await storage.getContentPost(Number(req.params.id));
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ message: "Contenu introuvable" });
    const p = patchPostSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    res.json(await storage.updateContentPost(existing.id, p.data));
  });
  app.delete("/api/content/posts/:id", requireAuth, async (req: AuthedRequest, res) => {
    const existing = await storage.getContentPost(Number(req.params.id));
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ message: "Contenu introuvable" });
    await storage.deleteContentPost(existing.id);
    res.json({ ok: true });
  });

  // Profil « Ma voix » (ton + audience).
  app.get("/api/content/profile", requireAuth, async (req: AuthedRequest, res) => {
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(404).json({ message: "Compte introuvable" });
    res.json({ marketingTone: user.marketingTone ?? null, marketingAudience: user.marketingAudience ?? null });
  });
  app.put("/api/content/profile", requireAuth, async (req: AuthedRequest, res) => {
    const p = profileSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    await storage.updateUserMarketing(req.userId!, {
      marketingTone: p.data.marketingTone ?? null,
      marketingAudience: p.data.marketingAudience ?? null,
    });
    res.json({ ok: true });
  });
}
