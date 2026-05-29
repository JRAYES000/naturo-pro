/**
 * server/routes/limiters.ts — rate limiters partagés (Phase 4.0)
 *
 * Source unique des limiters express-rate-limit, jusqu'ici définis inline dans
 * server/routes.ts. Exportés comme singletons module-level : une seule instance
 * par limiter, partagée entre routes.ts (app.use + routes auth) et le contexte
 * (_context.ts → createContext). Options/seuils/messages STRICTEMENT identiques à
 * l'ancienne définition inline → comportement runtime inchangé.
 */

import rateLimit from "express-rate-limit";

// Rate limiter for auth + public booking — protects against brute force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives, réessayez dans quelques minutes." },
});
export const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de réservations depuis cette adresse." },
});

// ── Phase 3 Lot 5 — Rate limiting global renforcé ────────────────────────
// apiLimiter : limite générale pour endpoints API authentifiés (anti-abus).
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,            // 200 req/min/IP — confortable pour un user actif
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes, ralentissez un peu." },
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
});
// publicLimiter : protection des endpoints publics contre l'énumération de slugs.
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes publiques." },
});
// adminLimiter : strict, protection en profondeur.
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes admin." },
});
