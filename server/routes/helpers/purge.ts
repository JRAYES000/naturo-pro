/**
 * server/routes/helpers/purge.ts — purge des comptes gratuits inactifs (Lot 1, action 11)
 *
 * Découle de la décision 6 : on ne stocke pas indéfiniment des données de santé
 * sans revenu associé. Un compte SANS accès complet (ni abonné, ni essai en
 * cours) et sans connexion depuis 12 mois est supprimé avec toutes ses données
 * (même cascade que la suppression RGPD). La mention figure sur l'écran
 * d'inscription (Register.tsx) et dans la politique de confidentialité.
 */

import { storage } from "../../storage";
import { hasFullAccess } from "@shared/plan-access";

export const PURGE_INACTIVITY_MS = 365 * 24 * 60 * 60 * 1000; // 12 mois

/** Comptes jamais purgés, quoi qu'il arrive (démo + owner, cf. auth.ts). */
const PROTECTED_EMAILS = new Set(["marie@demo.fr", "jrayes000@gmail.com"]);

/**
 * Prédicat pur : ce compte est-il purgeable à l'instant `now` ?
 * Purgeable = pas d'accès complet + dernière activité (last_login_at, sinon
 * created_at) antérieure à 12 mois + email non protégé.
 */
export function isPurgeable(
  u: { plan: string | null; trialEndsAt: number | null; lastLoginAt: number | null; createdAt: number; email: string },
  now = Date.now(),
): boolean {
  if (PROTECTED_EMAILS.has(u.email.toLowerCase())) return false;
  if (hasFullAccess(u, now)) return false;
  const lastSeen = u.lastLoginAt ?? u.createdAt;
  return now - lastSeen >= PURGE_INACTIVITY_MS;
}

/** Exécute la purge. Retourne {purged, ids} — utilisé par le cron quotidien. */
export async function purgeInactiveFreeAccounts(now = Date.now()): Promise<{ purged: number; ids: number[] }> {
  const candidates = await storage.listPurgeCandidates(now - PURGE_INACTIVITY_MS);
  const ids: number[] = [];
  for (const u of candidates) {
    if (!isPurgeable(u as any, now)) continue;
    console.log(`[purge-inactifs] user=${u.id} email=${u.email} dernier accès=${new Date((u as any).lastLoginAt ?? u.createdAt).toISOString()}`);
    await storage.deleteUserCascade(u.id);
    ids.push(u.id);
  }
  return { purged: ids.length, ids };
}
