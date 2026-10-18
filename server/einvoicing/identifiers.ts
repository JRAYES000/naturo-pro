// ─────────────────────────────────────────────────────────────────────────────
// Identifiants d'entreprise français : SIREN, SIRET, numéro de TVA.
// Fonctions pures, partagées par la facturation, les fiches clientes et les
// réglages de la praticienne.
// ─────────────────────────────────────────────────────────────────────────────

/** Garde les chiffres seulement (les espaces et points de saisie sont tolérés). */
export function digitsOnly(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

/** Clé de Luhn — contrôle des SIREN (9 chiffres) et SIRET (14 chiffres). */
export function luhnValid(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let n = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

const LA_POSTE_SIREN = "356000000";

export function isValidSiren(s: string | null | undefined): boolean {
  const d = digitsOnly(s);
  return d.length === 9 && luhnValid(d);
}

export function isValidSiret(s: string | null | undefined): boolean {
  const d = digitsOnly(s);
  if (d.length !== 14) return false;
  // Les établissements de La Poste dérogent à Luhn : somme des chiffres multiple de 5.
  if (d.startsWith(LA_POSTE_SIREN)) return d.split("").reduce((a, c) => a + Number(c), 0) % 5 === 0;
  return luhnValid(d);
}

/** SIREN déduit d'un SIREN ou d'un SIRET saisi ; null si la saisie n'est ni l'un ni l'autre. */
export function sirenFrom(s: string | null | undefined): string | null {
  const d = digitsOnly(s);
  if (d.length === 9 || d.length === 14) return d.slice(0, 9);
  return null;
}

/** SIRET si la saisie en est un (14 chiffres), sinon null. */
export function siretFrom(s: string | null | undefined): string | null {
  const d = digitsOnly(s);
  return d.length === 14 ? d : null;
}

/** Numéro de TVA français d'un SIREN : FR + clé sur 2 chiffres + SIREN. */
export function frenchVatNumber(siren: string): string {
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

/** Numéro de TVA normalisé (majuscules, sans espaces ni points) ; null si vide. */
export function normalizeVatNumber(s: string | null | undefined): string | null {
  const v = (s || "").replace(/[\s.-]/g, "").toUpperCase();
  return v || null;
}

/**
 * Contrôle d'un numéro de TVA intracommunautaire. Pour la France, la clé doit
 * correspondre au SIREN ; pour les autres pays, seul le format est vérifié.
 */
export function isValidVatNumber(s: string | null | undefined): boolean {
  const v = normalizeVatNumber(s);
  if (!v) return false;
  if (v.startsWith("FR")) {
    const m = /^FR([0-9A-Z]{2})(\d{9})$/.exec(v);
    if (!m) return false;
    // Clés alphanumériques (anciens numéros) : format seulement.
    if (!/^\d{2}$/.test(m[1])) return true;
    return frenchVatNumber(m[2]) === v;
  }
  return /^[A-Z]{2}[0-9A-Z+*.]{2,13}$/.test(v);
}

/** SIREN formaté pour l'affichage : « 123 456 789 ». */
export function formatSiren(s: string | null | undefined): string {
  const d = digitsOnly(s);
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 14) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return s || "";
}

const COUNTRY_CODES: Record<string, string> = {
  france: "FR", belgique: "BE", suisse: "CH", luxembourg: "LU", monaco: "MC",
  canada: "CA", allemagne: "DE", espagne: "ES", italie: "IT", portugal: "PT",
  "pays-bas": "NL", "royaume-uni": "GB",
};

/** Code pays ISO 3166-1 à partir du libellé saisi (France par défaut). */
export function countryCode(label: string | null | undefined): string {
  const l = (label || "").trim().toLowerCase();
  if (!l) return "FR";
  if (COUNTRY_CODES[l]) return COUNTRY_CODES[l];
  return /^[a-z]{2}$/.test(l) ? l.toUpperCase() : "FR";
}
