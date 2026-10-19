// Logique pure de la liste Clients : statut d'activité, recherche, filtres, tri, export CSV.
// Séparée de la page pour être testée sans DOM.

export const ACTIVE_WINDOW_MS = 90 * 86400000;

export type ClientStatus = "upcoming" | "active" | "dormant" | "never";
export type ClientFilter = "all" | ClientStatus | "archived";
export type ClientSort = "name" | "lastAppt" | "nextAppt" | "recent";

export interface ListClient {
  id: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  city?: string | null;
  createdAt: number;
  archivedAt?: number | null;
}

export interface ApptInfo {
  lastApptAt: number | null;
  nextApptAt: number | null;
}

/** Minuscules, sans accents ni espaces superflus : « Mélisse » == « melisse ». */
export function normalize(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Statut d'activité : RDV à venir, vue dans les 90 jours, à relancer, jamais vue. */
export function clientStatus(appt: ApptInfo | undefined, now = Date.now()): ClientStatus {
  if (appt?.nextApptAt) return "upcoming";
  if (!appt?.lastApptAt) return "never";
  return appt.lastApptAt > now - ACTIVE_WINDOW_MS ? "active" : "dormant";
}

/** Chaque mot tapé doit se retrouver dans le nom, l'email, le téléphone, l'entreprise ou la ville. */
export function matchesSearch(c: ListClient, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const phoneDigits = (c.phone || "").replace(/\D/g, "");
  const hay = normalize([c.firstName, c.lastName, c.email, c.phone, c.companyName, c.city].join(" "));
  return words.every((w) => {
    if (hay.includes(w)) return true;
    const digits = w.replace(/\D/g, "");
    return digits.length >= 3 && digits.length === w.replace(/[\s.\-+]/g, "").length && phoneDigits.includes(digits);
  });
}

export function countByFilter(
  list: ListClient[],
  appts: Map<number, ApptInfo>,
  now = Date.now(),
): Record<ClientFilter, number> {
  const counts: Record<ClientFilter, number> = { all: 0, upcoming: 0, active: 0, dormant: 0, never: 0, archived: 0 };
  for (const c of list) {
    if (c.archivedAt) { counts.archived++; continue; }
    counts.all++;
    counts[clientStatus(appts.get(c.id), now)]++;
  }
  return counts;
}

export function filterAndSort(
  list: ListClient[],
  appts: Map<number, ApptInfo>,
  opts: { query: string; filter: ClientFilter; sort: ClientSort },
  now = Date.now(),
): ListClient[] {
  const out = list.filter((c) => {
    if (opts.filter === "archived") { if (!c.archivedAt) return false; }
    else {
      if (c.archivedAt) return false;
      if (opts.filter !== "all" && clientStatus(appts.get(c.id), now) !== opts.filter) return false;
    }
    return matchesSearch(c, opts.query);
  });
  const byName = (a: ListClient, b: ListClient) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr", { sensitivity: "base" });
  return out.sort((a, b) => {
    if (opts.sort === "lastAppt") {
      return (appts.get(b.id)?.lastApptAt || 0) - (appts.get(a.id)?.lastApptAt || 0) || byName(a, b);
    }
    if (opts.sort === "nextAppt") {
      // Les prochains RDV d'abord (le plus proche en tête), puis les autres par nom.
      const na = appts.get(a.id)?.nextApptAt || Infinity;
      const nb = appts.get(b.id)?.nextApptAt || Infinity;
      return na === nb ? byName(a, b) : na - nb;
    }
    if (opts.sort === "recent") return b.createdAt - a.createdAt;
    return byName(a, b);
  });
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutralise les formules (=, +, -, @) à l'ouverture dans Excel.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const fmtDay = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("fr-FR") : "");

/** CSV « ; » (Excel FR) : coordonnées et RDV, jamais de donnée de santé. BOM pour les accents. */
export function clientsToCsv(list: ListClient[], appts: Map<number, ApptInfo>): string {
  const header = ["Prénom", "Nom", "Email", "Téléphone", "Entreprise", "Ville", "Dernier RDV", "Prochain RDV", "Fiche créée le"];
  const rows = list.map((c) => [
    c.firstName, c.lastName, c.email, c.phone, c.companyName, c.city,
    fmtDay(appts.get(c.id)?.lastApptAt), fmtDay(appts.get(c.id)?.nextApptAt), fmtDay(c.createdAt),
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
}

/** Modèle d'import accepté par /api/clients/import. */
export const IMPORT_TEMPLATE_CSV = "﻿Prénom;Nom;Email;Téléphone\r\nCamille;Durand;camille.durand@example.fr;06 12 34 56 78\r\n";

/** « il y a 3 mois », « dans 2 jours » : lisible d'un coup d'œil. */
export function relativeDay(ms: number, now = Date.now()): string {
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  const abs = Math.abs(days);
  const unit = abs < 14 ? `${abs} jours` : abs < 60 ? `${Math.round(abs / 7)} semaines` : abs < 730 ? `${Math.round(abs / 30)} mois` : `${Math.round(abs / 365)} ans`;
  return days > 0 ? `dans ${unit}` : `il y a ${unit}`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
