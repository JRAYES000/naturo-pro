/**
 * server/routes/helpers/reminders.ts
 *
 * Rappels J-1 client + récap quotidien praticien, et helpers de temps local (TZ).
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 */

import {
  sendEmail, renderReminderEmail, renderRecapEmail, formatRdvDate,
  type RecapAppointmentRow,
} from "../../email";
import { renderUserTemplate } from "../../email-templates/render-user";
import type { TemplateVars } from "../../email-templates/render";
import { storage } from "../../storage";
import { getEmailConfigForUser } from "./email-sending";
import { genToken } from "./tokens";

const APP_URL = process.env.APP_URL || "https://app.ecole-naturo.fr";
export const TZ = "Europe/Bucharest";

/** Renvoie l'heure (0–23) actuelle dans le timezone donné. */
export function getLocalHour(tz = TZ, date = new Date()): number {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value || "0";
  return parseInt(h, 10);
}

/** Clé jour locale "YYYY-MM-DD" pour idempotence quotidienne du cron. */
export function getLocalDayKey(tz = TZ, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Renvoie [startMs, endMs] pour le "jour J + offsetDays" en TZ locale.
 * Ex: offsetDays=1 => demain 00:00:00 → demain 23:59:59.999 (en TZ)
 */
export function getLocalDayBounds(offsetDays: number, tz = TZ): { from: number; to: number } {
  const now = new Date();
  const target = new Date(now.getTime() + offsetDays * 86400000);
  const ymdParts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(target);
  const get = (t: string) => parseInt(ymdParts.find((p) => p.type === t)?.value || "0", 10);
  const y = get("year"), m = get("month"), d = get("day");
  // On construit un Date à minuit local en passant par une chaine ISO et l'offset TZ.
  // Approche fiable : on calcule la différence entre UTC et le timezone cible à cette date.
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Déterminer l'offset TZ à cet instant (en min)
  const probe = new Date(utcMidnight);
  const localHour = getLocalHour(tz, probe);
  // Si l'heure locale à utcMidnight n'est pas 0, on ajuste : minuit local = utcMidnight - localHour heures
  const from = utcMidnight - localHour * 3600 * 1000;
  const to = from + 86400000 - 1;
  return { from, to };
}

/**
 * Charge les données nécessaires pour rendre un email de rappel (catégorie + client).
 */
export async function buildReminderContext(appt: any, user: any) {
  const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
  let clientFirstName = appt.clientFirstName || "";
  let clientEmail = appt.clientEmail || null;
  let clientLastName = appt.clientLastName || "";
  if (appt.clientId) {
    const c = await storage.getClient(appt.clientId);
    if (c) {
      clientFirstName = c.firstName || clientFirstName;
      clientLastName = c.lastName || clientLastName;
      clientEmail = c.email || clientEmail;
    }
  }
  return { cat, clientFirstName, clientLastName, clientEmail, user };
}

/**
 * Envoie les rappels J-1 pour un user donné. Idempotent via reminderSent flag.
 * Renvoie { sent, skipped, errors } pour observability.
 */
export async function sendRemindersForUser(user: any): Promise<{ sent: number; skipped: number; errors: number; details: any[] }> {
  const out = { sent: 0, skipped: 0, errors: 0, details: [] as any[] };
  const cfg = getEmailConfigForUser(user);
  if (!cfg) { out.skipped++; return out; }

  const { from, to } = getLocalDayBounds(1);
  const appts = await storage.listAppointmentsForReminder(user.id, from, to);

  for (const a of appts) {
    try {
      const ctx = await buildReminderContext(a, user);
      if (!ctx.clientEmail) { out.skipped++; continue; }

      // Générer tokens si manquants
      let confirmToken = (a as any).confirmToken;
      let cancelToken = (a as any).cancelToken;
      const patch: any = { reminderSent: true, reminderSentAt: Date.now() };
      if (!confirmToken) { confirmToken = genToken(); patch.confirmToken = confirmToken; }
      if (!cancelToken) { cancelToken = genToken(); patch.cancelToken = cancelToken; }

      const dateText = formatRdvDate(a.startAt);
      // PHASE 3.5.5 : URL d'annulation pointe vers la page publique /manage (cohérence avec confirmation)
      const cancelUrlManage = `${APP_URL}/#/manage/${cancelToken}`;
      const fallback = renderReminderEmail({
        clientFirstName: ctx.clientFirstName || "",
        practitionerName: user.name || user.email || "",
        practitionerEmail: user.email,
        practitionerPhone: user.phone || null,
        rdvDateText: dateText,
        categoryName: ctx.cat?.name || null,
        durationMinutes: ctx.cat?.durationMinutes || null,
        priceCents: ctx.cat?.priceCents || null,
        location: a.location || ctx.cat?.location || null,
        paymentStatus: (a as any).paymentStatus || null,
        confirmUrl: `${APP_URL}/api/rdv/confirm/${confirmToken}`,
        cancelUrl: cancelUrlManage,
        notesBefore: a.notesBefore || null,
      });

      // PHASE 3.5.5 : try DB-editable template first, fallback hardcodé
      const startDate = new Date(a.startAt);
      const hh = String(startDate.getHours()).padStart(2, "0");
      const mm = String(startDate.getMinutes()).padStart(2, "0");
      const tplVars: TemplateVars = {
        "client.name": `${ctx.clientFirstName || ""} ${ctx.clientLastName || ""}`.trim(),
        "client.email": ctx.clientEmail || "",
        "appointment.date": dateText,
        "appointment.time": `${hh}:${mm}`,
        "appointment.duration": ctx.cat?.durationMinutes ? `${ctx.cat.durationMinutes} min` : "",
        "appointment.category": ctx.cat?.name || "",
        "appointment.address": a.location || ctx.cat?.location || "",
        "practitioner.name": user.name || user.email || "",
        "practitioner.email": user.email || "",
        "cancelLink": cancelUrlManage,
      };
      const userTpl = await renderUserTemplate(user.id, "reminder_d1", tplVars);
      const subject = userTpl?.subject ?? fallback.subject;
      const html = userTpl?.html ?? fallback.html;
      const text = fallback.text;

      const r = await sendEmail(cfg, ctx.clientEmail, subject, html, text);
      if (r.ok) {
        await storage.updateAppointment(a.id, patch);
        out.sent++;
        out.details.push({ apptId: a.id, to: ctx.clientEmail, ok: true, id: r.id });
      } else {
        out.errors++;
        out.details.push({ apptId: a.id, to: ctx.clientEmail, ok: false, error: r.error });
        console.error(`[reminder] failed user=${user.id} appt=${a.id}: ${r.error}`);
      }
    } catch (e: any) {
      out.errors++;
      out.details.push({ apptId: a.id, ok: false, error: e?.message || String(e) });
      console.error(`[reminder] exception user=${user.id} appt=${a.id}:`, e);
    }
  }
  return out;
}

/**
 * Envoie le récap quotidien à un user (sa propre adresse email).
 */
export async function sendDailyRecapForUser(user: any): Promise<{ ok: boolean; reason?: string; sent?: number }> {
  if (!user.dailyRecapEnabled) return { ok: false, reason: "disabled" };
  const cfg = getEmailConfigForUser(user);
  if (!cfg) return { ok: false, reason: "no-config" };
  if (!user.email) return { ok: false, reason: "no-recipient" };

  const { from, to } = getLocalDayBounds(0);
  const appts = await storage.listAppointments(user.id, from, to);
  appts.sort((a, b) => a.startAt - b.startAt);

  const rows: RecapAppointmentRow[] = [];
  for (const a of appts) {
    let clientName = a.clientFirstName || "";
    if (a.clientLastName) clientName += ` ${a.clientLastName}`;
    if (a.clientId) {
      const c = await storage.getClient(a.clientId);
      if (c) clientName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
    }
    const cat = a.categoryId ? await storage.getCategory(a.categoryId) : null;
    rows.push({
      startAtMs: a.startAt,
      endAtMs: a.endAt,
      clientName: clientName.trim() || "(sans nom)",
      categoryName: cat?.name || null,
      location: a.location || cat?.location || null,
      status: a.status ?? "",
      clientConfirmed: !!(a as any).clientConfirmedAt,
      clientCancelled: !!(a as any).clientCancelledAt,
    });
  }

  const dateText = formatRdvDate(Date.now()).split(" à ")[0]; // "jeudi 7 mai 2026"
  const { subject, html, text } = renderRecapEmail({
    practitionerFirstName: (user.name || user.email || "").split(" ")[0],
    dateText,
    rows,
    appUrl: APP_URL,
  });

  const r = await sendEmail(cfg, user.email, subject, html, text);
  if (r.ok) return { ok: true, sent: rows.length };
  console.error(`[recap] failed user=${user.id}: ${r.error}`);
  return { ok: false, reason: r.error };
}
