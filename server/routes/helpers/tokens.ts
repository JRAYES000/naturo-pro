/**
 * server/routes/helpers/tokens.ts
 *
 * Petits helpers transverses : génération de token, slug public, projection
 * "publique" d'un utilisateur (retire les secrets avant envoi au frontend).
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 */

import { randomBytes } from "node:crypto";

export function genToken(): string {
  return randomBytes(24).toString("hex");
}

export function slugify(s: string) {
  // Marques diacritiques combinantes (U+0300–U+036F) produites par la décomposition NFD.
  // Équivalent à \p{Diacritic} mais sans le flag `u` (qui exige un target ≥ ES2015).
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "naturo";
}

export function publicUser(u: any) {
  if (!u) return null;
  const {
    passwordHash, googleCalendarToken, googleId, resendApiKey,
    emailVerifyToken, emailVerifyExpiresAt,
    passwordResetToken, passwordResetExpiresAt,
    ...rest
  } = u;
  // Indique au frontend si une clé Resend est configurée (sans la révéler).
  // Ajoute les infos de trial / onboarding pour la bannière et les guards UI.
  let daysUntilTrialEnds: number | null = null;
  if (rest.plan === "trial" && rest.trialEndsAt) {
    const ms = rest.trialEndsAt - Date.now();
    daysUntilTrialEnds = ms <= 0 ? 0 : Math.ceil(ms / (1000 * 60 * 60 * 24));
  }
  return {
    ...rest,
    hasResendApiKey: !!resendApiKey,
    emailVerified: !!rest.emailVerifiedAt,
    onboardingCompleted: !!rest.onboardingCompletedAt,
    daysUntilTrialEnds,
  };
}
