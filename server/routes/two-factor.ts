/**
 * server/routes/two-factor.ts — double authentification (lot 2c, parité naturooo).
 *
 * GET  /api/auth/2fa               état (activée, codes de secours restants)
 * POST /api/auth/2fa/setup         nouveau secret en attente → URI otpauth (QR côté client)
 * POST /api/auth/2fa/enable        { code } confirme le secret, renvoie les codes de secours
 * POST /api/auth/2fa/backup-codes  { code } régénère les codes de secours
 * POST /api/auth/2fa/disable       { password, code } désactive
 * POST /api/auth/2fa/verify        { challenge, code } seconde étape de la connexion
 *
 * La connexion par mot de passe (routes/auth.ts) ne crée pas de session pour un
 * compte protégé : elle renvoie un défi signé, échangé ici contre la session.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, verifyPassword, createSessionFor, setSessionCookie, type AuthedRequest } from "../auth";
import { sealToken, openToken } from "../einvoicing/token-crypto";
import {
  generateTotpSecret, verifyTotp, otpauthUri, formatSecret, generateBackupCodes, hashBackupCode,
  consumeBackupCode, verifyChallenge,
} from "../totp";
import { publicUser } from "./helpers/tokens";
import { twoFactorLimiter } from "./limiters";

const PURPOSE = "totp-secrets";

// Échecs par compte (en plus du limiteur par IP) : 5 essais par fenêtre de 15 min.
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<number, { count: number; since: number }>();

export function tooManyFailures(userId: number, now = Date.now()): boolean {
  const f = failures.get(userId);
  if (!f || now - f.since > FAILURE_WINDOW_MS) return false;
  return f.count >= MAX_FAILURES;
}
export function recordFailure(userId: number, now = Date.now()): void {
  const f = failures.get(userId);
  if (!f || now - f.since > FAILURE_WINDOW_MS) failures.set(userId, { count: 1, since: now });
  else f.count++;
}
export function clearFailures(userId: number): void {
  failures.delete(userId);
}

function backupHashes(u: any): string[] {
  try {
    const v = JSON.parse(u?.totpBackupCodes || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Vérifie un code d'application (6 chiffres) ou un code de secours d'un compte
 * protégé, et consigne l'usage (pas TOTP accepté, code de secours consommé).
 */
export async function checkSecondFactor(u: any, code: string, now = Date.now()): Promise<{ ok: boolean; usedBackup?: boolean }> {
  const clean = String(code || "").trim();
  if (/^\d{6}$/.test(clean.replace(/\s/g, ""))) {
    const secret = openToken(u.totpSecret, PURPOSE);
    if (!secret) return { ok: false };
    const counter = verifyTotp(secret, clean, now, u.totpLastCounter ?? null);
    if (counter == null) return { ok: false };
    await storage.updateUser(u.id, { totpLastCounter: counter } as any);
    return { ok: true };
  }
  const rest = consumeBackupCode(backupHashes(u), clean);
  if (!rest) return { ok: false };
  await storage.updateUser(u.id, { totpBackupCodes: JSON.stringify(rest) } as any);
  return { ok: true, usedBackup: true };
}

export function registerTwoFactorRoutes(app: Express): void {
  app.get("/api/auth/2fa", requireAuth, async (req: AuthedRequest, res) => {
    const u = await storage.getUserById(req.userId!);
    if (!u) return res.status(401).json({ message: "Non authentifié" });
    res.json({
      enabled: !!(u as any).totpEnabledAt,
      enabledAt: (u as any).totpEnabledAt ?? null,
      backupCodesLeft: (u as any).totpEnabledAt ? backupHashes(u).length : 0,
    });
  });

  app.post("/api/auth/2fa/setup", requireAuth, async (req: AuthedRequest, res) => {
    const u = await storage.getUserById(req.userId!);
    if (!u) return res.status(401).json({ message: "Non authentifié" });
    if ((u as any).totpEnabledAt) return res.status(409).json({ message: "La double authentification est déjà activée." });
    const secret = generateTotpSecret();
    await storage.updateUser(u.id, { totpSecret: sealToken(secret, PURPOSE), totpLastCounter: null } as any);
    res.json({ secret: formatSecret(secret), otpauthUri: otpauthUri({ secret, account: u.email }) });
  });

  app.post("/api/auth/2fa/enable", requireAuth, twoFactorLimiter, async (req: AuthedRequest, res) => {
    const parsed = z.object({ code: z.string().min(6).max(12) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Code à 6 chiffres attendu" });
    const u = await storage.getUserById(req.userId!);
    if (!u) return res.status(401).json({ message: "Non authentifié" });
    if ((u as any).totpEnabledAt) return res.status(409).json({ message: "La double authentification est déjà activée." });
    const secret = openToken((u as any).totpSecret, PURPOSE);
    if (!secret) return res.status(400).json({ message: "Recommencez l'activation : aucun secret en attente." });
    const counter = verifyTotp(secret, parsed.data.code);
    if (counter == null) return res.status(400).json({ message: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." });
    const codes = generateBackupCodes();
    await storage.updateUser(u.id, {
      totpEnabledAt: Date.now(), totpLastCounter: counter, totpBackupCodes: JSON.stringify(codes.map(hashBackupCode)),
    } as any);
    res.json({ ok: true, backupCodes: codes });
  });

  app.post("/api/auth/2fa/backup-codes", requireAuth, twoFactorLimiter, async (req: AuthedRequest, res) => {
    const parsed = z.object({ code: z.string().min(6).max(12) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Code à 6 chiffres attendu" });
    const u = await storage.getUserById(req.userId!);
    if (!u || !(u as any).totpEnabledAt) return res.status(409).json({ message: "La double authentification n'est pas activée." });
    if (!(await checkSecondFactor(u, parsed.data.code)).ok) return res.status(400).json({ message: "Code incorrect." });
    const codes = generateBackupCodes();
    await storage.updateUser(u.id, { totpBackupCodes: JSON.stringify(codes.map(hashBackupCode)) } as any);
    res.json({ ok: true, backupCodes: codes });
  });

  app.post("/api/auth/2fa/disable", requireAuth, twoFactorLimiter, async (req: AuthedRequest, res) => {
    const parsed = z.object({ password: z.string().min(1), code: z.string().min(6).max(12) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Mot de passe et code requis" });
    const u = await storage.getUserById(req.userId!);
    if (!u || !(u as any).totpEnabledAt) return res.status(409).json({ message: "La double authentification n'est pas activée." });
    if (!u.passwordHash || !verifyPassword(parsed.data.password, u.passwordHash)) return res.status(403).json({ message: "Mot de passe incorrect" });
    if (!(await checkSecondFactor(u, parsed.data.code)).ok) return res.status(400).json({ message: "Code incorrect." });
    await storage.updateUser(u.id, { totpSecret: null, totpEnabledAt: null, totpLastCounter: null, totpBackupCodes: null } as any);
    res.json({ ok: true });
  });

  // Seconde étape de la connexion : défi signé (10 min) + code → session.
  app.post("/api/auth/2fa/verify", twoFactorLimiter, async (req, res) => {
    const parsed = z.object({ challenge: z.string().min(10).max(500), code: z.string().min(6).max(12) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Code requis" });
    const userId = verifyChallenge(parsed.data.challenge);
    if (!userId) return res.status(401).json({ message: "Délai dépassé : reconnectez-vous avec votre mot de passe." });
    if (tooManyFailures(userId)) return res.status(429).json({ message: "Trop d'essais. Réessayez dans quelques minutes." });
    const u = await storage.getUserById(userId);
    if (!u || !(u as any).totpEnabledAt) return res.status(401).json({ message: "Reconnectez-vous avec votre mot de passe." });
    const r = await checkSecondFactor(u, parsed.data.code);
    if (!r.ok) {
      recordFailure(userId);
      return res.status(401).json({ message: "Code incorrect." });
    }
    clearFailures(userId);
    await storage.updateUser(u.id, { lastLoginAt: Date.now() } as any);
    const token = await createSessionFor(u.id);
    setSessionCookie(res, token);
    const fresh = await storage.getUserById(u.id);
    res.json({ user: publicUser(fresh), token, usedBackupCode: !!r.usedBackup, backupCodesLeft: backupHashes(fresh).length });
  });
}
