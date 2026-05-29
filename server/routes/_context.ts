/**
 * server/routes/_context.ts — contexte partagé injecté aux modules de routes (Phase 4.0)
 *
 * Bundle les rate limiters (singletons de ./limiters) + la config dérivée de
 * l'environnement, passé à register<Domaine>(app, ctx) pour les domaines qui en
 * ont besoin (public/booking/manage → bookingLimiter + APP_URL ; auth → authLimiter
 * à l'étape 13). Les limiters NE sont PAS redéfinis ici : on réexpose les mêmes
 * instances que celles utilisées dans routes.ts (app.use) → comportement identique.
 */

import type { RequestHandler } from "express";
import {
  authLimiter, bookingLimiter, apiLimiter, publicLimiter, adminLimiter,
} from "./limiters";

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
