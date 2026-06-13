import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireAdmin, type AuthedRequest } from "../auth";
import { extractText } from "../pdf";
import { chunkText, embedTexts, invalidateVectorCache } from "../rag";

const MAX_BASE64 = 28_000_000; // ~20 Mo de fichier (base64 ≈ ×1,34)
const instrSchema = z.object({ instructions: z.string().max(20000) });
const docSchema = z.object({
  title: z.string().min(1).max(255),
  filename: z.string().max(255).nullable().optional(),
  mimeType: z.string().max(127).nullable().optional(),
  dataBase64: z.string().max(MAX_BASE64).optional(),
  text: z.string().max(2_000_000).optional(),
});

export function registerAssistantAdminRoutes(app: Express): void {
  app.get("/api/admin/assistant/instructions", requireAuth, requireAdmin, async (_req, res) => {
    res.json({ instructions: await storage.getAssistantInstructions() });
  });
  app.put("/api/admin/assistant/instructions", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const p = instrSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    await storage.setAssistantInstructions(p.data.instructions);
    res.json({ ok: true });
  });
  app.get("/api/admin/assistant/documents", requireAuth, requireAdmin, async (_req, res) => {
    res.json(await storage.listKbDocuments());
  });
  app.post("/api/admin/assistant/documents", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const p = docSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides", errors: p.error.errors });
    const { title, filename, mimeType, dataBase64, text } = p.data;
    let raw = "";
    try {
      if (text) raw = text;
      else if (dataBase64) raw = await extractText(Buffer.from(dataBase64, "base64"), mimeType ?? null, filename ?? title);
      else return res.status(400).json({ message: "Fournir un texte ou un fichier." });
    } catch (e: any) {
      const doc = await storage.createKbDocument({ title, filename: filename ?? null, mimeType: mimeType ?? null, charCount: 0, status: "error", error: e?.message || "Extraction échouée" });
      return res.status(422).json({ message: doc.error, document: doc });
    }
    const chunks = chunkText(raw);
    let vectors: number[][] = [];
    try { vectors = chunks.length ? await embedTexts(chunks) : []; }
    catch (e: any) {
      const doc = await storage.createKbDocument({ title, filename: filename ?? null, mimeType: mimeType ?? null, charCount: raw.length, status: "error", error: e?.message || "Embeddings échoués" });
      return res.status(502).json({ message: doc.error, document: doc });
    }
    const doc = await storage.createKbDocument({ title, filename: filename ?? null, mimeType: mimeType ?? null, charCount: raw.length, status: "ready", error: null });
    await storage.insertKbChunks(chunks.map((c, i) => ({ documentId: doc.id, chunkIndex: i, content: c, embedding: JSON.stringify(vectors[i]) })));
    invalidateVectorCache();
    res.json({ document: doc, chunks: chunks.length });
  });
  app.delete("/api/admin/assistant/documents/:id", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    await storage.deleteKbDocument(Number(req.params.id));
    invalidateVectorCache();
    res.json({ ok: true });
  });
}
