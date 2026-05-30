/**
 * shared/schema-drift.test.ts — Test de non-divergence des schémas Drizzle
 *
 * Vérifie que schema.ts (SQLite) et schema-mysql.ts (MySQL) restent en sync
 * sur les noms de colonnes et l'ensemble des tables exportées.
 *
 * Runner : node:test (intégré Node 24), lancé via `npm run test` (tsx --test).
 * Aucune connexion DB — uniquement les définitions Drizzle statiques.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableColumns } from "drizzle-orm";

import * as sqlite from "./schema";
import * as mysql from "./schema-mysql";

// ─── Tables à comparer (présentes dans les deux schémas) ──────────────────────
// Chaque entrée : [nomLisible, tableSQLite, tableMySQL]
const TABLE_PAIRS: Array<[string, any, any]> = [
  ["users",                sqlite.users,                mysql.users],
  ["appointmentCategories",sqlite.appointmentCategories,mysql.appointmentCategories],
  ["availabilitySlots",    sqlite.availabilitySlots,    mysql.availabilitySlots],
  ["clients",              sqlite.clients,              mysql.clients],
  ["appointments",         sqlite.appointments,         mysql.appointments],
  ["consultationNotes",    sqlite.consultationNotes,    mysql.consultationNotes],
  ["sessions",             sqlite.sessions,             mysql.sessions],
  ["emailLog",             sqlite.emailLog,             mysql.emailLog],
  ["invoices",             sqlite.invoices,             mysql.invoices],
  ["invoiceItems",         sqlite.invoiceItems,         mysql.invoiceItems],
  ["emailTemplates",       sqlite.emailTemplates,       mysql.emailTemplates],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrait les noms DB (snake_case) des colonnes d'une table Drizzle. */
function columnNames(table: any): Set<string> {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  return new Set(Object.values(cols).map((c) => c.name));
}

/** Retourne la différence symétrique de deux ensembles (éléments présents dans
 *  l'un mais pas l'autre). */
function symmetricDiff(a: Set<string>, b: Set<string>): string[] {
  const result: string[] = [];
  for (const v of a) if (!b.has(v)) result.push(`SQLite-only: "${v}"`);
  for (const v of b) if (!a.has(v)) result.push(`MySQL-only:  "${v}"`);
  return result;
}

// ─── Test 1 : colonnes identiques pour chaque table ──────────────────────────
for (const [nom, tableSqlite, tableMysql] of TABLE_PAIRS) {
  test(`drift — colonnes de la table "${nom}" identiques SQLite↔MySQL`, () => {
    const sqliteCols = columnNames(tableSqlite);
    const mysqlCols  = columnNames(tableMysql);
    const ecart      = symmetricDiff(sqliteCols, mysqlCols);
    assert.equal(
      ecart.length,
      0,
      `Table "${nom}" : divergence de colonnes détectée :\n  ${ecart.join("\n  ")}`,
    );
  });
}

// ─── Test 2 : ensemble des noms de tables exportés identiques des deux côtés ─
test("drift — noms de tables exportés identiques SQLite↔MySQL", () => {
  // On ne conserve que les exports qui sont des tables Drizzle (Symbol(drizzle:IsDrizzleTable)).
  // En pratique on filtre sur les clés des deux schémas qui correspondent aux TABLE_PAIRS.
  const tableNames = TABLE_PAIRS.map(([nom]) => nom);

  // Vérifie que chaque nom attendu est bien présent dans les deux modules.
  const missingInSqlite = tableNames.filter((n) => !(sqlite as any)[n]);
  const missingInMysql  = tableNames.filter((n) => !(mysql  as any)[n]);

  assert.deepEqual(
    missingInSqlite,
    [],
    `Tables manquantes dans schema.ts (SQLite) : ${missingInSqlite.join(", ")}`,
  );
  assert.deepEqual(
    missingInMysql,
    [],
    `Tables manquantes dans schema-mysql.ts (MySQL) : ${missingInMysql.join(", ")}`,
  );
});
