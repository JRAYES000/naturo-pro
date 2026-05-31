/**
 * server/routes/documents.ts — Documents attachés à une fiche cliente
 *
 * Stocke les fichiers (analyses, bilans…) en base64 en DB.
 * Limite : ~5 Mo par fichier (≈6 820 000 chars de base64).
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";

// ~5 Mo en base64 : chaque octet devient ~1,33 char → 5*1024*1024*1.334 ≈ 6 990 506
// On prend une marge un peu plus large et on valide à 7 000 000 chars.
const MAX_BASE64_LEN = 7_000_000;

const uploadBodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  dataBase64: z.string().min(1).max(MAX_BASE64_LEN, {
    message: "Fichier trop volumineux (maximum 5 Mo)",
  }),
});

export function registerDocumentRoutes(app: Express): void {
  // ── POST /api/clients/:clientId/documents — upload ────────────────────────
  app.post("/api/clients/:clientId/documents", requireAuth, async (req: AuthedRequest, res) => {
    const clientId = Number(req.params.clientId);

    // Vérifier que le client appartient à ce praticien
    const client = await storage.getClient(clientId);
    if (!client || client.userId !== req.userId!) {
      return res.status(404).json({ message: "Client introuvable" });
    }

    // Vérification rapide de la taille avant validation Zod complète
    // (évite de parser un payload géant dans Zod si clairement trop grand)
    if (
      typeof req.body?.dataBase64 === "string" &&
      req.body.dataBase64.length > MAX_BASE64_LEN
    ) {
      return res.status(413).json({ message: "Fichier trop volumineux (maximum 5 Mo)" });
    }

    const parsed = uploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.errors[0];
      // 413 si dépassement de taille, 400 sinon
      const status = firstIssue?.message?.includes("volumineux") ? 413 : 400;
      return res.status(status).json({ message: firstIssue?.message ?? "Données invalides", errors: parsed.error.errors });
    }

    const { filename, mimeType, dataBase64 } = parsed.data;
    // Calculer la taille réelle en octets à partir de la longueur base64
    // (chaque groupe de 4 chars = 3 octets, déduction pour le padding =)
    const padding = dataBase64.endsWith("==") ? 2 : dataBase64.endsWith("=") ? 1 : 0;
    const sizeBytes = Math.floor(dataBase64.length * 3 / 4) - padding;

    const doc = await storage.createClientDocument({
      userId: req.userId!,
      clientId,
      filename,
      mimeType,
      sizeBytes,
      dataBase64,
    });

    // Retourner les métadonnées sans le dataBase64
    const { dataBase64: _omit, ...meta } = doc;
    res.status(201).json(meta);
  });

  // ── GET /api/clients/:clientId/documents — liste (métadonnées seules) ────
  app.get("/api/clients/:clientId/documents", requireAuth, async (req: AuthedRequest, res) => {
    const clientId = Number(req.params.clientId);

    const client = await storage.getClient(clientId);
    if (!client || client.userId !== req.userId!) {
      return res.status(404).json({ message: "Client introuvable" });
    }

    const docs = await storage.listClientDocuments(req.userId!, clientId);
    res.json(docs);
  });

  // ── GET /api/documents/:id/download — téléchargement ─────────────────────
  app.get("/api/documents/:id/download", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const doc = await storage.getClientDocument(id);

    if (!doc || doc.userId !== req.userId!) {
      return res.status(404).json({ message: "Document introuvable" });
    }

    const buffer = Buffer.from(doc.dataBase64, "base64");
    const safeFilename = doc.filename.replace(/[^a-zA-Z0-9._\- ]/g, "_");

    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"`,
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  });

  // ── DELETE /api/documents/:id — suppression ───────────────────────────────
  app.delete("/api/documents/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const doc = await storage.getClientDocument(id);

    if (!doc || doc.userId !== req.userId!) {
      return res.status(404).json({ message: "Document introuvable" });
    }

    await storage.deleteClientDocument(id);
    res.json({ ok: true });
  });
}
