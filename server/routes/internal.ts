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
 * NB : le cron in-process (cron.ts) importe directement importFromGoogleForUser ; il
 * n'utilise PAS le hack `(registerRoutes as any).__importFromGoogleForUser` (resté dans
 * routes.ts par sécurité). startCrons() reste appelé depuis routes.ts.
 */

import type { Express } from "express";
import { storage } from "../storage";
import { importFromGoogleForUser } from "./helpers/google-sync";
import { sendRemindersForUser, sendDailyRecapForUser } from "./helpers/reminders";

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
