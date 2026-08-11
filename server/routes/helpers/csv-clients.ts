/**
 * server/routes/helpers/csv-clients.ts — import CSV de fiches clients (Lot 3)
 *
 * Parse un CSV de coordonnées (prénom, nom, email, téléphone) exporté d'Excel,
 * Google Sheets ou d'un autre logiciel. Uniquement des COORDONNÉES : les champs
 * santé ne passent jamais par l'import (cohérent avec le socle gratuit).
 *
 * ponytail: parseur ligne à ligne, guillemets gérés, mais pas de champ multi-
 * lignes entre guillemets — un export de contacts n'en contient pas ; passer à
 * une vraie lib CSV si un fichier réel en apporte un jour.
 */

export interface CsvClientRow {
  ligne: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export interface CsvParseResult {
  rows: CsvClientRow[];
  erreurs: Array<{ ligne: number; motif: string }>;
  avertissements: Array<{ ligne: number; motif: string }>;
  erreurGlobale?: string;
}

export const CSV_MAX_ROWS = 500;

/** Normalise un en-tête : minuscules, sans accents ni ponctuation. */
function normHeader(h: string): string {
  let out = "";
  for (const ch of h.normalize("NFD")) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0300 && c <= 0x036f) continue; // diacritiques combinants (é → e)
    out += ch;
  }
  return out.toLowerCase().replace(/[^a-z]/g, "");
}

const HEADER_MAP: Record<string, keyof Omit<CsvClientRow, "ligne">> = {
  prenom: "firstName", firstname: "firstName",
  nom: "lastName", lastname: "lastName", nomdefamille: "lastName",
  email: "email", mail: "email", courriel: "email", adresseemail: "email",
  telephone: "phone", tel: "phone", phone: "phone", portable: "phone", mobile: "phone",
};

/** Découpe une ligne CSV en champs, en respectant les guillemets ("" = échappé). */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseClientsCsv(csv: string): CsvParseResult {
  const res: CsvParseResult = { rows: [], erreurs: [], avertissements: [] };
  const text = csv.replace(/^﻿/, ""); // BOM Excel
  const lines = text.split(/\r\n|\r|\n/).filter((l, i) => i === 0 || l.trim() !== "");
  if (!lines.length || !lines[0].trim()) {
    res.erreurGlobale = "Fichier vide.";
    return res;
  }

  // Séparateur : celui qui découpe le plus l'en-tête (Excel FR exporte en « ; »).
  const header = lines[0];
  const sep = [";", ",", "\t"].reduce((best, s) =>
    header.split(s).length > header.split(best).length ? s : best, ";");

  const headers = splitCsvLine(header, sep).map(normHeader);
  const colIndex: Partial<Record<keyof Omit<CsvClientRow, "ligne">, number>> = {};
  headers.forEach((h, i) => {
    const field = HEADER_MAP[h];
    if (field && colIndex[field] === undefined) colIndex[field] = i;
  });
  if (colIndex.firstName === undefined || colIndex.lastName === undefined) {
    res.erreurGlobale =
      "Colonnes obligatoires introuvables : il faut au minimum « Prénom » et « Nom » en première ligne.";
    return res;
  }
  if (lines.length - 1 > CSV_MAX_ROWS) {
    res.erreurGlobale = `Fichier trop volumineux : ${lines.length - 1} lignes (maximum ${CSV_MAX_ROWS}).`;
    return res;
  }

  for (let i = 1; i < lines.length; i++) {
    const ligne = i + 1; // numéro humain (l'en-tête est la ligne 1)
    const cells = splitCsvLine(lines[i], sep);
    if (cells.every((c) => !c)) continue; // ligne vide
    const firstName = cells[colIndex.firstName!] || "";
    const lastName = cells[colIndex.lastName!] || "";
    if (!firstName || !lastName) {
      res.erreurs.push({ ligne, motif: "prénom ou nom manquant" });
      continue;
    }
    let email: string | null = colIndex.email !== undefined ? cells[colIndex.email] || null : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.avertissements.push({ ligne, motif: `email invalide ignoré (${email})` });
      email = null;
    }
    const phone: string | null = colIndex.phone !== undefined ? cells[colIndex.phone] || null : null;
    res.rows.push({ ligne, firstName, lastName, email, phone });
  }
  return res;
}
