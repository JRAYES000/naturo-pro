/**
 * server/routes/cron.ts
 *
 * Crons in-process : poll Google Calendar + rappels/recap email aux heures locales.
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 *
 * startCrons() est appelé une fois au démarrage depuis registerRoutes.
 */

import { storage } from "../storage";
import { isGoogleConfigured } from "../google";
import { importFromGoogleForUser } from "./helpers/google-sync";
import {
  sendRemindersForUser, sendDailyRecapForUser, sendReviewRequestsForUser,
  getLocalHour, getLocalDayKey, TZ,
} from "./helpers/reminders";

// État mutable d'idempotence du cron email (anciennement closures dans registerRoutes).
let lastReminderRunDay = "";
let lastRecapRunDay = "";
let lastReviewRunDay = "";

export function startCrons(): void {
  const isProd = process.env.NODE_ENV === "production";

  // ---------- In-process cron: poll Google Calendar every 15 minutes ----------
  // Belt + braces: a Hostinger cron also hits /api/internal/sync-google-all on the same cadence.
  // Disable in development unless explicitly enabled to avoid hammering the API while coding.
  const cronEnabled = isProd || process.env.ENABLE_GOOGLE_POLL === "1";
  if (cronEnabled && isGoogleConfigured()) {
    const POLL_MS = 15 * 60 * 1000;
    setInterval(async () => {
      try {
        const usersWithToken = await storage.listUsersWithGoogleToken();
        for (const u of usersWithToken) {
          try {
            const stats = await importFromGoogleForUser(u.id);
            if (stats.created || stats.updated || stats.deleted) {
              console.log(`[google-poll] user=${u.id} created=${stats.created} updated=${stats.updated} deleted=${stats.deleted} total=${stats.total}`);
            }
          } catch (e: any) {
            console.error(`[google-poll] user=${u.id} failed:`, e?.message || e);
          }
        }
      } catch (e) { console.error("[google-poll]", e); }
    }, POLL_MS);
    console.log(`[google-poll] enabled, every ${POLL_MS / 60000} min`);
  }

  // ─── Cron interne horaire : déclenche reminders/recap aux heures locales ────
  // Tourne toutes les 15min mais les actions sont gardées par lastRunDay (idempotent).
  const EMAIL_CRON_MS = 15 * 60 * 1000;
  const emailCronEnabled = isProd || process.env.ENABLE_EMAIL_CRON === "1";
  if (emailCronEnabled) {
    setInterval(async () => {
      try {
        const hour = getLocalHour();
        const dayKey = getLocalDayKey();
        const users = await storage.listUsersWithEmailConfig();

        // Reminders
        for (const u of users) {
          const reminderHour = (u as any).reminderHourLocal ?? 10;
          if (hour === reminderHour && lastReminderRunDay !== `${dayKey}:${u.id}`) {
            try {
              const r = await sendRemindersForUser(u);
              if (r.sent || r.errors) {
                console.log(`[reminder-cron] user=${u.id} sent=${r.sent} skipped=${r.skipped} errors=${r.errors}`);
              }
              lastReminderRunDay = `${dayKey}:${u.id}`;
            } catch (e: any) {
              console.error(`[reminder-cron] user=${u.id}:`, e?.message || e);
            }
          }
          const recapHour = (u as any).recapHourLocal ?? 10;
          if (hour === recapHour && lastRecapRunDay !== `${dayKey}:${u.id}` && (u as any).dailyRecapEnabled) {
            try {
              const r = await sendDailyRecapForUser(u);
              if (r.ok) console.log(`[recap-cron] user=${u.id} sent (${r.sent} RDV)`);
              lastRecapRunDay = `${dayKey}:${u.id}`;
            } catch (e: any) {
              console.error(`[recap-cron] user=${u.id}:`, e?.message || e);
            }
          }
          // Avis Google — tourne à la même heure que le récap, 1×/jour
          if (hour === recapHour && lastReviewRunDay !== `${dayKey}:${u.id}` && (u as any).reviewRequestEnabled) {
            try {
              const r = await sendReviewRequestsForUser(u);
              if (r.sent || r.errors) {
                console.log(`[review-cron] user=${u.id} sent=${r.sent} skipped=${r.skipped} errors=${r.errors}`);
              }
              lastReviewRunDay = `${dayKey}:${u.id}`;
            } catch (e: any) {
              console.error(`[review-cron] user=${u.id}:`, e?.message || e);
            }
          }
        }
      } catch (e: any) {
        console.error("[email-cron]", e?.message || e);
      }
    }, EMAIL_CRON_MS);
    console.log(`[email-cron] enabled, every ${EMAIL_CRON_MS / 60000} min (TZ=${TZ})`);
  }
}
