/**
 * server/analytics.ts — analytics de conversion (Lot 1, action 9)
 *
 * 5 événements posés AVANT l'ouverture du 1er septembre, pour savoir ce qui a
 * converti : signup · paid_feature_blocked · subscribe_click ·
 * subscription_started · subscription_canceled.
 *
 * Enregistrement best-effort : un échec d'insert ne doit jamais casser la
 * requête métier qui l'a déclenché.
 */

import { storage } from "./storage";

export const ANALYTICS_EVENTS = [
  "signup",
  "paid_feature_blocked",
  "subscribe_click",
  "subscription_started",
  "subscription_canceled",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export function recordEvent(userId: number, event: AnalyticsEventName, metadata?: Record<string, unknown>): void {
  storage.createAnalyticsEvent(userId, event, metadata).catch((e: any) => {
    console.error("[analytics]", event, e?.message || e);
  });
}
