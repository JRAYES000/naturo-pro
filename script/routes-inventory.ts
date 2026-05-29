/**
 * script/routes-inventory.ts
 *
 * Génère docs/_refactor/routes-inventory.txt : l'inventaire normalisé de TOUTES les
 * routes Express déclarées dans server/routes.ts + server/routes/**.
 *
 * Format par ligne : METHOD  /path  [middlewares]  handler
 * Trié par (path, method) → canonique, indépendant du fichier source et de l'ordre
 * d'enregistrement. C'est le garde-fou objectif du refactor : après chaque étape du
 * split, on régénère et on vérifie que le diff est STRICTEMENT VIDE (même set de
 * routes, mêmes middlewares).
 *
 * Usage : tsx script/routes-inventory.ts
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs", "_refactor", "routes-inventory.txt");

function collectFiles(): string[] {
  const files: string[] = [];
  const single = join(ROOT, "server", "routes.ts");
  try { if (statSync(single).isFile()) files.push(single); } catch {}
  const dir = join(ROOT, "server", "routes");
  const walk = (d: string) => {
    let entries: string[] = [];
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const full = join(d, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (e.endsWith(".ts")) files.push(full);
    }
  };
  walk(dir);
  return files;
}

interface Route { method: string; path: string; middlewares: string[]; }

// app.get("/x", mw1, mw2, async (req...) => ...)
const RE = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]((?:\s*,\s*[A-Za-z_$][\w$.]*)*)\s*,\s*(?:async\s*)?\(/g;

function parse(src: string): Route[] {
  const out: Route[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const path = m[2];
    const mws = (m[3] || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    out.push({ method, path, middlewares: mws });
  }
  return out;
}

const all: Route[] = [];
for (const f of collectFiles()) {
  all.push(...parse(readFileSync(f, "utf-8")));
}

all.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));

const methodW = Math.max(6, ...all.map((r) => r.method.length));
const pathW = Math.max(4, ...all.map((r) => r.path.length));
const lines = all.map((r) => {
  const mw = r.middlewares.length ? `[${r.middlewares.join(", ")}]` : "[]";
  return `${r.method.padEnd(methodW)}  ${r.path.padEnd(pathW)}  ${mw}  (anonymous)`;
});

const header = `# Inventaire des routes Express — généré par script/routes-inventory.ts
# ${all.length} routes — trié par (path, method), file-agnostic.
# Le diff de ce fichier doit rester STRICTEMENT VIDE à travers le split de routes.ts.
`;

mkdirSync(join(ROOT, "docs", "_refactor"), { recursive: true });
writeFileSync(OUT, header + "\n" + lines.join("\n") + "\n", "utf-8");
console.log(`[routes-inventory] ${all.length} routes → ${OUT}`);
