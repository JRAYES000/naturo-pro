#!/usr/bin/env node
/**
 * Publie sur WordPress (ecole-naturo.fr) les contenus préparés dans docs/seo/<dossier>/.
 *
 *   node script/wp-publish.mjs docs/seo/2026-09-cluster-animal            → dry-run (ne touche à rien)
 *   node script/wp-publish.mjs docs/seo/2026-09-cluster-animal --apply    → écrit
 *   node script/wp-publish.mjs docs/seo/2026-09-cluster-animal --apply --only devenir-naturopathe-animalier-guide
 *
 * Chaque contenu = <slug>.html (corps WordPress) + <slug>.meta.json :
 *   { type: "post"|"page", action: "create"|"update", id, slug, title, yoast_title, yoast_desc,
 *     focus_kw, author, categories, status, publish_date_suggested, jsonld, notes_julien }
 *
 * Auth : mot de passe d'application WordPress (wp-admin → Utilisateurs → Profil → Mots de passe
 * d'application). Variables d'environnement, jamais dans le dépôt :
 *   WP_URL=https://ecole-naturo.fr  WP_USER=<login>  WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
 *
 * Limites connues (docs skill wordpress-ops) : les meta Yoast ne persistent PAS via REST sur les
 * PAGES. Pour une page, le script écrit le contenu et affiche la commande WP-CLI à lancer pour
 * les meta. Après écriture : purger le cache (wphb) sinon l'ancienne version reste visible.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (!dir) {
  console.error("Usage : node script/wp-publish.mjs <dossier> [--apply] [--only <slug>]");
  process.exit(1);
}

const WP_URL = (process.env.WP_URL || "https://ecole-naturo.fr").replace(/\/$/, "");
const { WP_USER, WP_APP_PASSWORD } = process.env;
if (apply && (!WP_USER || !WP_APP_PASSWORD)) {
  console.error("WP_USER et WP_APP_PASSWORD sont requis avec --apply.");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");

async function wp(route, method = "GET", body) {
  const res = await fetch(`${WP_URL}/wp-json${route}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: auth, "User-Agent": "naturo-pro wp-publish" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${json.message || JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const FORBIDDEN = [/\bCPF\b/i, /mon compte formation/i];

function buildContent(html, meta) {
  let out = html.trim();
  if (meta.jsonld) {
    const ld = Array.isArray(meta.jsonld) ? meta.jsonld : [meta.jsonld];
    for (const block of ld) out += `\n\n<script type="application/ld+json">\n${JSON.stringify(block, null, 1)}\n</script>`;
  }
  return out;
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".meta.json")).sort();
let failures = 0;
for (const f of files) {
  const slug = f.replace(/\.meta\.json$/, "");
  if (only && slug !== only) continue;
  const meta = JSON.parse(await readFile(path.join(dir, f), "utf8"));
  if (!meta.type || !meta.action) {
    console.log(`· ${slug} : pas un contenu publiable (bloc manuel), ignoré`);
    continue;
  }
  const html = await readFile(path.join(dir, `${slug}.html`), "utf8");
  const content = buildContent(html, meta);
  const hit = FORBIDDEN.find((re) => re.test(content) || re.test(meta.yoast_title || "") || re.test(meta.yoast_desc || ""));
  if (hit) {
    console.error(`✗ ${slug} : mention interdite (${hit}) — refusé`);
    failures++;
    continue;
  }
  if ((meta.yoast_title || "").length > 60) console.warn(`  ! ${slug} : yoast_title > 60 caractères (${meta.yoast_title.length})`);
  if ((meta.yoast_desc || "").length > 155) console.warn(`  ! ${slug} : yoast_desc > 155 caractères (${meta.yoast_desc.length})`);

  const route = meta.type === "page" ? "/wp/v2/pages" : "/wp/v2/posts";
  const body = { title: meta.title, content, slug: meta.slug || slug };
  if (meta.author) body.author = meta.author;
  if (meta.categories && meta.type === "post") body.categories = meta.categories;
  if (meta.action === "create") {
    body.status = meta.status || "draft";
    if (body.status === "future" && meta.publish_date_suggested) body.date = `${meta.publish_date_suggested}T09:00:00`;
  }
  const yoast = {
    _yoast_wpseo_title: meta.yoast_title,
    _yoast_wpseo_metadesc: meta.yoast_desc,
    _yoast_wpseo_focuskw: meta.focus_kw,
  };
  if (meta.type === "post") body.meta = yoast;

  const target = meta.action === "update" ? `${route}/${meta.id}` : route;
  const words = content.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  console.log(`${apply ? "→" : "·"} ${meta.action.toUpperCase()} ${meta.type} ${meta.action === "update" ? "#" + meta.id : "(nouveau)"} ${slug} — ${words} mots, statut ${body.status || "inchangé"}`);
  if (!apply) continue;
  try {
    const res = await wp(target, "POST", body);
    const raw = res.content?.raw ?? res.content?.rendered ?? "";
    const kept = raw.includes("application/ld+json") || !meta.jsonld;
    console.log(`  ✓ id ${res.id} — ${res.link}${kept ? "" : "  ! JSON-LD absent de content.raw (kses ?) — vérifier Unfiltered MU"}`);
    if (meta.type === "page") {
      console.log(`  ! Meta Yoast à poser en WP-CLI (REST les ignore sur les pages) :`);
      for (const [k, v] of Object.entries(yoast)) if (v) console.log(`    wp post meta update ${res.id} ${k} ${JSON.stringify(v)}`);
      console.log(`    wp yoast index && rm -rf wp-content/wphb-cache/cache && wp cache flush`);
    }
  } catch (e) {
    failures++;
    console.error(`  ✗ ${e.message}`);
  }
}
if (apply) console.log("\nPenser à purger le cache : rm -rf wp-content/wphb-cache/cache && wp cache flush");
process.exit(failures ? 1 : 0);
