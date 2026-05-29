/**
 * script/smoke-routes.ts
 *
 * Smoke test des routes critiques contre un serveur dev déjà lancé sur :3000.
 * Garde-fou fonctionnel du split de routes.ts (Phase 4.0).
 *
 * Usage : npm run dev (dans un terminal) puis `npm run smoke`.
 * Sortie : OK/KO par route, exit 1 si une route casse.
 *
 * Au fil du refactor, ajouter 2-3 routes par domaine touché.
 */

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const DEMO_EMAIL = "marie@demo.fr";
const DEMO_PASSWORD = "demo1234";

let cookie = "";
let failures = 0;

function pass(label: string, extra = "") {
  console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
}
function fail(label: string, detail: string) {
  failures++;
  console.log(`  ✗ ${label} — ${detail}`);
}

async function check(
  label: string,
  path: string,
  opts: { method?: string; body?: any; expect?: number; withCookie?: boolean } = {},
) {
  const { method = "GET", body, expect = 200, withCookie = false } = opts;
  const headers: Record<string, string> = {};
  if (body) headers["content-type"] = "application/json";
  if (withCookie && cookie) headers["cookie"] = cookie;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status !== expect) {
      fail(label, `${method} ${path} → ${res.status} (attendu ${expect})`);
      return null;
    }
    pass(label, `${method} ${path} → ${res.status}`);
    return res;
  } catch (e: any) {
    fail(label, `${method} ${path} → ${e?.message || e}`);
    return null;
  }
}

async function main() {
  console.log(`[smoke] cible ${BASE}`);

  // 1. Home (SPA)
  await check("home", "/");

  // 2. Login démo → capture cookie naturo_session
  const login = await check("login", "/api/auth/login", {
    method: "POST",
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  if (login) {
    let token = "";
    const setCookies = (login.headers as any).getSetCookie?.() as string[] | undefined;
    if (setCookies && setCookies.length) {
      const sc = setCookies.find((c) => c.startsWith("naturo_session="));
      if (sc) token = sc.split(";")[0].split("=")[1];
    }
    if (!token) {
      try { token = (await login.clone().json())?.token || ""; } catch {}
    }
    if (token) {
      cookie = `naturo_session=${token}`;
      pass("cookie", "naturo_session capturé");
    } else {
      fail("cookie", "naturo_session introuvable dans la réponse de login");
    }
  }

  // 3. Session authentifiée
  await check("me", "/api/auth/me", { withCookie: true });

  // 4. Domaines authentifiés (à compléter au fil du split)
  await check("categories", "/api/categories", { withCookie: true });
  await check("clients", "/api/clients", { withCookie: true });
  await check("appointments", "/api/appointments", { withCookie: true });

  // 5. Public
  await check("public-api", "/api/public/marie-dupont");
  await check("public-page", "/p/marie-dupont");

  console.log("");
  if (failures > 0) {
    console.error(`[smoke] ÉCHEC — ${failures} route(s) KO`);
    process.exit(1);
  }
  console.log("[smoke] OK — toutes les routes vertes");
}

main().catch((e) => {
  console.error("[smoke] exception:", e);
  process.exit(1);
});
