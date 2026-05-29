/**
 * server/routes/google.ts — domaine Google (OAuth + sync manuel)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique.
 *   - GET  /api/auth/google           (initiation OAuth, redirect)
 *   - GET  /api/auth/google/callback  (échange code → tokens, redirect)
 *   - GET  /api/google/status         (configuré + connecté pour le user)
 *   - POST /api/google/disconnect     (efface les tokens)
 *   - POST /api/google/sync-import    (déclencheur manuel d'import depuis l'UI)
 *
 * ⚠️ RESTENT dans routes.ts (ne PAS migrer ici) :
 *   - le hack `(registerRoutes as any).__importFromGoogleForUser = importFromGoogleForUser`
 *     (registerRoutes n'est pas en scope ici ; lu par le module cron) ;
 *   - POST /api/internal/sync-google-all (domaine internal+crons, étape 11).
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import {
  isGoogleConfigured, getAuthUrl, getTokensFromCode, decodeIdTokenEmail,
  signState, verifyState,
} from "../google";
import { importFromGoogleForUser } from "./helpers/google-sync";

export function registerGoogleRoutes(app: Express): void {
  // Initiate OAuth — must be authenticated so we can attach tokens to the right user.
  app.get("/api/auth/google", async (req: AuthedRequest, res) => {
    if (!isGoogleConfigured()) {
      return res.status(503).json({ message: "Connexion Google non configurée. Définissez GOOGLE_CLIENT_ID." });
    }
    if (!req.userId) {
      return res.redirect("/?error=not_authenticated#/login");
    }
    const state = signState({ userId: req.userId });
    const url = getAuthUrl(state);
    res.redirect(url!);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    if (!isGoogleConfigured()) return res.redirect("/?google=error&reason=not_configured#/app/settings");
    try {
      if (req.query.error) {
        return res.redirect("/?google=error&reason=" + encodeURIComponent(String(req.query.error)) + "#/app/settings");
      }
      const code = String(req.query.code || "");
      const stateRaw = String(req.query.state || "");
      const state = verifyState(stateRaw);
      if (!state || !state.userId) {
        return res.redirect("/?google=error&reason=invalid_state#/app/settings");
      }
      const tokens = await getTokensFromCode(code);
      if (!tokens) return res.redirect("/?google=error&reason=no_tokens#/app/settings");
      const email = decodeIdTokenEmail(tokens.id_token);
      await storage.updateUser(state.userId, {
        googleCalendarToken: JSON.stringify(tokens),
        googleCalendarEmail: email,
      });
      console.log("[google] tokens stored for user", state.userId, "email=", email);
      res.redirect("/?google=ok#/app/settings");
    } catch (e: any) {
      console.error("[google] callback error:", e?.message || e);
      res.redirect("/?google=error&reason=" + encodeURIComponent(e?.message || "unknown") + "#/app/settings");
    }
  });

  // Status: configured server-side + connected for current user.
  app.get("/api/google/status", async (req: AuthedRequest, res) => {
    const configured = isGoogleConfigured();
    let connected = false;
    let email: string | null = null;
    if (req.userId) {
      const u = await storage.getUserById(req.userId);
      connected = !!(u?.googleCalendarToken);
      email = u?.googleCalendarEmail || null;
    }
    res.json({ configured, connected, email });
  });

  // Disconnect: clear stored tokens for current user.
  app.post("/api/google/disconnect", requireAuth, async (req: AuthedRequest, res) => {
    await storage.updateUser(req.userId!, {
      googleCalendarToken: null,
      googleCalendarEmail: null,
    });
    res.json({ ok: true });
  });

  // ---------- Manual sync trigger (UI button) ----------
  app.post("/api/google/sync-import", requireAuth, async (req: AuthedRequest, res) => {
    if (!isGoogleConfigured()) return res.status(400).json({ message: "Google non configuré" });
    const u = await storage.getUserById(req.userId!);
    if (!u?.googleCalendarToken) return res.status(400).json({ message: "Compte Google non connecté" });
    const stats = await importFromGoogleForUser(req.userId!);
    res.json({ ok: true, ...stats });
  });
}
