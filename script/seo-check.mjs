#!/usr/bin/env node
/**
 * script/seo-check.mjs — rejoue les tests binaires de l'audit SEO sur une URL réelle.
 *
 *   npm run seo:check                          → https://app.ecole-naturo.fr
 *   npm run seo:check -- http://localhost:3000 → serveur local
 *
 * Chaque test correspond à une action de docs/AUDIT-SEO-2026-08-15.md et répond
 * PASS ou FAIL, jamais « à peu près ». C'est ce qui permet de redemander un audit
 * dans trois semaines sans repasser par l'analyse : on lance ça, on voit ce qui a
 * bougé, et on ne travaille que sur les FAIL.
 *
 * Aucune dépendance : fetch natif de Node.
 */

const BASE = (process.argv[2] || "https://app.ecole-naturo.fr").replace(/\/$/, "");

const results = [];
let failures = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET avec espacement et reprise sur 429.
 *
 * La prod applique un rate-limit global : sans ce garde-fou, le script se
 * fait jeter et rapporte des FAIL qui ne disent rien de l'état réel du SEO.
 * Un audit qui ment sur ses échecs est pire qu'un audit absent.
 */
async function get(path, headers = {}, attempt = 0) {
  await sleep(400);
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "follow" });
  if (res.status === 429 && attempt < 4) {
    await sleep(2000 * (attempt + 1));
    return get(path, headers, attempt + 1);
  }
  return { status: res.status, type: res.headers.get("content-type") || "", body: await res.text() };
}

function record(id, label, ok, detail) {
  results.push({ id, label, ok, detail });
  // `ok === null` = test non applicable en l'état (ex. aucune fiche indexable) :
  // ce n'est pas un échec, et le compter comme tel rendrait le code de sortie
  // inutilisable en CI.
  if (ok === false) failures++;
}

/** Le corps réellement visible par un crawler sans exécution de JS. */
function bodyText(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (m ? m[1] : "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Crawler IA de référence pour les tests de contenu sans JS.
 *
 * ClaudeBot et non GPTBot : l'hébergeur renvoie 429 à GPTBot sur tout le compte
 * (constat du 15/08/2026, voir A14). Utiliser GPTBot ici ferait échouer des tests
 * qui ne parlent pas de lui, et masquerait le vrai problème derrière de faux FAIL.
 */
const AI_BOT = { "User-Agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" };
const GPTBOT = { "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot" };

async function main() {
  console.log(`\nAudit SEO — vérification de ${BASE}\n${"─".repeat(64)}`);

  const sitemap = await get("/sitemap.xml");
  const slugs = [...sitemap.body.matchAll(/<loc>[^<]*\/p\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  const sample = slugs[0];

  // A1 — le contenu est dans le HTML servi, pas seulement dans le JS.
  if (sample) {
    const p = await get(`/p/${sample}`, AI_BOT);
    const text = bodyText(p.body);
    record("A1", "Corps de fiche pré-rendu (vu par un crawler sans JS)", text.length > 200,
      `${text.length} caractères de texte dans <body> sur /p/${sample}`);
  } else {
    record("A1", "Corps de fiche pré-rendu", null, "aucune fiche indexable au sitemap — test non applicable");
  }

  // A2 — annuaire atteignable et lié.
  const dir = await get("/naturopathes", AI_BOT);
  const home = await get("/");
  // Le lien doit être dans le HTML SERVI, pas seulement dans le bundle React :
  // un crawler sans rendu JS ne suivrait pas ce dernier, et l'annuaire resterait
  // orphelin malgré le maillage ajouté côté client.
  const linked = /href="\/naturopathes"/.test(home.body);
  record("A2", "Annuaire servi et lié depuis l'accueil (sans JS)",
    dir.status === 200 && linked,
    `/naturopathes → ${dir.status}, lien dans le HTML de l'accueil : ${linked ? "oui" : "NON"}`);

  // A3 — une URL inconnue répond 404, pas 200.
  const ghost = await get("/inexistant-abc123-seo-check");
  const ghostProfile = await get("/p/inexistant-abc123-seo-check");
  record("A3", "URL inconnue en 404 (plus de soft-404)",
    ghost.status === 404 && ghostProfile.status === 404,
    `/inexistant → ${ghost.status}, /p/inexistant → ${ghostProfile.status}`);

  // A4 — les fiches publiées portent leur ville.
  if (slugs.length) {
    const titles = [];
    for (const s of slugs) {
      const r = await get(`/p/${s}`);
      titles.push((r.body.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
    }
    const withCity = titles.filter((t) => / à /.test(t)).length;
    record("A4", "Ville présente dans le title des fiches indexées",
      withCity === titles.length,
      `${withCity}/${titles.length} fiches du sitemap avec ville`);
  } else {
    record("A4", "Ville présente dans le title des fiches indexées", null,
      "aucune fiche au sitemap — voir A11");
  }

  // A5 — canonical partout.
  const pages = ["/logiciel-naturopathe", "/naturopathes", ...(sample ? [`/p/${sample}`] : [])];
  const canon = [];
  for (const p of pages) canon.push(/rel="canonical"/.test((await get(p)).body));
  record("A5", "Balise canonical sur toutes les pages publiques",
    canon.every(Boolean), `${canon.filter(Boolean).length}/${pages.length} pages`);

  // A6 — données structurées.
  const ld = [];
  for (const p of pages) ld.push(/application\/ld\+json/.test((await get(p)).body));
  record("A6", "JSON-LD présent sur les pages publiques",
    ld.every(Boolean), `${ld.filter(Boolean).length}/${pages.length} pages`);

  // A7 — sitemap propre.
  const hasDemo = /marie-dupont|julien-rayes/.test(sitemap.body);
  record("A7", "Sitemap sans compte de démonstration",
    sitemap.status === 200 && !hasDemo,
    `${(sitemap.body.match(/<loc>/g) || []).length} URLs, comptes de démo : ${hasDemo ? "PRÉSENTS" : "absents"}`);

  // A8 — page produit ciblant la requête.
  const soft = await get("/logiciel-naturopathe", AI_BOT);
  const h1 = (soft.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "";
  const words = bodyText(soft.body).split(" ").length;
  record("A8", "Page /logiciel-naturopathe avec H1 ciblé et contenu réel",
    /logiciel/i.test(h1) && /naturopathe/i.test(h1) && words >= 500,
    `H1 « ${h1.replace(/<[^>]+>/g, "").trim().slice(0, 60)} », ${words} mots`);

  // A9 — liens entrants depuis le domaine racine. Hors de ce dépôt : mesuré en direct.
  const wpPages = [
    "https://ecole-naturo.fr/blog/cabinet-bien-etre-prestations-complementaires-naturopathie/",
    "https://ecole-naturo.fr/blog/naturopathe-metier-salaire-debouches/",
    "https://ecole-naturo.fr/blog/consultation-naturopathe/",
  ];
  let inbound = 0;
  for (const u of wpPages) {
    try {
      const html = await (await fetch(u)).text();
      inbound += (html.match(/app\.ecole-naturo\.fr/g) || []).length;
    } catch { /* page absente ou réseau : compte pour 0 */ }
  }
  record("A9", "Liens depuis ecole-naturo.fr vers le sous-domaine",
    inbound >= 3, `${inbound} occurrences sur ${wpPages.length} pages testées (cible : ≥ 3)`);

  // A10 — descriptions distinctes.
  if (slugs.length > 1) {
    const descs = [];
    for (const s of slugs) {
      const r = await get(`/p/${s}`);
      descs.push((r.body.match(/name="description" content="([^"]*)"/) || [])[1] || "");
    }
    const unique = new Set(descs.map((d) => d.slice(60))).size;
    record("A10", "Meta descriptions distinctes d'une fiche à l'autre",
      unique === descs.length, `${unique}/${descs.length} descriptions distinctes`);
  } else {
    record("A10", "Meta descriptions distinctes", null, "moins de 2 fiches indexées — non applicable");
  }

  // A11 — les fiches du sitemap ont du contenu.
  if (slugs.length) {
    const lens = [];
    for (const s of slugs) lens.push(bodyText((await get(`/p/${s}`, AI_BOT)).body).length);
    const thin = lens.filter((l) => l < 300).length;
    record("A11", "Aucune fiche indexée sous 300 caractères de contenu",
      thin === 0, `${thin} fiche(s) trop légère(s) sur ${lens.length}`);
  } else {
    record("A11", "Aucune fiche indexée sous 300 caractères", null,
      "0 fiche indexable : les praticiens doivent compléter leur page");
  }

  // A12 — llms.txt réel, et pas le SPA renvoyé en 200.
  const llms = await get("/llms.txt");
  record("A12", "llms.txt servi en text/plain",
    llms.status === 200 && llms.type.includes("text/plain") && llms.body.startsWith("# Naturo Pro"),
    `${llms.status} ${llms.type.split(";")[0]}`);

  // A13 — charset avant title.
  if (sample) {
    const p = await get(`/p/${sample}`);
    const iCharset = p.body.indexOf("<meta charset");
    const iTitle = p.body.indexOf("<title>");
    record("A13", "<meta charset> avant <title>",
      iCharset >= 0 && iCharset < iTitle, `charset à ${iCharset}, title à ${iTitle}`);
  } else {
    const p = await get("/logiciel-naturopathe");
    record("A13", "<meta charset> avant <title>",
      p.body.indexOf("<meta charset") < p.body.indexOf("<title>"), "vérifié sur /logiciel-naturopathe");
  }

  // A14 — l'hébergeur laisse-t-il passer les crawlers IA que robots.txt autorise ?
  // Un robots.txt accueillant ne vaut rien si le pare-feu répond 429 avant lui.
  const bots = [["GPTBot", GPTBOT], ["ClaudeBot", AI_BOT],
                ["PerplexityBot", { "User-Agent": "Mozilla/5.0 (compatible; PerplexityBot/1.0)" }]];
  const blocked = [];
  for (const [name, ua] of bots) {
    const r = await get("/", ua);
    if (r.status !== 200) blocked.push(`${name} → ${r.status}`);
  }
  record("A14", "Crawlers IA non bloqués par l'hébergeur",
    blocked.length === 0,
    blocked.length ? `bloqués : ${blocked.join(", ")}` : "les 3 crawlers testés reçoivent 200");

  // ── Rapport ────────────────────────────────────────────────────────────────
  for (const r of results) {
    const mark = r.ok === null ? "  N/A" : r.ok ? " PASS" : " FAIL";
    console.log(`${mark}  ${r.id.padEnd(4)} ${r.label}\n       ${r.detail}`);
  }
  const na = results.filter((r) => r.ok === null).length;
  console.log("─".repeat(64));
  console.log(`${results.length - failures - na} PASS · ${failures} FAIL · ${na} non applicable\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
