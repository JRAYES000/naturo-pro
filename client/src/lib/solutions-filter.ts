/**
 * client/src/lib/solutions-filter.ts — filtre de la bibliothèque de référence
 *
 * Recherche insensible aux accents et à la casse (« melisse » trouve « Mélisse »),
 * catégorie et précaution cumulables, indépendantes du texte tapé.
 * Partagé par la page Bibliothèque et le picker des programmes.
 */

export interface SearchableSolution {
  name: string;
  category: string;
  properties?: string | null;
  contraindications?: string | null;
  usageNotes?: string | null;
}

export function normalizeText(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface SolutionFilter {
  search?: string;
  category?: string; // "all" ou une catégorie
  precaution?: string | null; // mot cherché dans les précautions seulement
}

export function matchesSolution(s: SearchableSolution, f: SolutionFilter): boolean {
  if (f.category && f.category !== "all" && s.category !== f.category) return false;
  if (f.precaution && !normalizeText(s.contraindications).includes(normalizeText(f.precaution))) return false;
  const q = normalizeText(f.search);
  if (!q) return true;
  const haystack = normalizeText([s.name, s.category, s.properties, s.contraindications, s.usageNotes].join(" "));
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
