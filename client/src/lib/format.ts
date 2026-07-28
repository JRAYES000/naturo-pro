/**
 * Fuseau du cabinet.
 *
 * Un rendez-vous a lieu au cabinet de la praticienne, en France. Les emails de
 * confirmation et de rappel sont rendus côté serveur en heure de Paris (cf.
 * server/timezone.ts). Le tunnel de réservation, lui, affichait les créneaux avec
 * `toLocaleTimeString()` sans fuseau, donc dans celui du NAVIGATEUR : une cliente en
 * outre-mer, expatriée, en déplacement, ou simplement avec un téléphone mal réglé
 * réservait « 11:00 » et recevait un email disant « 09:00 ». Les deux affichages
 * doivent parler du même instant dans le même fuseau.
 */
export const CABINET_TZ = "Europe/Paris";

/** Heure "HH:MM" au fuseau du cabinet. */
export function formatHeureCabinet(d: Date | string | number) {
  return new Date(d).toLocaleTimeString("fr-FR", {
    timeZone: CABINET_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
}

/** Date longue ("lundi 3 août 2026") au fuseau du cabinet. */
export function formatJourCabinet(d: Date | string | number) {
  return new Date(d).toLocaleDateString("fr-FR", {
    timeZone: CABINET_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** Date + heure au fuseau du cabinet. */
export function formatDateHeureCabinet(d: Date | string | number) {
  return new Date(d).toLocaleString("fr-FR", {
    timeZone: CABINET_TZ, dateStyle: "full", timeStyle: "short",
  });
}

/** Le navigateur de la visiteuse est-il sur un autre fuseau que le cabinet ? */
export function fuseauDifferentDuCabinet(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone !== CABINET_TZ;
  } catch {
    return false;
  }
}

export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
export function formatDate(d: Date | string | number) {
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}
export function formatDateShort(d: Date | string | number) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
export function formatTime(d: Date | string | number) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
export function formatDay(d: Date | string | number) {
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function durationLabel(min: number) {
  if (min >= 60) {
    const h = Math.floor(min / 60); const m = min % 60;
    return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  }
  return `${min} min`;
}
