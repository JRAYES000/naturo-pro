/**
 * client/src/lib/programmes.ts — logique pure de la page Programmes
 *
 * Filtres et tri de la liste, nettoyage des sections avant envoi, calendrier
 * des étapes (même calcul que `programStages` de server/portal.ts) et modèles
 * de départ du builder.
 */

// Recherche tolérante (« detox » trouve « Détox ») : même normalisation que la base de solutions.
import { normalizeText } from "./solutions-filter";
export { normalizeText };

export interface ProgramSection {
  section: string;
  items: string[];
  /** Durée de l'étape en jours (vide = conseils valables tout du long). */
  durationDays?: number | null;
}

export type ProgramStatus = "draft" | "sent";

export interface ProgramListItem {
  id: number;
  clientId: number | null;
  title: string;
  content: string;
  status: ProgramStatus;
  createdAt: number;
  updatedAt: number;
}

export type StatusFilter = "all" | ProgramStatus;
export type SortKey = "recent" | "title" | "client";

export function parseSections(raw: string): ProgramSection[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return parsed as ProgramSection[];
  } catch { /* contenu corrompu : liste vide */ }
  return [];
}


export function countByStatus(list: Pick<ProgramListItem, "status">[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: list.length, draft: 0, sent: 0 };
  for (const p of list) out[p.status]++;
  return out;
}

/**
 * Filtre (texte sur titre, cliente et noms de sections ; statut ; cliente) puis trie.
 * `clientName` résout le nom affiché d'une cliente (chaîne vide si aucune).
 */
export function filterPrograms<T extends ProgramListItem>(
  list: T[],
  opts: { query?: string; status?: StatusFilter; clientId?: number | null; sort?: SortKey },
  clientName: (id: number | null) => string,
): T[] {
  const q = normalizeText(opts.query ?? "");
  const words = q ? q.split(/\s+/) : [];
  const status = opts.status ?? "all";
  const filtered = list.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (opts.clientId != null && p.clientId !== opts.clientId) return false;
    if (!words.length) return true;
    const hay = normalizeText(
      [p.title, clientName(p.clientId), ...parseSections(p.content).map((s) => s.section)].join(" "),
    );
    return words.every((w) => hay.includes(w));
  });
  const sort = opts.sort ?? "recent";
  return filtered.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
    if (sort === "client") {
      const ca = clientName(a.clientId), cb = clientName(b.clientId);
      // Programmes sans cliente en fin de liste.
      if (!ca !== !cb) return ca ? -1 : 1;
      const c = ca.localeCompare(cb, "fr", { sensitivity: "base" });
      if (c) return c;
    }
    return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
  });
}

/**
 * Prépare le contenu avant envoi : titres et conseils rognés, conseils vides
 * retirés (le serveur refuse une chaîne vide), sections sans nom retirées.
 */
export function cleanSections(sections: ProgramSection[]): ProgramSection[] {
  return sections
    .map((s) => ({
      ...s,
      section: s.section.trim(),
      items: s.items.map((it) => it.trim()).filter(Boolean),
      durationDays: s.durationDays && s.durationDays > 0 ? Math.min(365, Math.floor(s.durationDays)) : null,
    }))
    .filter((s) => s.section);
}

/** Sections ignorées à l'enregistrement : sans nom mais avec au moins un conseil saisi. */
export function untitledSectionsWithContent(sections: ProgramSection[]): number {
  return sections.filter((s) => !s.section.trim() && s.items.some((it) => it.trim())).length;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Bornes incluses de chaque étape datée (null si non datée), comme le portail cliente. */
export function stageSchedule(
  sections: ProgramSection[],
  startDate: string | null | undefined,
): Array<{ start: string; end: string } | null> {
  let cursor = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;
  return sections.map((s) => {
    const dur = s.durationDays && s.durationDays > 0 ? Math.floor(s.durationDays) : null;
    if (!cursor || !dur) return null;
    const start = cursor;
    cursor = addDays(cursor, dur);
    return { start, end: addDays(start, dur - 1) };
  });
}

/** Date de fin du programme daté (dernière étape), ou null. */
export function programEndDate(sections: ProgramSection[], startDate: string | null | undefined): string | null {
  const ends = stageSchedule(sections, startDate).filter((x): x is { start: string; end: string } => !!x);
  return ends.length ? ends[ends.length - 1].end : null;
}

export function formatDayFR(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Déplace l'élément `from` d'un cran (`dir` = -1 vers le haut, 1 vers le bas). */
export function moveItem<T>(list: T[], from: number, dir: -1 | 1): T[] {
  const to = from + dir;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

// ── Modèles de départ ─────────────────────────────────────────────────────────

export interface ProgramTemplate {
  id: string;
  label: string;
  description: string;
  title: string;
  sections: () => ProgramSection[];
}

// Conseils succincts, inspirés des programmes d'hygiène de vie naturopathiques
// courants ; tous modifiables avant envoi.
export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: "equilibre",
    label: "Hygiène de vie générale",
    description: "Alimentation, plantes, activité physique, stress : la base la plus courante.",
    title: "Programme d'hygiène de vie",
    sections: () => [
      { section: "Alimentation", items: [
        "Privilégiez une assiette riche en légumes (crus et cuits) à chaque repas et réduisez les sucres raffinés et les produits ultra-transformés.",
        "Intégrez de bonnes graisses, notamment des oméga-3 (poissons gras, huiles de colza et de lin, noix).",
        "Mangez dans le calme, en mâchant lentement et à horaires réguliers, pour soutenir la digestion.",
      ] },
      { section: "Phytothérapie", items: [
        "En soirée, une infusion de camomille ou de mélisse aide à apaiser le système nerveux et à faciliter la digestion.",
        "Les plantes de soutien s'utilisent en cure progressive de 2 à 3 semaines.",
        "À adapter au terrain : demandez conseil en cas de grossesse, d'allaitement ou de traitement médicamenteux.",
      ] },
      { section: "Activité physique", items: [
        "Visez 20 à 30 minutes de marche par jour, idéalement à l'extérieur et à la lumière naturelle.",
        "Ajoutez 1 à 2 séances douces par semaine (yoga, étirements, renforcement léger) selon vos capacités.",
        "Bougez régulièrement dans la journée plutôt que de façon intense et ponctuelle.",
      ] },
      { section: "Gestion du stress", items: [
        "Accordez-vous 10 à 20 minutes par jour de pratique apaisante : cohérence cardiaque, respiration, méditation ou sophrologie.",
        "Préservez votre sommeil : couchez-vous avant 23h et éteignez les écrans au moins 1h avant.",
        "Identifiez les sources de stress évitables et limitez-les progressivement.",
      ] },
    ],
  },
  {
    id: "etapes",
    label: "Cure par étapes",
    description: "Détox douce 7 jours, puis revitalisation 21 jours : la cliente suit l'étape du jour.",
    title: "Cure saisonnière par étapes",
    sections: () => [
      { section: "Étape 1 — Détox douce", durationDays: 7, items: [
        "Commencez la journée par un grand verre d'eau tiède, éventuellement avec un filet de citron.",
        "Allégez les repas du soir : soupe de légumes, légumes vapeur, peu de protéines animales.",
        "Supprimez alcool, café en excès et produits ultra-transformés pendant cette étape.",
      ] },
      { section: "Étape 2 — Revitalisation", durationDays: 21, items: [
        "Réintroduisez progressivement des protéines de qualité (œufs, légumineuses, petits poissons).",
        "Misez sur les aliments riches en minéraux : oléagineux, légumes verts, algues, céréales complètes.",
        "Reprenez une activité physique régulière, en augmentant l'intensité semaine après semaine.",
      ] },
      { section: "Tout au long de la cure", items: [
        "Buvez 1,5 L d'eau par jour, en dehors des repas.",
        "Couchez-vous à heure régulière pour soutenir la récupération.",
      ] },
    ],
  },
  {
    id: "sommeil",
    label: "Sommeil et stress",
    description: "Rituels du soir, respiration et plantes apaisantes.",
    title: "Programme sommeil et gestion du stress",
    sections: () => [
      { section: "Rituel du soir", items: [
        "Éteignez les écrans au moins 1h avant le coucher et tamisez les lumières.",
        "Dînez léger, au moins 2h avant de vous coucher.",
        "Couchez-vous dès les premiers signes de fatigue, à heure régulière.",
      ] },
      { section: "Respiration et détente", items: [
        "Pratiquez la cohérence cardiaque 3 fois par jour : 6 respirations par minute pendant 5 minutes.",
        "Au coucher, un scan corporel ou une relaxation guidée de 10 minutes facilite l'endormissement.",
      ] },
      { section: "Plantes apaisantes", items: [
        "Infusion de tilleul, de verveine ou de passiflore en soirée.",
        "À adapter au terrain : demandez conseil en cas de grossesse, d'allaitement ou de traitement médicamenteux.",
      ] },
    ],
  },
  {
    id: "digestion",
    label: "Confort digestif",
    description: "Mastication, rythme des repas et soutien du microbiote.",
    title: "Programme confort digestif",
    sections: () => [
      { section: "Habitudes de repas", items: [
        "Mâchez chaque bouchée longuement et posez la fourchette entre deux bouchées.",
        "Prenez vos repas à horaires réguliers, assise et au calme.",
        "Évitez de boire en grande quantité pendant les repas.",
      ] },
      { section: "Alimentation", items: [
        "Privilégiez les légumes cuits si les crudités sont mal tolérées.",
        "Intégrez des aliments lacto-fermentés en petite quantité (choucroute crue, kéfir, miso).",
        "Limitez les aliments qui vous ballonnent et notez vos réactions dans un carnet.",
      ] },
      { section: "Plantes et soutien", items: [
        "Une infusion de fenouil, de menthe poivrée ou de gingembre après les repas.",
        "À adapter au terrain : demandez conseil en cas de grossesse, d'allaitement ou de traitement médicamenteux.",
      ] },
    ],
  },
  {
    id: "vierge",
    label: "Page blanche",
    description: "Une section vide, à construire vous-même.",
    title: "Programme d'hygiène de vie",
    sections: () => [{ section: "", items: [""] }],
  },
];
