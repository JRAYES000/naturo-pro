/**
 * server/routes/internal.ts — domaine Internal (déclencheurs cron HTTP, token-gated)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique. Ces endpoints sont appelés par le cron Hostinger
 * (curl avec header X-Internal-Token) en complément des crons in-process (server/routes/cron.ts).
 *
 *   - POST /api/internal/sync-google-all   (import Google pour tous les users connectés)
 *   - POST /api/internal/send-reminders     (rappels J-1 pour tous les users)
 *   - POST /api/internal/send-daily-recap   (récap quotidien pour tous les users)
 *
 * ⚠️ Deux styles de protection DIFFÉRENTS conservés verbatim :
 *   - sync-google-all : check inline `process.env.INTERNAL_CRON_TOKEN`, header
 *     `X-Internal-Token` OU query `token`, 500 si absent / 403 si mismatch.
 *   - send-reminders / send-daily-recap : helper checkInternalToken via la const
 *     INTERNAL_TOKEN, header `x-internal-token`, 500 si non configuré / 401 si mismatch.
 *
 * NB : le cron in-process (cron.ts) importe directement importFromGoogleForUser depuis
 * helpers/google-sync. startCrons() est câblé depuis server/routes/index.ts.
 */

import type { Express } from "express";
import { storage } from "../storage";
import { importFromGoogleForUser } from "./helpers/google-sync";
import {
  sendRemindersForUser, sendDailyRecapForUser, sendReviewRequestsForUser, getLocalHour,
} from "./helpers/reminders";
import { reconcilierPaiementsStripe } from "./helpers/stripe-booking";

const INTERNAL_TOKEN = process.env.INTERNAL_CRON_TOKEN;

export function registerInternalRoutes(app: Express): void {
  // ---------- Internal cron-trigger endpoint (token-protected) ----------
  // Called by Hostinger cron every 15 minutes via curl with X-Internal-Token header.
  app.post("/api/internal/sync-google-all", async (req, res) => {
    const expected = process.env.INTERNAL_CRON_TOKEN;
    if (!expected) return res.status(500).json({ message: "INTERNAL_CRON_TOKEN missing" });
    const provided = req.header("X-Internal-Token") || req.query.token;
    if (provided !== expected) return res.status(403).json({ message: "Forbidden" });

    const usersWithToken = await storage.listUsersWithGoogleToken();
    const results: any[] = [];
    for (const u of usersWithToken) {
      try {
        const stats = await importFromGoogleForUser(u.id);
        results.push({ userId: u.id, email: u.email, ...stats });
      } catch (e: any) {
        results.push({ userId: u.id, email: u.email, error: e?.message || String(e) });
      }
    }
    res.json({ ok: true, processedAt: Date.now(), results });
  });

  // ─── Endpoints internes (X-Internal-Token gated) ────────────────────────────
  function checkInternalToken(req: any, res: any): boolean {
    if (!INTERNAL_TOKEN) {
      res.status(500).json({ message: "INTERNAL_CRON_TOKEN non configuré côté serveur" });
      return false;
    }
    const token = req.headers["x-internal-token"];
    if (token !== INTERNAL_TOKEN) {
      res.status(401).json({ message: "Unauthorized" });
      return false;
    }
    return true;
  }

  /**
   * POST /api/internal/run-crons — point d'entrée unique du cron de l'hébergeur.
   *
   * Les tâches périodiques reposaient uniquement sur des `setInterval` in-process. Or
   * Passenger arrête l'application dès qu'elle est inactive : elle a redémarré 4 à 5 fois
   * par jour ces trois derniers mois, et certains jours ne s'est pas lancée du tout. Les
   * intervalles de 15 minutes ne tombaient donc quasiment jamais — 4 rappels J-1 envoyés
   * en trois mois, sur 22 rendez-vous éligibles.
   *
   * Ce point d'entrée rejoue exactement la même logique, mais déclenchée de l'extérieur.
   * Toutes les tâches sont idempotentes EN BASE (`reminder_sent`, `recap_sent_at`,
   * `review_email_sent_at`, `stripe_processed_sessions`), donc le rejouer est sans danger.
   */
  app.post("/api/internal/run-crons", async (req, res) => {
    if (!checkInternalToken(req, res)) return;
    const bilan: Record<string, any> = { heureLocale: getLocalHour(), tache: {} };

    try {
      const users = await storage.listUsersWithEmailConfig();
      for (const u of users) {
        const heureRappel = (u as any).reminderHourLocal ?? 10;
        const heureRecap = (u as any).recapHourLocal ?? 10;
        const parUser: Record<string, any> = {};
        try {
          if (bilan.heureLocale === heureRappel) parUser.rappels = await sendRemindersForUser(u);
          if (bilan.heureLocale === heureRecap) parUser.recap = await sendDailyRecapForUser(u);
          if (bilan.heureLocale === heureRecap && (u as any).reviewRequestEnabled) {
            parUser.avis = await sendReviewRequestsForUser(u);
          }
        } catch (e: any) {
          parUser.erreur = e?.message || String(e);
          console.error(`[run-crons] user=${u.id}:`, e?.message || e);
        }
        if (Object.keys(parUser).length) bilan.tache[`user_${u.id}`] = parUser;
      }
    } catch (e: any) {
      console.error("[run-crons] emails:", e?.message || e);
      bilan.erreurEmails = e?.message || String(e);
    }

    // Import Google Calendar (idempotent : rapproché par google_event_id).
    try {
      const avecGoogle = await storage.listUsersWithGoogleToken();
      let importes = 0;
      for (const u of avecGoogle) {
        try {
          const st = await importFromGoogleForUser(u.id);
          importes += (st.created || 0) + (st.updated || 0) + (st.deleted || 0);
        } catch (e: any) {
          console.error(`[run-crons][google] user=${u.id}:`, e?.message || e);
        }
      }
      bilan.google = { praticiens: avecGoogle.length, modifications: importes };
    } catch (e: any) {
      bilan.erreurGoogle = e?.message || String(e);
    }

    // Rattrapage des acomptes Stripe payés sans rendez-vous créé.
    try {
      bilan.stripe = await reconcilierPaiementsStripe();
    } catch (e: any) {
      bilan.erreurStripe = e?.message || String(e);
    }

    res.json({ ok: true, ...bilan });
  });

  app.post("/api/internal/send-reminders", async (req, res) => {
    if (!checkInternalToken(req, res)) return;
    const users = await storage.listUsersWithEmailConfig();
    const results: any[] = [];
    for (const u of users) {
      try {
        const r = await sendRemindersForUser(u);
        results.push({ userId: u.id, ...r });
      } catch (e: any) {
        results.push({ userId: u.id, error: e?.message || String(e) });
      }
    }
    res.json({ ok: true, totalUsers: users.length, results });
  });

  app.post("/api/internal/send-daily-recap", async (req, res) => {
    if (!checkInternalToken(req, res)) return;
    const users = await storage.listUsersWithEmailConfig();
    const results: any[] = [];
    for (const u of users) {
      try {
        const r = await sendDailyRecapForUser(u);
        results.push({ userId: u.id, ...r });
      } catch (e: any) {
        results.push({ userId: u.id, error: e?.message || String(e) });
      }
    }
    res.json({ ok: true, totalUsers: users.length, results });
  });
}
