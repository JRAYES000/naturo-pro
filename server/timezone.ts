/**
 * server/timezone.ts — fuseau horaire unique de l'application.
 *
 * Historique : le code manipulait les dates dans QUATRE référentiels différents.
 *   - Europe/Bucharest : emails (formatRdvDate), factures (année), crons
 *   - Europe/Paris     : sync Google Calendar, aperçu des templates, programmes
 *   - heure locale du process : calcul des créneaux (setHours/getDay)
 *   - UTC              : clé de jour des créneaux (toISOString().slice(0,10))
 *
 * Bucharest est UTC+2/+3, Paris UTC+1/+2 : une heure d'écart toute l'année, pour
 * une app destinée à des praticiens français. L'email de confirmation annonçait
 * 15h et l'événement Google Agenda 14h pour le même rendez-vous ; une facture
 * émise le 31 décembre à 23h30 heure de Paris était numérotée sur l'année suivante.
 *
 * ponytail: une constante unique suffit tant que les praticiens sont en France.
 * Le jour où ce n'est plus vrai, ajouter une colonne `timezone` sur users et la
 * passer en argument — tous les helpers ci-dessous acceptent déjà un `tz`.
 */

export const APP_TZ = "Europe/Paris";

// Intl.DateTimeFormat est coûteux à construire : un formateur par fuseau, réutilisé.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
}

/** Décompose un instant en composantes de date/heure LOCALES au fuseau. */
export function zonedParts(ms: number, tz: string = APP_TZ): ZonedParts {
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
  };
}

/** Décalage du fuseau à cet instant, en ms à ajouter à l'UTC pour obtenir l'heure locale. */
function offsetAt(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // formatToParts s'arrête à la seconde : on tronque des deux côtés pour comparer.
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Instant UTC correspondant à `year-month-day hour:minute` DANS le fuseau `tz`.
 *
 * Deux passes : la première estime le décalage à partir de la date naïve, la
 * seconde le recalcule à l'instant trouvé — ce qui corrige les bascules heure
 * d'été / heure d'hiver (le décalage change au milieu de la journée visée).
 */
export function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, tz: string = APP_TZ,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstPass = naive - offsetAt(naive, tz);
  return naive - offsetAt(firstPass, tz);
}

/** Clé de jour "YYYY-MM-DD" LOCALE (et non UTC, qui décalait les créneaux du soir). */
export function zonedDateKey(ms: number, tz: string = APP_TZ): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Heure locale "HH:MM" (remplace les new Date(x).getHours(), qui suivaient le fuseau du process). */
export function zonedTimeKey(ms: number, tz: string = APP_TZ): string {
  const p = zonedParts(ms, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Heure locale (0–23) — utilisée par les crons pour déclencher à l'heure choisie. */
export function zonedHour(ms: number = Date.now(), tz: string = APP_TZ): number {
  return zonedParts(ms, tz).hour;
}

export interface CivilDay { year: number; month: number; day: number; weekday: number }

/**
 * Énumère les jours CIVILS locaux couverts par [fromMs, toMs], bornes incluses.
 *
 * Le curseur avance en UTC sur des minuits civils : l'UTC n'a pas d'heure d'été,
 * donc `+ 86400000` change toujours d'exactement un jour de calendrier. L'ancienne
 * boucle ajoutait 24 h à un instant quelconque, ce qui, aux bascules DST, pouvait
 * produire deux fois le même jour local ou en sauter un.
 *
 * `weekday` est 0=dimanche … 6=samedi, comme `availability_slots.day_of_week`.
 *
 * ponytail: un tableau plutôt qu'un générateur — le `tsconfig` cible un ES trop bas
 * pour itérer un Generator sans downlevelIteration, et la fenêtre est bornée à
 * 91 jours (cf. clampSlotWindow), donc l'allocation est négligeable.
 */
export function zonedCivilDays(fromMs: number, toMs: number, tz: string = APP_TZ): CivilDay[] {
  const a = zonedParts(fromMs, tz);
  const b = zonedParts(toMs, tz);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  const jours: CivilDay[] = [];
  for (let cur = Date.UTC(a.year, a.month - 1, a.day); cur <= end; cur += 86400000) {
    const d = new Date(cur);
    jours.push({
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1,
      day: d.getUTCDate(), weekday: d.getUTCDay(),
    });
  }
  return jours;
}
