/**
 * server/routes/compte-rendu.ts — compte-rendu de consultation PDF (Lot 2, action 14)
 *
 * Génère un PDF client à partir d'une note de consultation existante, puis
 * l'envoie par email au client APRÈS validation de la praticienne : le PDF se
 * prévisualise via GET, l'envoi est un POST séparé, déclenché explicitement.
 *
 * Réutilise le rendu PDF des programmes (generateProgramPdf) et la découpe
 * markdown → items (programmeFromMarkdown). Chemins /api/notes/... → couverts
 * par PAID_PATH_RE (donnée de santé, réservée à l'abonnement).
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { generateProgramPdf } from "./programmes";
import { programmeFromMarkdown, type ProgramSection } from "./helpers/programme-bridge";
import { getEmailConfigForUser } from "./helpers/email-sending";
import { sendEmail } from "../email";
import { emailShell } from "../email-templates/defaults";
import { recordEvent } from "../analytics";
import { APP_TZ } from "../timezone";

// Champs de la note retenus dans le compte-rendu CLIENT, dans l'ordre du document.
// notesLibres est volontairement exclu : ce sont les notes internes de la praticienne.
const SECTIONS_COMPTE_RENDU: Array<{ field: string; label: string }> = [
  { field: "motif", label: "Motif de consultation" },
  { field: "anamnese", label: "Anamnèse" },
  { field: "bilan", label: "Bilan naturopathique" },
  { field: "conseilsAlimentaires", label: "Conseils alimentaires" },
  { field: "hygieneDeVie", label: "Hygiène de vie" },
  { field: "suivi", label: "Suivi proposé" },
];

/** Transforme une note en sections PDF — champs vides omis. Fonction pure (testée). */
export function compteRenduSections(note: Record<string, unknown>): ProgramSection[] {
  const out: ProgramSection[] = [];
  for (const { field, label } of SECTIONS_COMPTE_RENDU) {
    const raw = note[field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    // programmeFromMarkdown gère puces, paragraphes et titres résiduels ; on ne
    // garde que les items — le titre de section vient du champ, pas du texte.
    const items = programmeFromMarkdown(raw).flatMap((s) => s.items);
    if (items.length) out.push({ section: label, items });
  }
  return out;
}

function formatDateFR(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", timeZone: APP_TZ,
  });
}

async function buildCompteRenduPdf(req: AuthedRequest, noteId: number): Promise<
  | { ok: true; pdf: Buffer; dateText: string; client: { email: string | null; firstName: string } | null; user: any }
  | { ok: false; status: number; message: string }
> {
  const note = await storage.getNote(noteId);
  if (!note || note.userId !== req.userId) return { ok: false, status: 404, message: "Note introuvable" };
  const user = await storage.getUserById(req.userId!);
  if (!user) return { ok: false, status: 404, message: "Utilisateur introuvable" };

  let clientName: string | null = null;
  let client: { email: string | null; firstName: string } | null = null;
  if (note.clientId) {
    const c = await storage.getClient(note.clientId);
    if (c && c.userId === req.userId) {
      clientName = `${c.firstName} ${c.lastName}`.trim();
      client = { email: c.email ?? null, firstName: c.firstName };
    }
  }

  // Date de la consultation : celle du RDV lié si possible, sinon celle de la note.
  let dateMs = note.createdAt;
  if (note.appointmentId) {
    const appt = await storage.getAppointment(note.appointmentId);
    if (appt && (appt as any).userId === req.userId) dateMs = appt.startAt;
  }
  const dateText = formatDateFR(dateMs);

  const pdf = await generateProgramPdf({
    bannerTitle: "Compte-rendu de consultation",
    title: `Consultation du ${dateText}`,
    content: compteRenduSections(note as any),
    createdAt: dateMs,
    clientName,
    practitionerName: user.name,
  });
  return { ok: true, pdf, dateText, client, user };
}

export function registerCompteRenduRoutes(app: Express): void {
  // GET /api/notes/:id/compte-rendu.pdf — prévisualisation (validation praticienne)
  app.get("/api/notes/:id/compte-rendu.pdf", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const r = await buildCompteRenduPdf(req, Number(req.params.id));
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="compte-rendu.pdf"`);
      res.send(r.pdf);
    } catch (e: any) {
      console.error("[compte-rendu pdf]", e?.message || e);
      res.status(500).json({ message: "Erreur lors de la génération du PDF" });
    }
  });

  // POST /api/notes/:id/compte-rendu/envoyer — envoi au client (action explicite)
  app.post("/api/notes/:id/compte-rendu/envoyer", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const r = await buildCompteRenduPdf(req, Number(req.params.id));
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      if (!r.client?.email) {
        return res.status(400).json({ message: "Cette note n'est pas liée à un client avec une adresse email." });
      }
      const cfg = getEmailConfigForUser(r.user);
      if (!cfg) {
        return res.status(400).json({ message: "Configure d'abord l'envoi d'emails dans Paramètres (clé Resend)." });
      }
      const subject = `Votre compte-rendu de consultation du ${r.dateText}`;
      const body = `
        <h1>Bonjour ${r.client.firstName},</h1>
        <p>Veuillez trouver ci-joint le compte-rendu de votre consultation du ${r.dateText}.</p>
        <p>N'hésitez pas à me contacter pour toute question.</p>
        <h2>À bientôt,</h2>
        <p>${r.user.name}</p>`;
      const sent = await sendEmail(cfg, r.client.email, subject, emailShell(subject, body), undefined, [
        { filename: `compte-rendu-${r.dateText.replace(/\s+/g, "-")}.pdf`, content: r.pdf, contentType: "application/pdf" },
      ]);
      if (!sent.ok) return res.status(502).json({ message: `Échec de l'envoi : ${sent.error}` });
      recordEvent(req.userId!, "compte_rendu_envoye", { noteId: Number(req.params.id) });
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[compte-rendu envoi]", e?.message || e);
      res.status(500).json({ message: "Erreur lors de l'envoi du compte-rendu" });
    }
  });
}
