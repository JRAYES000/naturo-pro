import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export interface AuthedRequest extends Request {
  userId?: number;
  // Phase 3 Lot 2 — sous-domaines personnels
  tenantUserId?: number;
  tenantSlug?: string;
  tenantNotFound?: boolean;
}

/**
 * Cookie name strategy
 *
 * pplx.app sandbox (preview):
 *   The reverse-proxy enforces __Host- cookies, so NODE_ENV=production AND
 *   no COOKIE_NAME override → we keep __Host-naturo_session to stay compatible
 *   with the existing preview deployment.
 *
 * Hostinger production (app.ecole-naturo.fr):
 *   Set  COOKIE_NAME=naturo_sid  in .env (no __Host- prefix needed).
 *   __Host- requires the cookie to have no Domain attribute, which is fine,
 *   but Hostinger's proxy may not strip it; the plain name is simpler and more
 *   portable.
 *
 * Default resolution order:
 *   1. COOKIE_NAME env var  (explicit override — recommended for Hostinger)
 *   2. __Host-naturo_session when NODE_ENV=production (pplx.app compat)
 *   3. naturo_session in dev
 */
export const SESSION_COOKIE: string =
  process.env.COOKIE_NAME ??
  (process.env.NODE_ENV === "production" ? "__Host-naturo_session" : "naturo_session");

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function hashPassword(plain: string) {
  return bcrypt.hashSync(plain, 10);
}
export function verifyPassword(plain: string, hash: string) {
  try { return bcrypt.compareSync(plain, hash); } catch { return false; }
}
export function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSessionFor(userId: number) {
  const token = newToken();
  await storage.createSession(userId, token, Date.now() + SESSION_TTL_MS);
  return token;
}

function readToken(req: Request): string | null {
  const cookieToken = (req as AuthedRequest).cookies?.[SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next();
  const session = await storage.getSessionByToken(token);
  if (!session) return next();
  if (session.expiresAt < Date.now()) {
    await storage.deleteSession(token);
    return next();
  }
  req.userId = session.userId;
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ message: "Non authentifié" });
  next();
}

// Phase 3 Lot 4 — admin guard
function adminEmailsList(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return ["jrayes000@gmail.com"];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmailsList().includes(email.toLowerCase());
}

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ message: "Non authentifié" });
  const user = await storage.getUserById(req.userId);
  if (!user || !isAdminEmail(user.email)) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  next();
}

export function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  const cookieName = SESSION_COOKIE;

  // __Host- prefix requires: Secure=true, Path=/, no Domain attribute.
  // Plain names work with or without Domain.
  const hasHostPrefix = cookieName.startsWith("__Host-");

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd || hasHostPrefix, // always secure when __Host- prefix is used
    maxAge: SESSION_TTL_MS,
    path: "/",
    // Do NOT set domain when using __Host- prefix (browser will reject the cookie)
    ...(hasHostPrefix ? {} : { domain: undefined }),
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
