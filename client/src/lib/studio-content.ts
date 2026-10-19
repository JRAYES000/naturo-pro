// Logique pure du Studio contenu (filtres de la bibliothèque, compteurs, limites de longueur).

export type StudioChannel = "instagram" | "facebook";
export type StudioStatus = "brouillon" | "a_publier" | "publie";

export interface StudioPostLike {
  channel: string;
  format: string;
  status: string;
  title: string;
  body: string;
  theme: string | null;
}

export interface StudioPostFilter {
  status?: string; // "all" ou un statut
  channel?: string; // "all" ou un canal
  query?: string;
}

// Limite officielle d'une légende de publication.
export const CAPTION_LIMITS: Record<StudioChannel, number> = { instagram: 2200, facebook: 63206 };

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function filterContentPosts<T extends StudioPostLike>(posts: T[], f: StudioPostFilter): T[] {
  const words = normalizeText(f.query).split(" ").filter(Boolean);
  return posts.filter((p) => {
    if (f.status && f.status !== "all" && p.status !== f.status) return false;
    if (f.channel && f.channel !== "all" && p.channel !== f.channel) return false;
    if (!words.length) return true;
    const hay = normalizeText(`${p.title} ${p.theme ?? ""} ${p.body}`);
    return words.every((w) => hay.includes(w));
  });
}

export function countByStatus(posts: { status: string }[]): Record<"all" | StudioStatus, number> {
  const c = { all: posts.length, brouillon: 0, a_publier: 0, publie: 0 };
  for (const p of posts) if (p.status in c && p.status !== "all") c[p.status as StudioStatus]++;
  return c;
}

export function captionLength(text: string, channel: StudioChannel): { count: number; limit: number; over: boolean } {
  const count = Array.from(text).length;
  const limit = CAPTION_LIMITS[channel];
  return { count, limit, over: count > limit };
}

export function countHashtags(text: string): number {
  return (text.match(new RegExp("(^|\\s)#[\\p{L}\\p{N}_]+", "gu")) ?? []).length;
}

export function slugify(s: string, fallback = "contenu"): string {
  return normalizeText(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || fallback;
}

export function pickRandom<T>(items: T[], exclude?: T, rand: () => number = Math.random): T | undefined {
  const pool = items.length > 1 && exclude !== undefined ? items.filter((i) => i !== exclude) : items;
  return pool.length ? pool[Math.floor(rand() * pool.length)] : undefined;
}

// ── Calendrier éditorial (date de publication prévue ou réelle = publishedAt) ──

const pad = (n: number) => String(n).padStart(2, "0");

/** Clé de jour locale « AAAA-MM-JJ ». */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Valeur d'un <input type="date"> à partir d'un timestamp (vide si absent). */
export function toDateInputValue(ms: number | null | undefined): string {
  return ms ? dayKey(new Date(ms)) : "";
}

/** Timestamp à midi heure locale (évite les bascules de jour liées au fuseau). */
export function fromDateInputValue(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
}

/** Semaines (lundi → dimanche) couvrant le mois donné (month : 0-11). */
export function buildMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const start = new Date(year, month, 1 - offset);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) week.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
    if (w > 0 && week[0].getMonth() !== month) break;
    weeks.push(week);
  }
  return weeks;
}

/** Regroupe les contenus datés par jour ; les autres vont dans `undated`. */
export function groupPostsByDay<T extends { publishedAt: number | null }>(posts: T[]): { byDay: Map<string, T[]>; undated: T[] } {
  const byDay = new Map<string, T[]>();
  const undated: T[] = [];
  for (const p of posts) {
    if (!p.publishedAt) { undated.push(p); continue; }
    const k = dayKey(new Date(p.publishedAt));
    const list = byDay.get(k);
    if (list) list.push(p); else byDay.set(k, [p]);
  }
  return { byDay, undated };
}
