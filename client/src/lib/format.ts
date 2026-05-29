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
