// Logique pure du tableau de bord (/#/app) : périodes, évolution, « À faire »,
// regroupement des prochains RDV par jour. Sans React, testée à côté.

export type Periode = "mois_courant" | "mois_dernier" | "annee";

const DAY = 86400000;

function monthStart(base: Date, offset: number): number {
  return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1);
}

export function getPeriodeRange(p: Periode, now = new Date()): { from: number; to: number } {
  if (p === "annee") {
    const y = now.getUTCFullYear();
    return { from: Date.UTC(y, 0, 1), to: Date.UTC(y + 1, 0, 1) - 1 };
  }
  const offset = p === "mois_courant" ? 0 : -1;
  return { from: monthStart(now, offset), to: monthStart(now, offset + 1) - 1 };
}

/** Même période, décalée d'un cran en arrière (mois précédent, année précédente). */
export function getPreviousRange(p: Periode, now = new Date()): { from: number; to: number } {
  if (p === "annee") {
    const y = now.getUTCFullYear() - 1;
    return { from: Date.UTC(y, 0, 1), to: Date.UTC(y + 1, 0, 1) - 1 };
  }
  const offset = p === "mois_courant" ? -1 : -2;
  return { from: monthStart(now, offset), to: monthStart(now, offset + 1) - 1 };
}

export function getPeriodeLabel(p: Periode, now = new Date()): string {
  if (p === "annee") return String(now.getUTCFullYear());
  const d = new Date(monthStart(now, p === "mois_courant" ? 0 : -1));
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const PREVIOUS_LABEL: Record<Periode, string> = {
  mois_courant: "vs mois dernier",
  mois_dernier: "vs mois précédent",
  annee: "vs année dernière",
};

/** Évolution en % arrondie ; null si la base est nulle (pas de comparaison honnête). */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function fillLabel(weekCount: number): string {
  if (weekCount >= 16) return "Semaine complète";
  if (weekCount >= 6) return "Semaine chargée";
  return "Semaine calme";
}

interface ApptLike {
  id: number;
  startAt: number;
  endAt: number;
  status: string | null;
}

interface InvoiceLike {
  id: number;
  status: string;
  docType?: string | null;
  dueDate?: number | null;
}

/** RDV terminés dans le temps mais encore « confirmés » : à clôturer (déclenche l'auto-facture). */
export function apptsToClose<T extends ApptLike>(appts: T[], now: number): T[] {
  return appts
    .filter((a) => a.status === "confirmed" && a.endAt <= now)
    .sort((a, b) => b.startAt - a.startAt);
}

/** Factures émises non réglées dont l'échéance est dépassée. */
export function overdueInvoices<T extends InvoiceLike>(invoices: T[], now: number): T[] {
  return invoices.filter(
    (i) => i.docType !== "devis" && (i.status === "issued" || i.status === "sent") && !!i.dueDate && i.dueDate < now,
  );
}

export function draftInvoices<T extends InvoiceLike>(invoices: T[]): T[] {
  return invoices.filter((i) => i.status === "draft");
}

function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function isSameLocalDay(a: number, b: number): boolean {
  return localDayKey(a) === localDayKey(b);
}

/** « Aujourd'hui », « Demain » ou « jeudi 23 octobre ». */
export function dayHeading(ts: number, now: number): string {
  if (isSameLocalDay(ts, now)) return "Aujourd'hui";
  if (isSameLocalDay(ts, now + DAY)) return "Demain";
  return new Date(ts).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/** Regroupe des RDV déjà triés par jour local, en gardant l'ordre. */
export function groupByDay<T extends { startAt: number }>(items: T[]): Array<{ day: number; items: T[] }> {
  const groups: Array<{ day: number; items: T[] }> = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && isSameLocalDay(last.day, it.startAt)) last.items.push(it);
    else groups.push({ day: it.startAt, items: [it] });
  }
  return groups;
}

/** « dans 25 min », « dans 2 h 05 », « en cours ». */
export function untilLabel(startAt: number, endAt: number, now: number): string {
  if (startAt <= now && now < endAt) return "en cours";
  const min = Math.round((startAt - now) / 60000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `dans ${h} h ${String(m).padStart(2, "0")}` : `dans ${h} h`;
}
