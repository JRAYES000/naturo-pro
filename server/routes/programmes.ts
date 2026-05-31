/**
 * server/routes/programmes.ts — domaine Programmes d'hygiène de vie
 *
 * CRUD + génération PDF (PDFKit, même librairie que les factures).
 * Ownership : toutes les mutations vérifient que le programme appartient au user connecté.
 */

import type { Express } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";

// ── Schéma d'une section de programme ────────────────────────────────────────
const programSectionSchema = z.object({
  section: z.string().min(1).max(255),
  items: z.array(z.string().min(1).max(2000)),
});

const programContentSchema = z.array(programSectionSchema);

// ── Schéma de création ────────────────────────────────────────────────────────
const createProgramSchema = z.object({
  title: z.string().min(1).max(500),
  clientId: z.number().int().positive().optional().nullable(),
  appointmentId: z.number().int().positive().optional().nullable(),
  content: programContentSchema.default([]),
  status: z.enum(["draft", "sent"]).default("draft"),
});

// ── Schéma de modification ────────────────────────────────────────────────────
const patchProgramSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  clientId: z.number().int().positive().nullable().optional(),
  appointmentId: z.number().int().positive().nullable().optional(),
  content: programContentSchema.optional(),
  status: z.enum(["draft", "sent"]).optional(),
}).strict();

// ── Helpers PDF ───────────────────────────────────────────────────────────────
const COLOR_GREEN  = "#1b4332";
const COLOR_LIGHT  = "#52796f";
const COLOR_BG     = "#f7faf9";
const COLOR_BORDER = "#d6e0dc";
const COLOR_TEXT   = "#1a1a1a";
const COLOR_MUTED  = "#6b7a76";

function formatDateLocalFR(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    timeZone: "Europe/Paris",
  });
}

type ProgramSection = { section: string; items: string[] };

async function generateProgramPdf(opts: {
  title: string;
  content: ProgramSection[];
  createdAt: number;
  clientName?: string | null;
  practitionerName: string;
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: opts.title, Author: opts.practitionerName } });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftX = doc.page.margins.left;

      // ── Bandeau vert ──
      doc.rect(0, 0, doc.page.width, 80).fill(COLOR_GREEN);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20)
        .text("Programme d'hygiène de vie", leftX, 22, { width: pageWidth });
      doc.font("Helvetica").fontSize(11)
        .text(opts.practitionerName, leftX, 46, { width: pageWidth });

      // ── Titre + méta ──
      let y = 100;
      doc.rect(leftX, y, pageWidth, 2).fill(COLOR_BORDER);
      y += 12;

      doc.font("Helvetica-Bold").fontSize(16).fillColor(COLOR_GREEN)
        .text(opts.title, leftX, y, { width: pageWidth });
      y += doc.heightOfString(opts.title, { width: pageWidth }) + 8;

      doc.font("Helvetica").fontSize(10).fillColor(COLOR_MUTED);
      const metaParts: string[] = [`Établi le ${formatDateLocalFR(opts.createdAt)}`];
      if (opts.clientName) metaParts.push(`Pour : ${opts.clientName}`);
      doc.text(metaParts.join("   •   "), leftX, y, { width: pageWidth });
      y += 20;
      doc.rect(leftX, y, pageWidth, 1).fill(COLOR_BORDER);
      y += 16;

      // ── Sections ──
      for (const sec of opts.content) {
        if (y > doc.page.height - 120) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        // En-tête de section
        doc.rect(leftX, y, pageWidth, 26).fill(COLOR_BG);
        doc.fillColor(COLOR_GREEN).font("Helvetica-Bold").fontSize(12)
          .text(sec.section, leftX + 10, y + 7, { width: pageWidth - 20 });
        y += 30;

        // Items
        for (const item of sec.items) {
          if (y > doc.page.height - 100) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          const bullet = "• ";
          const textWidth = pageWidth - 20;
          const itemHeight = doc.heightOfString(bullet + item, { width: textWidth }) + 8;
          doc.fillColor(COLOR_TEXT).font("Helvetica").fontSize(10)
            .text(bullet + item, leftX + 10, y, { width: textWidth });
          y += itemHeight;
        }
        y += 10;
      }

      if (opts.content.length === 0) {
        doc.fillColor(COLOR_MUTED).font("Helvetica-Oblique").fontSize(10)
          .text("Aucune section dans ce programme.", leftX, y);
        y += 20;
      }

      // ── Pied de page ──
      doc.fillColor(COLOR_LIGHT).font("Helvetica").fontSize(8)
        .text(
          `${opts.practitionerName} — Naturo Pro`,
          leftX,
          doc.page.height - doc.page.margins.bottom + 10,
          { width: pageWidth, align: "center" },
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

export function registerProgrammeRoutes(app: Express): void {

  // GET /api/programmes?clientId=
  app.get("/api/programmes", requireAuth, async (req: AuthedRequest, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const list = await storage.listPrograms(req.userId!, clientId);
    res.json(list);
  });

  // GET /api/programmes/:id
  app.get("/api/programmes/:id", requireAuth, async (req: AuthedRequest, res) => {
    const prog = await storage.getProgram(Number(req.params.id));
    if (!prog || prog.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(prog);
  });

  // POST /api/programmes
  app.post("/api/programmes", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = createProgramSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const { content, ...rest } = parsed.data;
    const prog = await storage.createProgram({
      ...rest,
      userId: req.userId!,
      content: JSON.stringify(content),
    });
    res.json(prog);
  });

  // PATCH /api/programmes/:id
  app.patch("/api/programmes/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const prog = await storage.getProgram(id);
    if (!prog || prog.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = patchProgramSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const { content, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest };
    if (content !== undefined) patch.content = JSON.stringify(content);
    const updated = await storage.updateProgram(id, patch as any);
    res.json(updated);
  });

  // DELETE /api/programmes/:id
  app.delete("/api/programmes/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const prog = await storage.getProgram(id);
    if (!prog || prog.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await storage.deleteProgram(id);
    res.json({ ok: true });
  });

  // GET /api/programmes/:id/pdf
  app.get("/api/programmes/:id/pdf", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const prog = await storage.getProgram(Number(req.params.id));
      if (!prog || prog.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });

      const user = await storage.getUserById(req.userId!);
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

      let clientName: string | null = null;
      if (prog.clientId) {
        const client = await storage.getClient(prog.clientId);
        if (client) clientName = `${client.firstName} ${client.lastName}`.trim();
      }

      let content: ProgramSection[] = [];
      try {
        content = JSON.parse(prog.content || "[]");
      } catch {
        content = [];
      }

      const pdf = await generateProgramPdf({
        title: prog.title,
        content,
        createdAt: prog.createdAt,
        clientName,
        practitionerName: user.name,
      });

      const safeName = prog.title.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`);
      res.send(pdf);
    } catch (e: any) {
      console.error("[programme pdf]", e?.message || e);
      res.status(500).json({ message: "Erreur lors de la génération du PDF" });
    }
  });
}
