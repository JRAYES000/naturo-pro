/**
 * server/solutions-enrich.ts — champs structurés du catalogue de base
 *
 * Précautions structurées, forme, durée de cure et synergies des fiches globales,
 * déduites de leur texte (balisage semi-automatique) puis corrigées à la main
 * là où la déduction se trompait (SAFETY_OVERRIDES, relu fiche par fiche le
 * 2026-10-19). Le seed les recalcule à chaque démarrage et met à jour les fiches
 * globales qui diffèrent : le code fait foi pour le catalogue de base.
 */

import { deriveSafety, serializeSafety, serializeList, solutionsMentioned, type Safety } from "@shared/solutions";

/**
 * Corrections du balisage automatique (remplacent entièrement la déduction).
 * Motif de chaque correction en commentaire.
 */
export const SAFETY_OVERRIDES: Record<string, Safety> = {
  // « dépression sévère » n'est pas un traitement ; « avec sédatifs sans avis » = prudence.
  "Passiflore": { grossesse: "ci", sedatif: "prudence" },
  // « interactions graves » : à éviter avec ces traitements.
  "Millepertuis": { grossesse: "ci", allaitement: "ci", antidepresseur: "ci", hormonal: "ci", anticoagulant: "ci" },
  // Liste de contre-indications sans verbe : hypertension et épilepsie exclues, grossesse seulement en formes concentrées.
  "Romarin": { grossesse: "prudence", epilepsie: "ci", cardio: "ci" },
  // « Ne pas dépasser… (70 µg/j enceinte) » = dose plafond, pas une exclusion.
  "Sélénium": { grossesse: "prudence" },
  // Amiodarone citée : traitement cardiaque.
  "Iode": { thyroide: "prudence", grossesse: "prudence", cardio: "prudence" },
  // Sédation additive avec somnifères ; allaitement non cité mais même logique que la grossesse.
  "Mélatonine": { grossesse: "ci", allaitement: "prudence", enfant: "ci", epilepsie: "ci", sedatif: "prudence" },
  // La liste « enfants < 6 ans, asthmatiques/épileptiques » prolonge les contre-indications.
  "Cyprès toujours vert (HE)": { grossesse: "ci", allaitement: "ci", hormonal: "ci", enfant: "ci", epilepsie: "ci" },
  // Seule l'hypertension « non contrôlée » est exclue : prudence sous traitement.
  "Cassis (bourgeon)": { grossesse: "prudence", allaitement: "prudence", enfant: "prudence", cardio: "prudence" },
  // Une cliente sous lithium (Téralithe, rangé avec les antidépresseurs) doit voir l'alerte.
  "Lithium (oligothérapie)": { antidepresseur: "prudence" },
};

const FIXED_FORMS: Record<string, string> = {
  "Fleur de Bach": "Élixir floral (gouttes)",
  "Bourgeon": "Macérat de bourgeons (gouttes)",
  "Hydrolat": "Hydrolat (voie orale diluée ou externe)",
  "Oligo-élément": "Ampoule ou granules sublinguaux",
};

const FORM_PATTERNS: Array<[RegExp, string]> = [
  [/infusion|tisane/i, "infusion"],
  [/d[ée]coction/i, "décoction"],
  [/extrait/i, "extrait"],
  [/teinture/i, "teinture mère"],
  [/g[ée]lule/i, "gélule"],
  [/comprim[ée]/i, "comprimé"],
  [/poudre/i, "poudre"],
  [/frais|r[âa]p[ée]/i, "frais"],
  [/sirop/i, "sirop"],
];

const HE_PATTERNS: Array<[RegExp, string]> = [
  [/diffusion/i, "diffusion"],
  [/dilu|massage|friction|local|cutan|application|sur les tempes|sur le thorax/i, "voie cutanée diluée"],
  [/comprim[ée] neutre|voie orale|usage (?:interne|oral)|miel|interne/i, "voie orale (sur avis)"],
  [/inhalation/i, "inhalation"],
];

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function deriveForm(category: string, usageNotes: string | null | undefined): string | null {
  if (FIXED_FORMS[category]) return FIXED_FORMS[category];
  const text = usageNotes || "";
  const patterns = category === "Huile essentielle" ? HE_PATTERNS : FORM_PATTERNS;
  const found = patterns.filter(([re]) => re.test(text)).map(([, label]) => label);
  if (category === "Huile essentielle") return found.length ? `Huile essentielle : ${found.join(", ")}` : "Huile essentielle";
  // « comprimé neutre » est un support d'HE, pas une forme de plante.
  return found.length ? capitalize(Array.from(new Set(found)).join(", ")) : null;
}

const CURE_RE = /cures? (?:courte|de \d+(?: à \d+)? (?:jours?|semaines?|mois|cycles?)(?: maximum)?)|(?:cure|pendant|sur) \d+(?: à \d+)? (?:jours?|semaines?|mois)/i;

export function deriveCureDuration(usageNotes: string | null | undefined): string | null {
  const m = CURE_RE.exec(usageNotes || "");
  return m ? capitalize(m[0].trim()) : null;
}

interface BaseFiche {
  name: string;
  category: string;
  properties: string | null;
  contraindications: string | null;
  usageNotes: string | null;
}

/** Autres fiches de la même catégorie citées dans les propriétés ou l'usage. */
export function deriveSynergies(fiche: BaseFiche, all: BaseFiche[]): string[] {
  const others = all.filter((s) => s.name !== fiche.name && s.category === fiche.category);
  return solutionsMentioned([fiche.properties || "", fiche.usageNotes || ""], others).map((s) => s.name);
}

export interface EnrichedFields {
  safety: string | null;
  form: string | null;
  cureDuration: string | null;
  synergies: string | null;
}

export function enrichFiche(fiche: BaseFiche, all: BaseFiche[]): EnrichedFields {
  const safety = SAFETY_OVERRIDES[fiche.name] ?? deriveSafety(fiche.contraindications);
  return {
    safety: serializeSafety(safety),
    form: deriveForm(fiche.category, fiche.usageNotes),
    cureDuration: deriveCureDuration(fiche.usageNotes),
    synergies: serializeList(deriveSynergies(fiche, all)),
  };
}
