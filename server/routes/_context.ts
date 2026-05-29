/**
 * server/routes/_context.ts — SQUELETTE (Phase 4.0 split par domaine)
 *
 * Définit le "contexte" partagé injecté à chaque module de routes :
 * les rate limiters + la config dérivée de l'environnement.
 *
 * ⚠️ Pas encore consommé pendant l'étape 0 : server/routes.ts conserve ses
 * limiters inline (comportement strictement identique). Ce module sera adopté
 * au fur et à mesure de la migration des domaines, qui appelleront
 * register<Domaine>(app, ctx).
 */

import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

export interface RouteContext {
  authLimiter: RequestHandler;
  bookingLimiter: RequestHandler;
  apiLimiter: RequestHandler;
  publicLimiter: RequestHandler;
  adminLimiter: RequestHandler;
  BASE_DOMAIN: string;
  APP_URL: string;
  TZ: string;
}

export function createContext(): RouteContext {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de tentatives, réessayez dans quelques minutes." },
  });
  const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de réservations depuis cette adresse." },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de requêtes, ralentissez un peu." },
    skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
  });
  const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de requêtes publiques." },
  });
  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop de requêtes admin." },
  });

  return {
    authLimiter,
    bookingLimiter,
    apiLimiter,
    publicLimiter,
    adminLimiter,
    BASE_DOMAIN: (process.env.BASE_DOMAIN || "app.ecole-naturo.fr").toLowerCase(),
    APP_URL: process.env.APP_URL || "https://app.ecole-naturo.fr",
    TZ: "Europe/Bucharest",
  };
}
