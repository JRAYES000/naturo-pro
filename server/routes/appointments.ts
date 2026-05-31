/**
 * server/routes/appointments.ts — domaine Appointments (+ sous-ressource notes)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique. Importe syncApptToGoogle (sync Google Calendar)
 * et createInvoiceFromAppointment (hook auto-facture) depuis server/routes/helpers/.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { insertAppointmentSchema } from "@shared/schema-active";
import { syncApptToGoogle } from "./helpers/google-sync";
import { createInvoiceFromAppointment } from "./helpers/invoices";
import { buildIcsForAppointment } from "../ics";

// Mass-assignment whitelists (Phase 3 Lot 1 — security hardening).
// Ces schémas Zod limitent les champs modifiables via PATCH/POST, empêchant
// un attaquant de transférer une ressource vers un autre user via {userId:X}.
const patchAppointmentSchema = z.object({
  clientId: z.number().int().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  startAt: z.number().int().optional(),
  endAt: z.number().int().optional(),
  status: z.enum(["confirmed", "cancelled", "completed", "blocked"]).optional(),
  clientFirstName: z.string().nullable().optional(),
  clientLastName: z.string().nullable().optional(),
  clientEmail: z.string().nullable().optional(),
  clientPhone: z.string().nullable().optional(),
  notesBefore: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  reminderSent: z.boolean().optional(),
  paymentStatus: z.enum(["unpaid", "paid", "partial"]).optional(),
  paymentAmountCents: z.number().int().min(0).optional(),
  clientConfirmedAt: z.number().int().nullable().optional(),
  clientCancelledAt: z.number().int().nullable().optional(),
}).strict();

const noteContentSchema = z.object({
  motif: z.string().nullable().optional(),
  anamnese: z.string().nullable().optional(),
  bilan: z.string().nullable().optional(),
  conseilsAlimentaires: z.string().nullable().optional(),
  hygieneDeVie: z.string().nullable().optional(),
  suivi: z.string().nullable().optional(),
  notesLibres: z.string().nullable().optional(),
}).strict();

export function registerAppointmentRoutes(app: Express): void {
  // ---------- APPOINTMENTS ----------
  app.get("/api/appointments", requireAuth, async (req: AuthedRequest, res) => {
    const from = req.query.from ? Number(req.query.from) : undefined;
    const to = req.query.to ? Number(req.query.to) : undefined;
    res.json(await storage.listAppointments(req.userId!, from, to));
  });
  // Schéma de récurrence (champs optionnels, ignorés si absents)
  const recurrenceSchema = z.object({
    recurrence: z.enum(["weekly", "biweekly", "monthly"]).optional(),
    occurrences: z.number().int().min(2).max(12).optional(),
  });

  app.post("/api/appointments", requireAuth, async (req: AuthedRequest, res) => {
    const recParsed = recurrenceSchema.safeParse(req.body);
    const recurrence = recParsed.success ? recParsed.data.recurrence : undefined;
    const occurrences = recParsed.success ? recParsed.data.occurrences : undefined;

    // Créer le premier rendez-vous (occurrence 0)
    const parsed = insertAppointmentSchema.safeParse({ ...req.body, userId: req.userId });
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    let appt = await storage.createAppointment(parsed.data);
    const eventId = await syncApptToGoogle("create", req.userId!, appt);
    if (eventId) {
      const refreshed = await storage.updateAppointment(appt.id, { googleEventId: eventId });
      if (refreshed) appt = refreshed;
    }

    // Si récurrence demandée, créer les occurrences suivantes
    if (recurrence && occurrences && occurrences > 1) {
      const created = [appt];
      for (let i = 1; i < occurrences; i++) {
        let offsetMs: number;
        if (recurrence === "weekly") offsetMs = i * 7 * 24 * 60 * 60 * 1000;
        else if (recurrence === "biweekly") offsetMs = i * 14 * 24 * 60 * 60 * 1000;
        else {
          // monthly : décaler mois par mois depuis la date de base
          const base = new Date(parsed.data.startAt as number);
          const shifted = new Date(base);
          shifted.setMonth(shifted.getMonth() + i);
          offsetMs = shifted.getTime() - base.getTime();
        }
        const occData = {
          ...parsed.data,
          startAt: (parsed.data.startAt as number) + offsetMs,
          endAt: (parsed.data.endAt as number) + offsetMs,
        };
        let occAppt = await storage.createAppointment(occData);
        const occEventId = await syncApptToGoogle("create", req.userId!, occAppt);
        if (occEventId) {
          const refreshed = await storage.updateAppointment(occAppt.id, { googleEventId: occEventId });
          if (refreshed) occAppt = refreshed;
        }
        created.push(occAppt);
      }
      return res.json(created);
    }

    res.json(appt);
  });
  // Lot 5 — isolation : GET détail avec ownership filter
  app.get("/api/appointments/:id", requireAuth, async (req: AuthedRequest, res) => {
    const a = await storage.getAppointment(Number(req.params.id));
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(a);
  });
  app.patch("/api/appointments/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const a = await storage.getAppointment(id);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = patchAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const wasCompleted = a.status === "completed";
    let updated = await storage.updateAppointment(id, parsed.data as any);
    if (!updated) return res.status(404).json({ message: "Introuvable" });
    const eventId = await syncApptToGoogle("update", req.userId!, updated);
    if (eventId && eventId !== updated.googleEventId) {
      const refreshed = await storage.updateAppointment(id, { googleEventId: eventId });
      if (refreshed) updated = refreshed;
    }
    // Hook auto-facture : si le RDV passe en "completed" et toggle activé
    if (!wasCompleted && updated.status === "completed") {
      try {
        const user = await storage.getUserById(req.userId!);
        if (user?.autoInvoiceOnCompleted) {
          const existing = await storage.getInvoiceByAppointment(id);
          if (!existing) {
            await createInvoiceFromAppointment(req.userId!, updated, user);
          }
        }
      } catch (e: any) {
        console.error("[auto-invoice]", e?.message || e);
      }
    }
    res.json(updated);
  });
  app.delete("/api/appointments/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const a = await storage.getAppointment(id);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await syncApptToGoogle("delete", req.userId!, a);
    await storage.deleteAppointment(id);
    res.json({ ok: true });
  });

  // ---------- NOTES ----------
  app.get("/api/appointments/:id/note", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const a = await storage.getAppointment(id);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    res.json(await storage.getNoteByAppointment(id) || null);
  });
  app.post("/api/appointments/:id/note", requireAuth, async (req: AuthedRequest, res) => {
    const apptId = Number(req.params.id);
    const a = await storage.getAppointment(apptId);
    if (!a || a.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = noteContentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const existing = await storage.getNoteByAppointment(apptId);
    if (existing) return res.json(await storage.updateNote(existing.id, { ...parsed.data, updatedAt: Date.now() } as any));
    const tnow = Date.now();
    const note = await storage.createNote({
      ...parsed.data,
      appointmentId: apptId,
      clientId: a.clientId ?? null,
      userId: req.userId!,
      createdAt: tnow, updatedAt: tnow,
    } as any);
    res.json(note);
  });
  app.patch("/api/notes/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const n = await storage.getNote(id);
    if (!n || n.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = noteContentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    res.json(await storage.updateNote(id, { ...parsed.data, updatedAt: Date.now() } as any));
  });

  // ---------- EXPORT ICS ----------
  app.get("/api/appointments/:id/ics", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const appt = await storage.getAppointment(id);
    if (!appt || appt.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });

    const user = await storage.getUserById(req.userId!);
    const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;

    const practitionerName = user?.name || user?.email || "Votre praticien";
    const durationMin: number = cat?.durationMinutes ?? 60;
    const location: string | null = appt.location || cat?.location || null;
    const clientFirstName = appt.clientFirstName || "Client";
    const clientFullName = `${clientFirstName} ${appt.clientLastName || ""}`.trim();
    const clientEmail = appt.clientEmail || user?.email || "";

    const icsContent = buildIcsForAppointment({
      uid: `${appt.id}@app.ecole-naturo.fr`,
      startMs: appt.startAt,
      durationMin,
      summary: `${practitionerName} — Consultation`,
      description: `${cat?.name || "Consultation"}\\nPraticien : ${practitionerName}`,
      location,
      organizerName: practitionerName,
      organizerEmail: user?.email || "",
      attendeeName: clientFullName,
      attendeeEmail: clientEmail,
    });

    res
      .set("Content-Type", "text/calendar; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="rdv-${id}.ics"`)
      .send(icsContent);
  });
}
