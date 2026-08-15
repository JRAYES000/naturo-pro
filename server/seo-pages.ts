/**
 * server/seo-pages.ts
 *
 * Pages rendues ENTIÈREMENT côté serveur, en HTML pur — pas de SPA, pas de React.
 * Nées de l'audit SEO du 15/08/2026 (docs/AUDIT-SEO-2026-08-15.md) :
 *
 *   - A2  : /naturopathes et /naturopathes/{ville} — l'annuaire. Les pages
 *           praticiens étaient orphelines (aucun lien entrant depuis le site).
 *   - A8  : /logiciel-naturopathe — la seule page ciblant la requête produit.
 *   - A1  : le corps de /p/{slug}, injecté dans le HTML servi avant hydratation.
 *
 * Pourquoi du HTML pur et pas des pages React : ces pages n'existent que pour les
 * moteurs et pour les crawlers IA, qui n'exécutent pas le JS. Les faire passer par
 * le SPA rendait leur contenu invisible — le problème même que l'audit a relevé.
 * En prime : pas de route Wouter, pas de bundle en plus, pas de flash au chargement.
 *
 * Le style est inline à dessein : les classes Tailwind sont purgées à partir des
 * seuls fichiers de client/src, donc une classe écrite ici n'existerait pas dans
 * le CSS livré. Palette identique au thème (cf. CLAUDE.md).
 */

// Normalisation de casse partagée avec le client (A4) : les deux côtés doivent
// produire exactement le même nom, sinon Google — qui indexe le DOM après
// exécution du JS — retient la version client, non normalisée.
import { titleCase } from "@shared/display-name";

/**
 * Échappement HTML minimal. Défini ici plutôt qu'importé de static.ts : ce module
 * est le socle du rendu SEO, static.ts en dépend, et l'inverse ferait un cycle
 * d'imports que le bundle CJS n'aime pas.
 */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Profil praticien tel que les pages SEO en ont besoin. */
export type SeoProfile = {
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  bio: string | null;
  photoUrl: string | null;
  specialties: string[];
  createdAt: number;
  publicPageUpdatedAt: number | null;
  isDemo: boolean;
  services: { name: string; durationMinutes: number; priceCents: number; description: string | null }[];
};

export const BRAND = { primary: "#186749", accent: "#17EC9B", dark: "#1b4332" } as const;

/**
 * Nombre minimum de praticiens pour qu'une page ville existe (A2).
 *
 * Garde-fou anti-pénalité, pas un réglage esthétique : publier des pages ville à
 * un seul praticien sur un site santé (YMYL), c'est du thin content à l'échelle,
 * et Google le sanctionne plus durement sur la santé qu'ailleurs. La page ville
 * apparaît d'elle-même quand la ville atteint le seuil — l'annuaire suit
 * l'acquisition de praticiens, il ne la précède pas.
 */
export const MIN_PROFILES_PER_CITY = 3;

/**
 * Slug ASCII d'une ville : "Saint-Étienne" → "saint-etienne".
 * Pas d'accent dans un identifiant d'URL (convention projet).
 */
export function citySlug(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// (titleCase est importé en tête de fichier et ré-exporté ici pour les appelants
// qui l'attendaient dans ce module.)
export { titleCase };

/** Prix en centimes → "60 €" / "62,50 €". */
export function formatPrice(cents: number): string {
  const euros = cents / 100;
  return Number.isInteger(euros) ? `${euros} €` : `${euros.toFixed(2).replace(".", ",")} €`;
}

/**
 * Un profil est-il assez complet pour être indexé (A11) ?
 *
 * En dessous du seuil, la page reste accessible par son lien direct — la
 * praticienne peut la partager — mais elle sort du sitemap et de l'annuaire, et
 * part en noindex. Douze pages quasi vides sur un site santé, c'est le profil de
 * risque décrit en A2.
 */
export function isIndexable(p: SeoProfile): boolean {
  if (p.isDemo) return false;
  if (!p.city || !p.city.trim()) return false;
  if (p.specialties.length === 0) return false;
  if ((p.bio || "").trim().length < 300) return false;
  if (p.services.length === 0) return false;
  return true;
}

/** Ce qui manque à un profil pour être indexable — affiché dans l'éditeur. */
export function missingForIndexing(p: SeoProfile): string[] {
  const out: string[] = [];
  if (!p.city || !p.city.trim()) out.push("la ville du cabinet");
  if (p.specialties.length === 0) out.push("au moins une spécialité");
  if ((p.bio || "").trim().length < 300) out.push("une présentation d'au moins 300 caractères");
  if (p.services.length === 0) out.push("au moins une prestation active");
  return out;
}

/** Regroupe les profils indexables par ville, seuil MIN_PROFILES_PER_CITY appliqué. */
export function groupByCity(profiles: SeoProfile[]): Map<string, { city: string; profiles: SeoProfile[] }> {
  const byCity = new Map<string, { city: string; profiles: SeoProfile[] }>();
  for (const p of profiles) {
    if (!isIndexable(p) || !p.city) continue;
    const key = citySlug(p.city);
    if (!key) continue;
    const entry = byCity.get(key);
    if (entry) entry.profiles.push(p);
    else byCity.set(key, { city: titleCase(p.city), profiles: [p] });
  }
  // Array.from plutôt qu'une itération directe sur la Map : la cible TS du projet
  // est antérieure à es2015 côté downlevelIteration.
  for (const [key, entry] of Array.from(byCity.entries())) {
    if (entry.profiles.length < MIN_PROFILES_PER_CITY) byCity.delete(key);
  }
  return byCity;
}

// ─── Gabarit commun ───────────────────────────────────────────────────────────

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#f7faf9;line-height:1.65}
a{color:${BRAND.primary}}
.wrap{max-width:940px;margin:0 auto;padding:0 20px}
header.site{background:#fff;border-bottom:1px solid rgba(24,103,73,.12)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:16px;padding-bottom:16px;flex-wrap:wrap}
.brand{font-weight:800;font-size:19px;color:${BRAND.primary};text-decoration:none}
nav.site a{margin-left:18px;font-weight:700;font-size:15px;text-decoration:none}
.hero{background:linear-gradient(180deg,#eaf6f0 0%,#f7faf9 100%);padding:48px 0 36px}
h1{font-size:2.1rem;line-height:1.15;margin:0 0 14px;color:${BRAND.dark}}
h2{font-size:1.45rem;margin:36px 0 14px;color:${BRAND.dark}}
h3{font-size:1.1rem;margin:0 0 6px;color:${BRAND.dark}}
.lead{font-size:1.09rem;color:#41544d;max-width:660px;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:16px;margin:22px 0}
.card{background:#fff;border:1px solid rgba(24,103,73,.12);border-radius:14px;padding:18px;text-decoration:none;color:inherit;display:block}
.card p{margin:6px 0 0;font-size:14.5px;color:#41544d}
.tags{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px}
.tag{background:#eaf6f0;color:${BRAND.primary};border-radius:999px;padding:3px 11px;font-size:12.5px;font-weight:700}
.cta{display:inline-block;background:${BRAND.primary};color:#fff;font-weight:800;padding:13px 26px;border-radius:12px;text-decoration:none}
.cities{display:flex;flex-wrap:wrap;gap:9px;margin:16px 0 8px;padding:0;list-style:none}
.cities a{background:#fff;border:1px solid rgba(24,103,73,.18);border-radius:999px;padding:7px 15px;text-decoration:none;font-weight:700;font-size:14.5px}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:15px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid rgba(24,103,73,.12)}
th{color:${BRAND.dark}}
details{background:#fff;border:1px solid rgba(24,103,73,.12);border-radius:12px;padding:14px 18px;margin-bottom:10px}
summary{font-weight:800;cursor:pointer;color:${BRAND.dark}}
details p{margin:10px 0 0;color:#41544d}
footer.site{margin-top:52px;padding:26px 0 40px;border-top:1px solid rgba(24,103,73,.12);font-size:14px;color:#5d6f69}
@media(max-width:600px){h1{font-size:1.65rem}.hero{padding:32px 0 26px}}
`.trim();

/**
 * Enveloppe HTML complète d'une page SEO serveur.
 * `<meta charset>` en toute première balise (A13), canonical systématique (A5),
 * JSON-LD optionnel (A6).
 */
export function renderSeoPage(opts: {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: unknown;
  bodyHtml: string;
  noindex?: boolean;
}): string {
  const ld = opts.jsonLd
    ? `\n<script type="application/ld+json">${JSON.stringify(opts.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">${opts.noindex ? '\n<meta name="robots" content="noindex, follow">' : ""}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Naturo Pro">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(opts.canonical)}">
<meta property="og:image" content="https://app.ecole-naturo.fr/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<style>${PAGE_CSS}</style>${ld}
</head>
<body>
<header class="site"><div class="wrap">
  <a class="brand" href="/">Naturo Pro</a>
  <nav class="site">
    <a href="/naturopathes">Annuaire</a>
    <a href="/logiciel-naturopathe">Le logiciel</a>
    <a href="/register">Essai gratuit</a>
  </nav>
</div></header>
${opts.bodyHtml}
<footer class="site"><div class="wrap">
  Naturo Pro — le logiciel des naturopathes. <a href="/">Accueil</a> ·
  <a href="/naturopathes">Annuaire des naturopathes</a> ·
  <a href="/logiciel-naturopathe">Logiciel pour naturopathe</a>
</div></footer>
</body>
</html>`;
}

// ─── A2 — Annuaire ────────────────────────────────────────────────────────────

/** Carte d'un praticien, réutilisée par l'index et par les pages ville. */
function profileCard(p: SeoProfile): string {
  const name = titleCase(p.name);
  const tags = p.specialties.slice(0, 3).map((s) => `<span class="tag">${esc(s)}</span>`).join("");
  const bio = (p.bio || "").trim().replace(/\s+/g, " ");
  const extract = bio.length > 155 ? `${esc(bio.slice(0, 152))}…` : esc(bio);
  return `<a class="card" href="/p/${esc(p.slug)}">
  <h3>${esc(name)}</h3>
  <p><strong>Naturopathe${p.city ? ` à ${esc(titleCase(p.city))}` : ""}</strong></p>
  <p>${extract}</p>
  ${tags ? `<div class="tags">${tags}</div>` : ""}
</a>`;
}

export function renderDirectoryIndex(base: string, profiles: SeoProfile[]): string {
  const cities = groupByCity(profiles);
  const indexable = profiles.filter(isIndexable);
  const total = indexable.length;

  const cityList = Array.from(cities.entries())
    .sort((a, b) => b[1].profiles.length - a[1].profiles.length)
    .map(([slug, e]) => `<li><a href="/naturopathes/${esc(slug)}">${esc(e.city)} (${e.profiles.length})</a></li>`)
    .join("");

  const body = `<section class="hero"><div class="wrap">
  <h1>Annuaire des naturopathes</h1>
  <p class="lead">${total} naturopathe${total > 1 ? "s" : ""} ${total > 1 ? "prennent" : "prend"} rendez-vous en ligne
  sur Naturo Pro. Consultez leur présentation, leurs spécialités et leurs tarifs, puis réservez directement
  un créneau — sans créer de compte.</p>
</div></section>
<div class="wrap">
  ${cityList ? `<h2>Par ville</h2><ul class="cities">${cityList}</ul>` : ""}
  <h2>Tous les praticiens</h2>
  ${total === 0
    ? "<p class=\"lead\">Aucune fiche n'est publiée pour le moment.</p>"
    : `<div class="grid">${indexable.map(profileCard).join("\n")}</div>`}
  <h2>Vous êtes naturopathe ?</h2>
  <p class="lead">Créez votre page de réservation en ligne, gérez votre agenda, vos dossiers clients et
  votre facturation depuis un seul outil, pensé pour la naturopathie.</p>
  <p><a class="cta" href="/logiciel-naturopathe">Découvrir le logiciel</a></p>
</div>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Annuaire des naturopathes",
    url: `${base}/naturopathes`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: indexable.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${base}/p/${p.slug}`,
        name: titleCase(p.name),
      })),
    },
  };

  return renderSeoPage({
    title: "Annuaire des naturopathes — prendre rendez-vous en ligne | Naturo Pro",
    description: `Trouvez un naturopathe et réservez votre consultation en ligne. ${total} praticien${total > 1 ? "s" : ""} avec spécialités, tarifs et disponibilités à jour.`,
    canonical: `${base}/naturopathes`,
    jsonLd,
    bodyHtml: body,
    // Une page d'annuaire vide n'a rien à faire dans l'index de Google : elle
    // reviendrait d'elle-même en indexable dès la première fiche complète.
    noindex: total === 0,
  });
}

export function renderCityPage(base: string, city: string, slug: string, profiles: SeoProfile[]): string {
  const label = titleCase(city);
  const n = profiles.length;
  const body = `<section class="hero"><div class="wrap">
  <h1>Naturopathe à ${esc(label)}</h1>
  <p class="lead">${n} naturopathe${n > 1 ? "s" : ""} à ${esc(label)} ${n > 1 ? "reçoivent" : "reçoit"} sur
  rendez-vous et ${n > 1 ? "proposent" : "propose"} la réservation en ligne. Comparez les spécialités et les
  tarifs, puis choisissez votre créneau.</p>
  <p><a href="/naturopathes">← Tous les naturopathes</a></p>
</div></section>
<div class="wrap">
  <div class="grid">${profiles.map(profileCard).join("\n")}</div>
  <h2>Comment se passe une consultation de naturopathie à ${esc(label)} ?</h2>
  <p class="lead">La première séance est un bilan de vitalité : le praticien passe en revue votre hygiène de
  vie, votre alimentation, votre sommeil et votre niveau de stress, puis construit avec vous un programme
  d'hygiène de vie personnalisé. Comptez en général une heure à une heure et demie. La naturopathie est une
  approche de bien-être et de prévention : elle ne remplace ni un diagnostic ni un traitement médical.</p>
</div>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Naturopathe à ${label}`,
    url: `${base}/naturopathes/${slug}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: n,
      itemListElement: profiles.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${base}/p/${p.slug}`,
        name: titleCase(p.name),
      })),
    },
  };

  return renderSeoPage({
    title: `Naturopathe à ${label} — ${n} praticien${n > 1 ? "s" : ""}, rendez-vous en ligne | Naturo Pro`,
    description: `Trouvez un naturopathe à ${label} : ${n} praticien${n > 1 ? "s" : ""}, spécialités, tarifs et prise de rendez-vous en ligne directe.`,
    canonical: `${base}/naturopathes/${slug}`,
    jsonLd,
    bodyHtml: body,
  });
}

// ─── A8 — Page produit ────────────────────────────────────────────────────────

const FAQ: { q: string; a: string }[] = [
  {
    q: "Quel logiciel choisir quand on démarre en naturopathie ?",
    a: "Un outil qui couvre l'agenda, les dossiers clients et la facturation suffit à démarrer. L'erreur la plus courante est d'empiler un agenda, un tableur et un outil de facturation séparés : la double saisie coûte plus de temps que le logiciel n'en fait gagner. Naturo Pro réunit les trois, avec la page de réservation en ligne incluse.",
  },
  {
    q: "Combien coûte un logiciel pour naturopathe ?",
    a: "Le marché français se situe entre 15 et 40 € par mois selon les fonctions incluses. Naturo Pro s'essaie gratuitement, sans carte bancaire, et l'essai donne accès à toutes les fonctions.",
  },
  {
    q: "Peut-on gérer l'anamnèse dans le logiciel ?",
    a: "Oui. Le questionnaire d'anamnèse est envoyé au client avant la séance, il le remplit en ligne, et ses réponses arrivent directement dans son dossier. Vous n'avez plus à ressaisir un formulaire papier après la consultation.",
  },
  {
    q: "Mes clients peuvent-ils prendre rendez-vous seuls ?",
    a: "Oui. Chaque praticien dispose d'une page publique de réservation à son nom, avec ses prestations, ses tarifs et ses disponibilités réelles. Le client choisit son créneau, reçoit sa confirmation par email, et le rendez-vous apparaît dans votre agenda.",
  },
  {
    q: "Les données de santé de mes clients sont-elles protégées ?",
    a: "Les données sont hébergées en Europe, l'accès est protégé par mot de passe et chaque praticien ne voit que ses propres dossiers. Vous restez responsable du traitement de vos données clients au sens du RGPD ; le logiciel vous permet d'exporter ou de supprimer un dossier à tout moment.",
  },
  {
    q: "Est-ce que le logiciel gère la facturation et les forfaits ?",
    a: "Oui : facture PDF à votre en-tête, numérotation continue, forfaits de plusieurs séances, encaissement en ligne par Stripe si vous l'activez, et suivi de ce qui reste à régler.",
  },
];

export function renderSoftwarePage(base: string): string {
  const faqHtml = FAQ.map(
    (f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
  ).join("\n");

  const body = `<section class="hero"><div class="wrap">
  <h1>Logiciel pour naturopathe : agenda, dossiers clients et facturation</h1>
  <p class="lead">Naturo Pro est le logiciel de gestion pensé pour les naturopathes et les praticiens du
  bien-être. Agenda, réservation en ligne, anamnèse, comptes-rendus de séance, forfaits et facturation —
  au même endroit, en français, sans engagement.</p>
  <p><a class="cta" href="/register">Démarrer l'essai gratuit</a></p>
</div></section>
<div class="wrap">
  <h2>Ce que le logiciel prend en charge</h2>
  <table>
    <tr><th>Agenda et rendez-vous</th><td>Vue jour, semaine et mois, créneaux récurrents, jours bloqués, synchronisation Google Calendar, rappel automatique la veille par email.</td></tr>
    <tr><th>Réservation en ligne</th><td>Une page publique à votre nom, avec vos prestations, vos tarifs et vos disponibilités réelles. Le client réserve seul, vous recevez le rendez-vous.</td></tr>
    <tr><th>Dossiers clients</th><td>Fiche par client, historique des séances, documents, comptes-rendus, et questionnaire d'anamnèse rempli en ligne avant la consultation.</td></tr>
    <tr><th>Facturation</th><td>Facture PDF à votre en-tête, numérotation continue, forfaits de plusieurs séances, TVA optionnelle, encaissement par Stripe.</td></tr>
    <tr><th>Programmes et conseils</th><td>Programmes d'hygiène de vie réutilisables, base de solutions naturelles, réponses types pour vos échanges courants.</td></tr>
  </table>

  <h2>Pourquoi un logiciel spécialisé plutôt qu'un agenda généraliste</h2>
  <p class="lead">Un agenda généraliste sait poser un rendez-vous, mais il ne connaît ni l'anamnèse, ni le
  bilan de vitalité, ni le suivi d'un programme d'hygiène de vie sur plusieurs semaines. Résultat : le
  dossier client finit dans un tableur à côté, et la facturation dans un troisième outil. Naturo Pro est
  construit sur le déroulé réel d'un cabinet de naturopathie — du premier contact à la facture.</p>

  <h2>Combien ça coûte</h2>
  <p class="lead">L'essai est gratuit et ne demande pas de carte bancaire. Vous testez toutes les fonctions,
  y compris la page de réservation en ligne, avant de décider.</p>
  <p><a class="cta" href="/register">Créer mon compte gratuitement</a></p>

  <h2>Questions fréquentes</h2>
  ${faqHtml}

  <h2>Voir un exemple</h2>
  <p class="lead">Chaque praticien dispose d'une page publique de réservation.
  <a href="/naturopathes">Parcourez l'annuaire</a> pour voir à quoi elles ressemblent en conditions réelles.</p>
</div>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Naturo Pro",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${base}/logiciel-naturopathe`,
        inLanguage: "fr",
        description:
          "Logiciel de gestion pour naturopathes : agenda, réservation en ligne, dossiers clients, anamnèse, forfaits et facturation.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", description: "Essai gratuit, sans carte bancaire" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return renderSeoPage({
    title: "Logiciel pour naturopathe — agenda, clients et facturation | Naturo Pro",
    description:
      "Le logiciel de gestion des naturopathes : agenda, réservation en ligne, dossiers clients, anamnèse et facturation. En français, essai gratuit sans carte bancaire.",
    canonical: `${base}/logiciel-naturopathe`,
    jsonLd,
    bodyHtml: body,
  });
}

// ─── A1 — Corps pré-rendu de /p/{slug} ────────────────────────────────────────

/**
 * Contenu HTML injecté dans #root avant hydratation. React l'écrase au montage :
 * il n'existe que pour les crawlers qui n'exécutent pas le JS — c'est-à-dire tous
 * les crawlers IA, et Googlebot avant sa passe de rendu.
 *
 * Styles inline uniquement : ce balisage ne passe pas par Tailwind (classes purgées).
 */
export function renderProfileBody(p: SeoProfile): string {
  const name = titleCase(p.name);
  const where = [p.address, p.city ? titleCase(p.city) : null].filter(Boolean).join(" · ");
  const bio = (p.bio || "").trim();
  const specialties = p.specialties.length
    ? `<p><strong>Spécialités :</strong> ${p.specialties.map(esc).join(", ")}</p>`
    : "";
  const services = p.services.length
    ? `<h2 style="font-size:1.2rem;margin:22px 0 8px">Prestations</h2><ul>${p.services
        .map(
          (s) =>
            `<li><strong>${esc(s.name)}</strong> — ${s.durationMinutes} min · ${formatPrice(s.priceCents)}${
              s.description ? ` — ${esc(s.description.trim())}` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : "";

  return `<div style="max-width:760px;margin:0 auto;padding:28px 20px;font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.65">
  <h1 style="font-size:1.9rem;margin:0 0 4px;color:${BRAND.dark}">${esc(name)}</h1>
  <p style="margin:0 0 14px;font-weight:700;color:${BRAND.primary}">Naturopathe${p.city ? ` à ${esc(titleCase(p.city))}` : ""}</p>
  ${where ? `<p>${esc(where)}</p>` : ""}
  ${bio ? `<p>${esc(bio)}</p>` : ""}
  ${specialties}
  ${services}
  <p><a href="/naturopathes">Annuaire des naturopathes</a></p>
</div>`;
}

/**
 * Corps pré-rendu de l'ACCUEIL (A1 + A2).
 *
 * Sans lui, le HTML servi sur `/` se réduit à `<div id="root"></div>` : la landing
 * entière vit dans le bundle React. Conséquence relevée par le script de
 * vérification — les liens vers l'annuaire et la page produit n'existent que dans
 * le JS, donc aucun crawler sans rendu (tous les crawlers IA) ne les suit, et les
 * pages liées restent orphelines malgré le maillage ajouté côté React.
 *
 * Comme pour /p/:slug, React écrase ce bloc au montage.
 */
export function renderHomeBody(profileCount: number): string {
  return `<div style="max-width:760px;margin:0 auto;padding:28px 20px;font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.65">
  <h1 style="font-size:1.9rem;margin:0 0 10px;color:${BRAND.dark}">Naturo Pro — le logiciel des naturopathes</h1>
  <p>Agenda, réservation en ligne, dossiers clients, questionnaire d'anamnèse, forfaits et
  facturation : Naturo Pro réunit la gestion d'un cabinet de naturopathie dans un seul outil,
  en français, avec un essai gratuit sans carte bancaire.</p>
  <ul>
    <li><a href="/logiciel-naturopathe">Logiciel pour naturopathe : fonctions, tarifs et questions fréquentes</a></li>
    <li><a href="/naturopathes">Annuaire des naturopathes${profileCount > 0 ? ` — ${profileCount} praticien${profileCount > 1 ? "s" : ""}` : ""}</a></li>
    <li><a href="/register">Créer un compte et démarrer l'essai gratuit</a></li>
  </ul>
</div>`;
}

/** JSON-LD de l'accueil (A6) : l'éditeur et le produit. */
export function buildHomeJsonLd(base: string): unknown {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Naturo Pro",
        url: base,
        description: "Éditeur du logiciel de gestion Naturo Pro, destiné aux naturopathes et praticiens du bien-être.",
availableLanguage: "fr",
      },
      {
        "@type": "SoftwareApplication",
        name: "Naturo Pro",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: base,
        inLanguage: "fr",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", description: "Essai gratuit, sans carte bancaire" },
      },
    ],
  };
}

/** JSON-LD d'une page praticien (A6) : Person, plus LocalBusiness si adresse connue. */
export function buildProfileJsonLd(p: SeoProfile, url: string): unknown {
  const name = titleCase(p.name);
  const person: Record<string, unknown> = {
    "@type": "Person",
    name,
    jobTitle: "Naturopathe",
    url,
    knowsAbout: p.specialties.length ? p.specialties : undefined,
    description: (p.bio || "").trim().slice(0, 500) || undefined,
    image: p.photoUrl && /^https?:\/\//.test(p.photoUrl) ? p.photoUrl : undefined,
  };

  const graph: Record<string, unknown>[] = [
    { "@type": "ProfilePage", url, mainEntity: person },
  ];

  // LocalBusiness n'a de sens qu'avec un lieu réel : sans ville, il n'apporte rien
  // au pack local et donne à Google une entité incomplète.
  if (p.city) {
    graph.push({
      "@type": "HealthAndBeautyBusiness",
      name: `${name} — Naturopathe`,
      url,
      address: {
        "@type": "PostalAddress",
        streetAddress: p.address || undefined,
        addressLocality: titleCase(p.city),
        addressCountry: "FR",
      },
      image: p.photoUrl && /^https?:\/\//.test(p.photoUrl) ? p.photoUrl : undefined,
      makesOffer: p.services.map((s) => ({
        "@type": "Offer",
        name: s.name,
        price: (s.priceCents / 100).toFixed(2),
        priceCurrency: "EUR",
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
