/**
 * Logique pure de la page publique, partagée par l'éditeur (PublicPageEditor),
 * son aperçu et la page publique elle-même. Sans dépendance React : testée
 * dans public-page.test.ts.
 */

export const DEFAULT_PRIMARY = "#186749";
export const DEFAULT_ACCENT = "#17EC9B";

/** Palettes proposées en un clic, toutes lisibles en texte blanc sur la couleur principale. */
export const COLOR_PRESETS: Array<{ name: string; primary: string; accent: string }> = [
  { name: "Forêt", primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT },
  { name: "Sauge", primary: "#3f6b4e", accent: "#a3c9a8" },
  { name: "Océan", primary: "#1d5a6e", accent: "#5ec4d6" },
  { name: "Lavande", primary: "#5b3f8c", accent: "#c4b5fd" },
  { name: "Terracotta", primary: "#9c4221", accent: "#f4a261" },
  { name: "Prune", primary: "#7a2e4f", accent: "#f0a6ca" },
];

/** Parse défensif des spécialités stockées (JSON array en DB). Ne plante jamais. */
export function parseSpecialties(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Validation de format du slug (la disponibilité est vérifiée par le serveur, 409). */
export function slugError(slug: string): string | null {
  if (!slug) return "L'adresse ne peut pas être vide.";
  if (slug.length < 3) return "Au moins 3 caractères.";
  if (!/^[a-z0-9-]+$/.test(slug)) return "Lettres minuscules, chiffres et tirets uniquement.";
  if (/^-|-$/.test(slug)) return "Ne doit pas commencer ni finir par un tiret.";
  return null;
}

/** Transforme un nom en slug valide (accents retirés, espaces en tirets). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const BIO_RECOMMENDED = 300;

export type CompletenessField = "name" | "photoUrl" | "bio" | "city" | "phone" | "specialties";

/** Complétude du profil public : champs qui valorisent la page, dans l'ordre du formulaire. */
export function completeness(draft: any): {
  pct: number;
  missing: Array<{ field: CompletenessField; label: string }>;
} {
  const checks: Array<[boolean, CompletenessField, string]> = [
    [!!draft.name?.trim(), "name", "Nom"],
    [!!draft.photoUrl?.trim(), "photoUrl", "Photo"],
    [(draft.bio?.trim().length || 0) >= BIO_RECOMMENDED, "bio", `Bio (${BIO_RECOMMENDED} caractères)`],
    [!!draft.city?.trim(), "city", "Ville"],
    [!!draft.phone?.trim(), "phone", "Téléphone"],
    [(draft.specialties?.length || 0) > 0, "specialties", "Spécialités"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return {
    pct: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, field, label]) => ({ field, label })),
  };
}

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function validUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Lien cliquable à partir de la saisie libre de la praticienne :
 * « @pseudo », « pseudo », « instagram.com/pseudo » ou une URL complète.
 * Renvoie null si la saisie est vide ou inexploitable.
 */
export function socialHref(kind: "instagram" | "facebook" | "website", raw: string | null | undefined): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  if (kind === "website") return validUrl(withProtocol(value));
  const host = kind === "instagram" ? "instagram.com" : "facebook.com";
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*(instagram\.com|facebook\.com|fb\.com)\//i.test(value)) {
    return validUrl(withProtocol(value));
  }
  const handle = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]+$/.test(handle)) return null;
  return `https://www.${host}/${handle}`;
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Rapport de contraste WCAG entre deux couleurs hexadécimales (1 à 21), null si invalide. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Le texte blanc des boutons reste lisible sur la couleur principale (WCAG AA, texte gras). */
export function primaryIsReadable(primary: string): boolean {
  const r = contrastRatio(primary, "#ffffff");
  return r === null || r >= 3;
}
