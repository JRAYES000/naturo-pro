/**
 * server/portal.ts — espace cliente (lot 3a, parité naturooo) : fonctions pures.
 *
 *   - jetons : la cliente se connecte par un lien reçu par email (usage unique),
 *     échangé contre une session de 30 jours ; seule l'empreinte SHA-256 est stockée ;
 *   - programme par étapes : chaque section peut durer N jours à partir de la date
 *     de début, l'espace affiche l'étape du jour ;
 *   - observance : relevé quotidien (oui / en partie / non, énergie 1-5) ;
 *   - bilans notés : questions « échelle » (1 à 10) ramenées à un score 0-100,
 *     interprété par des paliers définis dans le modèle.
 */
import crypto from "node:crypto";

export const PORTAL_SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
/** Lien demandé par la cliente depuis l'écran de connexion. */
export const PORTAL_LINK_TTL_MS = 30 * 60 * 1000;
/** Lien envoyé par la praticienne (invitation). */
export const PORTAL_INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
export const PORTAL_COOKIE = "naturo_portal";

export function newPortalToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashPortalToken(token: string): string {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

// ── Dates civiles « AAAA-MM-JJ » ─────────────────────────────────────────────
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Programme par étapes ─────────────────────────────────────────────────────
export type ProgramSection = { section: string; items: string[]; durationDays?: number | null };
export interface ProgramStage extends ProgramSection {
  index: number;
  /** Bornes incluses ; null pour une section sans durée (conseils valables tout du long). */
  start: string | null;
  end: string | null;
}

export function programStages(content: ProgramSection[], startDate: string | null | undefined): ProgramStage[] {
  let cursor = startDate && DAY_RE.test(startDate) ? startDate : null;
  return content.map((s, index) => {
    const dur = s.durationDays && s.durationDays > 0 ? Math.floor(s.durationDays) : null;
    if (!cursor || !dur) return { ...s, index, start: null, end: null };
    const start = cursor;
    const end = addDays(cursor, dur - 1);
    cursor = addDays(cursor, dur);
    return { ...s, index, start, end };
  });
}

/** Étape datée en cours aujourd'hui, ou null (programme pas commencé, terminé ou non daté). */
export function currentStage(stages: ProgramStage[], today: string): ProgramStage | null {
  return stages.find((s) => s.start && s.end && s.start <= today && today <= s.end) ?? null;
}

// ── Observance ───────────────────────────────────────────────────────────────
export type CheckinLike = { day: string; adherence: number; energy?: number | null };

export function adherenceStats(checkins: CheckinLike[], today: string, windowDays = 14) {
  const from = addDays(today, -(windowDays - 1));
  const recent = checkins.filter((c) => c.day >= from && c.day <= today);
  const rate = recent.length ? Math.round((recent.reduce((s, c) => s + Math.min(2, Math.max(0, c.adherence)) / 2, 0) / recent.length) * 100) : null;
  const energies = recent.map((c) => c.energy).filter((e): e is number => typeof e === "number");
  const energyAvg = energies.length ? Math.round((energies.reduce((a, b) => a + b, 0) / energies.length) * 10) / 10 : null;
  // Série en cours : jours consécutifs jusqu'à aujourd'hui (ou hier) avec un relevé « oui ».
  const days = new Set(checkins.filter((c) => c.adherence === 2).map((c) => c.day));
  let streak = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return { windowDays, checkinDays: recent.length, rate, energyAvg, streak };
}

// ── Bilans notés ─────────────────────────────────────────────────────────────
export interface Scoring {
  higherIsBetter: boolean;
  /** Paliers croissants : le premier dont `upTo` ≥ score donne l'interprétation. */
  bands: Array<{ upTo: number; label: string }>;
}

export function parseScoring(raw: string | null | undefined): Scoring | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || !Array.isArray(v.bands)) return null;
    const bands = v.bands
      .filter((b: any) => typeof b?.upTo === "number" && typeof b?.label === "string" && b.label.trim())
      .map((b: any) => ({ upTo: Math.max(0, Math.min(100, Math.round(b.upTo))), label: String(b.label).trim().slice(0, 120) }))
      .sort((a: any, b: any) => a.upTo - b.upTo);
    return { higherIsBetter: v.higherIsBetter !== false, bands };
  } catch {
    return null;
  }
}

type QuestionLike = { id: string; type: string; reverse?: boolean };

/**
 * Score 0-100 : moyenne des questions « échelle » (1 à 10) ramenées à 0-1, une
 * question `reverse` comptant à l'envers. null si aucune échelle n'a de réponse.
 */
export function scoreAnswers(questions: QuestionLike[], answers: Record<string, unknown>, scoring: Scoring): { score: number; label: string | null } | null {
  const vals: number[] = [];
  for (const q of questions) {
    if (q.type !== "scale") continue;
    const v = Number(answers[q.id]);
    if (!Number.isFinite(v) || v < 1 || v > 10) continue;
    const n = (v - 1) / 9;
    vals.push(q.reverse ? 1 - n : n);
  }
  if (!vals.length) return null;
  const score = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
  const band = scoring.bands.find((b) => score <= b.upTo) ?? scoring.bands[scoring.bands.length - 1];
  return { score, label: band?.label ?? null };
}
