/**
 * client/src/lib/solutions-filter.ts — filtre de la bibliothèque de référence
 *
 * Recherche insensible aux accents et à la casse (« melisse » trouve « Mélisse »),
 * catégorie et profil cumulables, indépendants du texte tapé.
 * Profil = critères de précaution (grossesse, anticoagulants…) : les fiches
 * contre-indiquées pour l'un d'eux sont masquées, les fiches « prudence » restent.
 * Partagé par la page Bibliothèque et le picker des programmes.
 */

import { normalizeText, parseSafety, type SafetyKey } from "@shared/solutions";

export { normalizeText };

export interface SearchableSolution {
  name: string;
  category: string;
  properties?: string | null;
  contraindications?: string | null;
  usageNotes?: string | null;
  form?: string | null;
  safety?: string | null;
}

export interface SolutionFilter {
  search?: string;
  category?: string; // "all" ou une catégorie
  profile?: readonly SafetyKey[];
}

export function matchesSolution(s: SearchableSolution, f: SolutionFilter): boolean {
  if (f.category && f.category !== "all" && s.category !== f.category) return false;
  if (f.profile?.length) {
    const safety = parseSafety(s.safety);
    if (f.profile.some((k) => safety[k] === "ci")) return false;
  }
  const q = normalizeText(f.search);
  if (!q) return true;
  const haystack = normalizeText([s.name, s.category, s.properties, s.contraindications, s.usageNotes, s.form].join(" "));
  // Chaque mot tapé doit apparaître (« sommeil enfant » = les deux).
  return q.split(" ").every((w) => haystack.includes(w));
}

export function filterSolutions<T extends SearchableSolution>(list: T[], f: SolutionFilter): T[] {
  return list.filter((s) => matchesSolution(s, f));
}

export function countByCategory(list: SearchableSolution[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of list) out[s.category] = (out[s.category] || 0) + 1;
  return out;
}
