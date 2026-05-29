/**
 * server/routes/reminders.ts — domaine Reminders (UI : log + stats + rappel manuel)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique.
 *
 * ⚠️ Périmètre : uniquement les endpoints UI du praticien
 *   - GET  /api/reminders/log
 *   - GET  /api/reminders/stats
 *   - POST /api/appointments/:id/send-reminder  (rappel manuel, PHASE 3.5-D)
 * Les déclencheurs cron /api/internal/send-reminders et /api/internal/send-daily-recap
 * (qui consomment helpers/reminders.ts) restent dans routes.ts → domaine internal+crons.
 * Le rappel manuel construit son email inline (renderReminderEmail), il n'utilise donc
 * pas sendRemindersForUser.
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { renderReminderEmail, sendEmail, formatRdvDate } from "../email";
import { getEmailConfigForUser } from "./helpers/email-sending";
import { genToken } from "./helpers/tokens";

const APP_URL = process.env.APP_URL || "https://app.ecole-naturo.fr";

export function registerReminderRoutes(app: Express): void {
  /**
   * GET /api/reminders/log
   * Liste des RDV à venir + passés récents (J-7 à J+30) avec leur statut rappel.
   * Triés par date desc (récents d'abord). Max 100 résultats.
   */
  app.get("/api/reminders/log", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const now = Date.now();
      const fromTs = now - 7 * 24 * 60 * 60 * 1000;  // J-7
      const toTs   = now + 30 * 24 * 60 * 60 * 1000; // J+30

      const appts = await storage.listAppointmentsForReminderLog(userId, fromTs, toTs);

      // Récupère les emails clients (via client lié si pas d'email direct)
      const enriched = await Promise.all(
        appts.slice(0, 100).map(async (a: any) => {
          let clientName = `${a.clientFirstName || ""} ${a.clientLastName || ""}`.trim();
          let clientEmail: string | null = a.clientEmail || null;

          if (a.clientId) {
            const c = await storage.getClient(a.clientId);
            if (c) {
              if (!clientName) clientName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
              if (!clientEmail) clientEmail = c.email || null;
            }
          }

          const isPast = a.startAt < now;
          let status: string;
          if (a.status === "cancelled" || a.clientCancelledAt) {
            status = "past"; // annulé, ne comptera pas comme pending
          } else if (!clientEmail) {
            status = "disabled";
          } else if (a.reminderSent) {
            status = "sent";
          } else if (isPast) {
            status = "past";
          } else {
            status = "pending";
          }

          return {
            id: a.id,
            clientName: clientName || "(sans nom)",
            clientEmail,
            scheduledAt: a.startAt,
            status,
            reminderSentAt: a.reminderSentAt || null,
          };
        }),
      );

      res.json(enriched);
    } catch (e: any) {
      console.error("[reminders/log]", e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  /**
   * GET /api/reminders/stats
   * Compteurs : envoyés ce mois-ci, total lifetime, à venir non encore envoyés,
   * prochain envoi prévu (date du prochain RDV J-1).
   */
  app.get("/api/reminders/stats", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const now = Date.now();

      // J-7 à J+30 pour les compteurs courants
      const fromTs = now - 7 * 24 * 60 * 60 * 1000;
      const toTs   = now + 30 * 24 * 60 * 60 * 1000;
      const appts  = await storage.listAppointmentsForReminderLog(userId, fromTs, toTs);

      // Pour total lifetime : tous les RDV depuis le début
      const allAppts = await storage.listAppointments(userId);

      // Début du mois courant (minuit local)
      const nowDate = new Date(now);
      const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();

      const sentThisMonth = (allAppts as any[]).filter(
        (a: any) => a.reminderSent && a.reminderSentAt && a.reminderSentAt >= startOfMonth,
      ).length;

      const sentTotal = (allAppts as any[]).filter((a: any) => a.reminderSent).length;

      // RDV à venir non encore envoyés (dans les 30j)
      const pendingCount = appts.filter((a: any) => {
        const isPast = a.startAt < now;
        return !isPast && !a.reminderSent && a.status !== "cancelled" && !a.clientCancelledAt;
      }).length;

      // Prochain envoi prévu = prochain RDV dont la date J-1 est à venir et reminder non envoyé
      let nextSendAt: number | null = null;
      const upcoming = appts
        .filter((a: any) => !a.reminderSent && a.startAt > now && a.status !== "cancelled" && !a.clientCancelledAt)
        .sort((a: any, b: any) => a.startAt - b.startAt);
      if (upcoming.length > 0) {
        const nextAppt = upcoming[0] as any;
        nextSendAt = nextAppt.startAt - 24 * 60 * 60 * 1000; // J-1
      }

      res.json({
        sentThisMonth,
        sentTotal,
        pendingCount,
        nextSendAt,
      });
    } catch (e: any) {
      console.error("[reminders/stats]", e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });


  // ────── PHASE 3.5-D — Manual reminder ──────
  app.post("/api/appointments/:id/send-reminder", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const apptId = Number(req.params.id);
      if (isNaN(apptId)) return res.status(400).json({ message: "ID invalide" });

      const a = await storage.getAppointment(apptId);
      if (!a || (a as any).userId !== req.userId) return res.status(404).json({ message: "RDV introuvable" });

      // Vérifie email client
      let clientEmail = (a as any).clientEmail || null;
      if ((a as any).clientId) {
        const c = await storage.getClient((a as any).clientId);
        if (c?.email) clientEmail = c.email;
      }
      if (!clientEmail) return res.status(400).json({ message: "Le client n'a pas d'email" });

      // Vérifie que le RDV est dans le futur
      if ((a as any).startAt <= Date.now()) return res.status(400).json({ message: "Le RDV est passé" });

      const user = await storage.getUserById(req.userId!);
      const cfg = user ? getEmailConfigForUser(user) : null;
      if (!cfg) return res.status(400).json({ message: "Configuration email manquante (clé Resend + adresse expéditeur)" });

      const alreadySent = !!(a as any).reminderSent;

      // Générer tokens si manquants
      let confirmToken = (a as any).confirmToken;
      let cancelToken = (a as any).cancelToken;
      const patch: any = { reminderSent: true, reminderSentAt: Date.now() };
      if (!confirmToken) { confirmToken = genToken(); patch.confirmToken = confirmToken; }
      if (!cancelToken) { cancelToken = genToken(); patch.cancelToken = cancelToken; }

      // Construire le contexte pour l'email
      const cat = (a as any).categoryId ? await storage.getCategory((a as any).categoryId) : null;
      let clientFirstName = (a as any).clientFirstName || "";
      let clientLastName = (a as any).clientLastName || "";
      if ((a as any).clientId) {
        const c = await storage.getClient((a as any).clientId);
        if (c) {
          clientFirstName = c.firstName || clientFirstName;
          clientLastName = c.lastName || clientLastName;
        }
      }

      const dateText = formatRdvDate((a as any).startAt);
      const { subject, html, text } = renderReminderEmail({
        clientFirstName: clientFirstName || "",
        practitionerName: user!.name || user!.email || "",
        practitionerEmail: user!.email,
        practitionerPhone: (user as any).phone || null,
        rdvDateText: dateText,
        categoryName: cat?.name || null,
        durationMinutes: cat?.durationMinutes || null,
        priceCents: cat?.priceCents || null,
        location: (a as any).location || cat?.location || null,
        paymentStatus: (a as any).paymentStatus || null,
        confirmUrl: `${APP_URL}/api/rdv/confirm/${confirmToken}`,
        cancelUrl: `${APP_URL}/api/rdv/cancel/${cancelToken}`,
        notesBefore: (a as any).notesBefore || null,
      });

      const r = await sendEmail(cfg, clientEmail, subject, html, text);
      if (!r.ok) return res.status(502).json({ message: r.error || "Erreur envoi email" });

      await storage.updateAppointment(apptId, patch);
      return res.json({ success: true, alreadySent, sentAt: patch.reminderSentAt });
    } catch (e: any) {
      console.error("[send-reminder manual]", e?.message || e);
      res.status(500).json({ message: e?.message || "Erreur serveur" });
    }
  });
}
