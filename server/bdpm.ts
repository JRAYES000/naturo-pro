/**
 * server/bdpm.ts — base de données publique des médicaments (BDPM, ANSM).
 *
 * Copie locale du « fichier des spécialités » (CIS_bdpm.txt : ~16 000 lignes,
 * 12 colonnes séparées par des tabulations, encodage Windows-1252), rafraîchie
 * chaque mois. Elle aide la praticienne à noter sans faute les traitements en
 * cours d'une cliente. Licence ouverte : la source et la date de mise à jour sont
 * affichées à côté de la recherche, les données ne sont pas modifiées.
 */
import { storage } from "./storage";

export const BDPM_URL = "https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_bdpm.txt";
export const BDPM_REFRESH_MS = 30 * 24 * 3600 * 1000;

export interface MedicationRow {
  cis: string;
  name: string;
  search: string;
  form: string | null;
  routes: string | null;
  holder: string | null;
  commercialized: boolean;
}

/** Minuscules sans accents : la recherche « paracetamol » trouve « PARACÉTAMOL ». */
export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const cut = (s: string | undefined, max: number) => {
  const v = (s || "").trim();
  return v ? v.slice(0, max) : null;
};

/**
 * Colonnes : 0 code CIS, 1 dénomination, 2 forme, 3 voies d'administration,
 * 4 statut AMM, 5 procédure, 6 état de commercialisation, 7 date AMM, 8 statut BDM,
 * 9 autorisation européenne, 10 titulaire(s), 11 surveillance renforcée.
 */
export function parseBdpm(text: string): MedicationRow[] {
  const out: MedicationRow[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const c = line.split("\t");
    if (c.length < 11 || !/^\d{6,10}$/.test(c[0].trim())) continue;
    const cis = c[0].trim();
    const name = (c[1] || "").trim().slice(0, 300);
    if (!name || seen.has(cis)) continue;
    seen.add(cis);
    out.push({
      cis, name, search: normalizeSearch(name).slice(0, 300),
      form: cut(c[2], 255), routes: cut(c[3], 255), holder: cut(c[10], 255),
      commercialized: (c[6] || "").trim() === "Commercialisée",
    });
  }
  return out;
}

export async function fetchBdpm(): Promise<MedicationRow[]> {
  const res = await fetch(BDPM_URL, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`BDPM HTTP ${res.status}`);
  const text = new TextDecoder("windows-1252").decode(await res.arrayBuffer());
  const rows = parseBdpm(text);
  // Garde-fou : un fichier tronqué ou une page d'erreur ne doit pas vider la base.
  if (rows.length < 5000) throw new Error(`BDPM incomplète (${rows.length} spécialités)`);
  return rows;
}

/** Recharge la copie locale si elle est vide ou date de plus d'un mois (ou si `force`). */
export async function refreshBdpmIfStale(force = false): Promise<{ refreshed: boolean; count: number }> {
  const last = await storage.lastMedicationsUpdate();
  if (!force && last && Date.now() - last < BDPM_REFRESH_MS) return { refreshed: false, count: await storage.countMedications() };
  const rows = await fetchBdpm();
  await storage.replaceMedications(rows, Date.now());
  console.log(`[bdpm] ${rows.length} spécialités chargées`);
  return { refreshed: true, count: rows.length };
}
