/**
 * server/routes/notes-import.ts — import d'anciennes notes par IA (lot 3b).
 *
 * POST /api/clients/:id/import-notes        { text } ou { file: { filename, mimeType, dataBase64 } }
 *      → consultations proposées (rien n'est enregistré)
 * POST /api/clients/:id/import-notes/save   { consultations } → un rendez-vous « terminé »
 *      (source « import ») et son compte-rendu par consultation relue
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { completeJson, AI_DAILY_LIMIT } from "../mistral";
import { extractText } from "../pdf";
import { zonedDateKey, zonedTimeToUtc } from "../timezone";
import { buildNotesImportMessages, parseImportedConsultations, NOTE_FIELDS, NOTES_IMPORT_MAX_CHARS } from "../notes-import";

const consultationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  motif: z.string().max(10_000).default(""),
  anamnese: z.string().max(10_000).default(""),
  bilan: z.string().max(10_000).default(""),
  conseilsAlimentaires: z.string().max(10_000).default(""),
  hygieneDeVie: z.string().max(10_000).default(""),
  suivi: z.string().max(10_000).default(""),
  notesLibres: z.string().max(10_000).default(""),
});

export function registerNotesImportRoutes(app: Express): void {
  app.post("/api/clients/:id/import-notes", requireAuth, async (req: AuthedRequest, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client || client.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = z.object({
      text: z.string().max(NOTES_IMPORT_MAX_CHARS * 2).optional(),
      file: z.object({ filename: z.string().max(255), mimeType: z.string().max(128).nullable().optional(), dataBase64: z.string().max(2_100_000) }).optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Texte ou fichier trop volumineux" });

    let text = parsed.data.text?.trim() || "";
    if (!text && parsed.data.file) {
      const f = parsed.data.file;
      if (!/\.(pdf|txt|md)$/i.test(f.filename)) return res.status(400).json({ message: "Formats acceptés : PDF (texte), .txt ou .md." });
      try {
        text = (await extractText(Buffer.from(f.dataBase64, "base64"), f.mimeType ?? null, f.filename)).trim();
      } catch (e: any) {
        return res.status(400).json({ message: e?.message?.includes("scanné") ? "Ce PDF ne contient pas de texte (document scanné) : copiez-collez plutôt le texte." : "Fichier illisible." });
      }
    }
    if (text.length < 20) return res.status(400).json({ message: "Collez au moins quelques lignes de notes." });

    const day = zonedDateKey(Date.now());
    if ((await storage.incrementAiChatUsage(req.userId!, day)) > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} générations/jour). Réessayez demain.` });
    }
    try {
      const raw = await completeJson(buildNotesImportMessages(text, `${client.firstName} ${client.lastName}`, day));
      const consultations = parseImportedConsultations(raw, day);
      if (!consultations.length) return res.status(422).json({ message: "L'IA n'a reconnu aucune consultation dans ce texte." });
      res.json({ consultations, truncated: text.length > NOTES_IMPORT_MAX_CHARS });
    } catch (e: any) {
      console.error("[import-notes]", e?.message || e);
      res.status(e?.status === 503 ? 503 : 502).json({ message: "L'analyse a échoué, réessayez dans un instant." });
    }
  });

  app.post("/api/clients/:id/import-notes/save", requireAuth, async (req: AuthedRequest, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client || client.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = z.object({ consultations: z.array(consultationSchema).min(1).max(50) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Consultations invalides" });
    const today = zonedDateKey(Date.now());
    let created = 0;
    for (const c of parsed.data.consultations) {
      if (!NOTE_FIELDS.some((f) => c[f].trim())) continue;
      // Rendez-vous « terminé » daté (10 h, heure de Paris) qui porte le compte-rendu :
      // la note apparaît dans l'historique et la chronologie comme les autres.
      const d = c.date && c.date <= today ? c.date : today;
      const [y, m, dd] = d.split("-").map(Number);
      const startAt = zonedTimeToUtc(y, m, dd, 10, 0);
      const appt = await storage.createAppointment({
        userId: req.userId!, clientId: client.id, categoryId: null, startAt, endAt: startAt + 3600_000,
        status: "completed", source: "import",
        clientFirstName: client.firstName, clientLastName: client.lastName, clientEmail: client.email, clientPhone: client.phone,
        location: null, googleEventId: null, reminderSent: true,
      } as any);
      const now = Date.now();
      await storage.createNote({
        appointmentId: appt.id, clientId: client.id, userId: req.userId!,
        motif: c.motif || null, anamnese: c.anamnese || null, bilan: c.bilan || null,
        conseilsAlimentaires: c.conseilsAlimentaires || null, hygieneDeVie: c.hygieneDeVie || null,
        suivi: c.suivi || null, notesLibres: c.notesLibres || null,
        // Datée de la consultation d'origine : l'historique et la chronologie la rangent à sa place.
        createdAt: startAt, updatedAt: now,
      } as any);
      created++;
    }
    if (created) {
      await storage.createClientFollowup({
        userId: req.userId!, clientId: client.id, kind: "note",
        content: `${created} ancienne${created > 1 ? "s" : ""} consultation${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""} (notes reprises par IA, relues).`,
        occurredAt: Date.now(),
      }).catch(() => undefined);
    }
    res.status(201).json({ created });
  });
}
