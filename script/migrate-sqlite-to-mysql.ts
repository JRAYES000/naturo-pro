#!/usr/bin/env tsx
/**
 * script/migrate-sqlite-to-mysql.ts
 *
 * Migrates all data from the local SQLite database (data.db) to the MySQL
 * database configured via environment variables.
 *
 * Usage:
 *   # Make sure .env (or .env.local) contains DB_* variables for MySQL
 *   DB_DRIVER=mysql tsx script/migrate-sqlite-to-mysql.ts
 *
 * The script is idempotent: it truncates MySQL tables before inserting, so
 * running it multiple times is safe.  Tables are migrated in a dependency-
 * safe order (parents before children).
 *
 * Prerequisites:
 *   1. MySQL schema must already exist → run `npm run db:push:mysql` first.
 *   2. data.db must be present in the project root.
 */

import "dotenv/config";
import Database from "better-sqlite3";
import mysql2 from "mysql2/promise";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────
const SQLITE_PATH = path.join(ROOT, "data.db");

const mysqlConfig = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  multipleStatements: true,
};

// Migration order respects FK dependencies (parents first)
const TABLES: string[] = [
  "users",
  "appointment_categories",
  "availability_slots",
  "clients",
  "appointments",
  "consultation_notes",
  "sessions",
  "email_log",
];

// ── Type helpers ──────────────────────────────────────────────────────────────

/**
 * Columns that store unix-millisecond timestamps as integers in SQLite.
 * These are passed through as-is (bigint-compatible numbers) to MySQL.
 */
const BIGINT_COLS: Record<string, string[]> = {
  users:                ["created_at"],
  clients:              ["created_at"],
  appointments:         ["start_at", "end_at", "created_at"],
  consultation_notes:   ["created_at", "updated_at"],
  sessions:             ["expires_at"],
  email_log:            ["sent_at"],
};

/**
 * Columns that are boolean (0/1) integers in SQLite → tinyint(1) / boolean in MySQL.
 * mysql2 accepts plain JS booleans as well as 0/1, so we normalise to true/false.
 */
const BOOL_COLS: Record<string, string[]> = {
  users:                ["email_reminders_enabled", "public_page_enabled"],
  appointment_categories: ["is_active"],
  appointments:         ["reminder_sent"],
};

function coerceRow(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    const bools = BOOL_COLS[table] ?? [];
    const bigints = BIGINT_COLS[table] ?? [];

    if (bools.includes(col)) {
      // SQLite stores booleans as 0 / 1 integers
      result[col] = val === null ? null : Boolean(val);
    } else if (bigints.includes(col)) {
      // Keep as number (mysql2 handles BigInt transparently when value fits)
      result[col] = val === null ? null : Number(val);
    } else {
      result[col] = val;
    }
  }
  return result;
}

// ── Push MySQL schema first ───────────────────────────────────────────────────
function pushSchema() {
  console.log("\n[migrate] Pushing MySQL schema via drizzle-kit...");
  try {
    execSync("npx drizzle-kit push --config=drizzle.config.mysql.ts", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log("[migrate] Schema push complete.");
  } catch (err) {
    console.error("[migrate] Schema push failed — make sure the MySQL credentials are correct.");
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  SQLite → MySQL migration");
  console.log(`  Source : ${SQLITE_PATH}`);
  console.log(`  Target : ${mysqlConfig.user}@${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
  console.log("═══════════════════════════════════════════════════\n");

  // 1. Ensure MySQL schema is up to date
  pushSchema();

  // 2. Open SQLite
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  console.log("[migrate] Opened SQLite database.");

  // 3. Connect to MySQL
  const conn = await mysql2.createConnection(mysqlConfig);
  console.log("[migrate] Connected to MySQL.\n");

  let totalRows = 0;
  const summary: { table: string; rows: number }[] = [];

  try {
    // Disable FK checks for the duration of the import
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");

    for (const table of TABLES) {
      // Check table exists in SQLite
      const tableExists = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      if (!tableExists) {
        console.log(`[migrate] Table "${table}" not found in SQLite — skipping.`);
        summary.push({ table, rows: 0 });
        continue;
      }

      // Read all rows from SQLite
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) {
        console.log(`[migrate] "${table}" is empty — truncating MySQL table.`);
        await conn.query(`TRUNCATE TABLE \`${table}\``);
        summary.push({ table, rows: 0 });
        continue;
      }

      // Truncate MySQL table first (idempotent)
      await conn.query(`TRUNCATE TABLE \`${table}\``);

      // Build column list from first row
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => "?").join(", ");
      const colList = cols.map(c => `\`${c}\``).join(", ");
      const sql = `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`;

      let count = 0;
      for (const row of rows) {
        const coerced = coerceRow(table, row);
        const values = cols.map(c => coerced[c] ?? null);
        await conn.query(sql, values);
        count++;
      }

      console.log(`[migrate] "${table}": ${count} row(s) inserted.`);
      summary.push({ table, rows: count });
      totalRows += count;
    }

    // Re-enable FK checks
    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");
  } finally {
    sqlite.close();
    await conn.end();
  }

  // 4. Summary
  console.log("\n════════════════════ Summary ══════════════════════");
  for (const { table, rows } of summary) {
    console.log(`  ${table.padEnd(30)} ${String(rows).padStart(6)} row(s)`);
  }
  console.log(`${"".padEnd(50, "─")}`);
  console.log(`  ${"TOTAL".padEnd(30)} ${String(totalRows).padStart(6)} row(s)`);
  console.log("════════════════════════════════════════════════════\n");
  console.log("[migrate] Done. ✓");
}

main().catch(err => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
