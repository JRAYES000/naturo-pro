/**
 * shared/plan-access.ts — modèle freemium à 2 niveaux (décisions 3-5 du 04/08/2026)
 *
 * Un seul palier payant : 19 €/mois, aucun supplément. Plans :
 *   - "trial"     : essai 30 j — accès complet tant que trialEndsAt > now
 *   - "active"    : abonnement payant — accès complet
 *   - "free"      : socle gratuit à vie (essai expiré ou abonnement résilié)
 *   - "suspended" : compte suspendu par l'admin — traité comme le socle gratuit
 *
 * Socle gratuit (décision 5, périmètre exact) : agenda · page publique de
 * réservation · 1 seule prestation/catégorie · gestion de RDV côté client
 * (/manage/:token) · fiche client réduite aux coordonnées · export RGPD.
 * Tout le reste est payant — en particulier toute donnée de santé (décision 6).
 */

export type PlanFields = { plan: string | null; trialEndsAt: number | null };

/** Accès complet : abonné payant, ou essai encore en cours. */
export function hasFullAccess(u: PlanFields | null | undefined, now = Date.now()): boolean {
  if (!u) return false;
  if (u.plan === "active") return true;
  if (u.plan === "trial") return !u.trialEndsAt || u.trialEndsAt > now;
  return false; // "free", "suspended", inconnu
}

/** Nombre de prestations/catégories autorisées sur le socle gratuit. */
export const FREE_CATEGORY_LIMIT = 1;

/**
 * Routes API réservées à l'abonnement. Le middleware de server/routes/index.ts
 * répond 402 (code PLAN_UPGRADE_REQUIRED) sur ces chemins pour un compte sans
 * accès complet — remplace l'essai chronométré tout-ou-rien (action 6).
 *
 * Jamais dans cette liste : auth, public, profile, billing, internal, admin,
 * clients (coordonnées), appointments (agenda), categories (cap à part),
 * availability — le socle gratuit de la décision 5.
 */
export const PAID_PATH_RE =
  /^\/api\/(invoices|programmes|anamnesis-templates|anamnesis-responses|reminders|email-templates|packages|google|solutions|discussions|content|stats|documents|notes|saved-replies)([/?]|$)|^\/api\/appointments\/\d+\/(note|send-reminder)([/?]|$)|^\/api\/clients\/\d+\/(notes|documents)([/?]|$)/;

/** Libellé de fonctionnalité déduit du chemin — alimente le corps du 402 et les analytics. */
export function paidFeatureFromPath(path: string): string {
  const m = path.match(/^\/api\/([a-z-]+)/);
  const seg = m ? m[1] : "fonctionnalite";
  if (seg === "appointments" || seg === "clients" || seg === "notes") return "notes-consultation";
  return seg;
}

/**
 * Champs santé / données étendues de la fiche client — hors socle gratuit
 * (décision 6 : la fiche gratuite se limite aux coordonnées nom/email/téléphone).
 */
export const CLIENT_HEALTH_FIELDS = [
  "dateOfBirth",
  "address",
  "postalCode",
  "city",
  "allergies",
  "antecedents",
  "lifestyleNotes",
  "penseBete",
  "heightCm",
  "weightKg",
] as const;

/**
 * Projection d'une fiche client selon le plan : en accès complet la fiche part
 * telle quelle ; sur le socle gratuit les champs santé sont neutralisés à null
 * (lecture) — et la même fonction sert à ignorer leur écriture (POST/PATCH).
 */
export function sanitizeClientForPlan<T extends Record<string, unknown>>(client: T, fullAccess: boolean): T {
  if (fullAccess) return client;
  const copy: Record<string, unknown> = { ...client };
  for (const f of CLIENT_HEALTH_FIELDS) {
    if (f in copy) copy[f] = null;
  }
  return copy as T;
}

/** Retire les champs santé d'un corps d'écriture (création/PATCH) en gratuit. */
export function stripClientHealthFields<T extends Record<string, unknown>>(body: T, fullAccess: boolean): T {
  if (fullAccess) return body;
  const copy: Record<string, unknown> = { ...body };
  for (const f of CLIENT_HEALTH_FIELDS) delete copy[f];
  return copy as T;
}
