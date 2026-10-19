/**
 * server/naturobot.ts — fonctions pures de la discussion Naturobot (sources, avis,
 * extraits de recherche). Aucune dépendance Express/DB : testées unitairement.
 */

export const NATUROBOT_FEEDBACK_EVENT = "naturobot_feedback";

export type FeedbackValue = 1 | -1 | 0;
export interface ChatSource { title: string; excerpt: string }

/**
 * Sources affichées sous une réponse : un document par entrée, avec le passage
 * réellement transmis au modèle (le premier extrait retenu pour ce document).
 */
export function buildSources(
  retrieved: Array<{ content: string; documentId: number }>,
  docs: Array<{ id: number; title: string }>,
  maxExcerpt = 400,
): ChatSource[] {
  const out: ChatSource[] = [];
  const seen = new Set<number>();
  for (const r of retrieved) {
    if (seen.has(r.documentId)) continue;
    const doc = docs.find((d) => d.id === r.documentId);
    if (!doc) continue;
    seen.add(r.documentId);
    const text = r.content.replace(/\s+/g, " ").trim();
    out.push({ title: doc.title, excerpt: text.length > maxExcerpt ? `${text.slice(0, maxExcerpt).trimEnd()}…` : text });
  }
  return out;
}

/** Dernier avis connu par message (1, -1) ; un avis 0 annule le précédent. */
export function feedbackByMessage(events: Array<{ metadata: string | null }>): Record<number, 1 | -1> {
  const map: Record<number, 1 | -1> = {};
  for (const e of events) {
    let m: any;
    try { m = e.metadata ? JSON.parse(e.metadata) : null; } catch { continue; }
    const id = Number(m?.messageId);
    if (!Number.isInteger(id)) continue;
    if (m.value === 1 || m.value === -1) map[id] = m.value;
    else delete map[id];
  }
  return map;
}

/** Extrait centré sur la première occurrence de `q` (insensible à la casse). */
export function searchSnippet(content: string, q: string, radius = 60): string {
  const text = content.replace(/\s+/g, " ").trim();
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return text.length > radius * 2 ? `${text.slice(0, radius * 2).trimEnd()}…` : text;
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + q.trim().length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
