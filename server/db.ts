/**
 * server/db.ts — Dual-driver Drizzle instance
 *
 * DB_DRIVER=sqlite (default) → better-sqlite3 + drizzle-orm/better-sqlite3
 *   reads ./data.db, schema from @shared/schema
 *
 * DB_DRIVER=mysql → mysql2/promise (pool) + drizzle-orm/mysql2
 *   reads DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME env vars
 *   schema from @shared/schema-mysql
 *
 * Pool/connection creation is synchronous; only query execution is async.
 * We use require() to defer module resolution so that mysql2 is NOT required
 * to be installed in SQLite-only (preview) environments.
 *
 * `db` is typed as `any` intentionally: the SQLite and MySQL Drizzle types are
 * incompatible union members, so we let storage.ts handle type safety via its
 * own typed helper functions.
 */

import { createRequire } from "node:module";
import * as schema from "@shared/schema-active";

export const DB_DRIVER = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();

// Compat dual ESM/CJS : tsx (dev) utilise import.meta.url ; esbuild bundle en CJS
// où import.meta vaut {} → fallback sur __filename (natif CJS).
const require = createRequire(import.meta.url || __filename);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any;

if (DB_DRIVER === "mysql") {
  // ── MySQL (production on Hostinger) ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const mysql2 = require("mysql2/promise");
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { drizzle } = require("drizzle-orm/mysql2");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const pool = mysql2.createPool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  _db = drizzle(pool, { schema, mode: "default" });
  console.log("[db] MySQL driver active — connecting to", process.env.DB_HOST ?? "localhost");
} else {
  // ── SQLite (preview / development on pplx.app) ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");

  const sqlite = new BetterSqlite3("data.db");
  sqlite.pragma("journal_mode = WAL");
  _db = drizzle(sqlite, { schema });
  console.log("[db] SQLite driver active — using data.db");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
export const db: any = _db;
