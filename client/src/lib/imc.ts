/**
 * client/src/lib/imc.ts — calculs de morphologie (Lot 4, action P10)
 *
 * IMC = poids (kg) / taille (m)² — interprétation OMS adulte.
 * Poids idéal : formule de Creff (morphotype « normal ») = ((taille_cm − 100) + âge/10) × 0,9.
 */

export function computeImc(heightCm: number, weightKg: number): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function imcLabel(imc: number): string {
  if (imc < 18.5) return "Maigreur";
  if (imc < 25) return "Corpulence normale";
  if (imc < 30) return "Surpoids";
  if (imc < 35) return "Obésité modérée";
  return "Obésité sévère";
}

/** Âge en années révolues depuis une date "YYYY-MM-DD" ; null si invalide. */
export function ageFromDateOfBirth(dateOfBirth: string | null | undefined, now = Date.now()): number | null {
  if (!dateOfBirth) return null;
  const ts = new Date(dateOfBirth).getTime();
  if (!Number.isFinite(ts)) return null;
  const age = Math.floor((now - ts) / 3.15576e10);
  return age > 0 && age < 120 ? age : null;
}

/** Poids idéal de Creff (morphotype normal), arrondi à 0,1 kg ; null sans taille ou âge. */
export function poidsIdealCreff(heightCm: number, ageYears: number): number | null {
  if (!heightCm || heightCm <= 100 || !ageYears || ageYears <= 0) return null;
  return Math.round(((heightCm - 100) + ageYears / 10) * 0.9 * 10) / 10;
}
