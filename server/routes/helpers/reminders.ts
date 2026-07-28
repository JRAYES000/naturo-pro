/**
 * server/routes/helpers/reminders.ts
 *
 * Rappels J-1 client + récap quotidien praticien, et helpers de temps local (TZ).
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 */

import {
  sendEmail, renderReminderEmail, renderRecapEmail, renderReviewRequestEmail,
  formatRdvDate, type RecapAppointmentRow,
} from "../../email";
import { renderUserTemplate } from "../../email-templates/render-user";
import type { TemplateVars } from "../../email-templates/render";
import { storage } from "../../storage";
import { getEmailConfigForUser } from "./email-sending";
import { genToken } from "./tokens";
import { APP_TZ, zonedHour, zonedDateKey, zonedParts, zonedTimeToUtc, zonedTimeKey } from "../../timezone";

const APP_URL = process.env.APP_URL || "https://app.ecole-naturo.fr";

/**
 * Fuseau des crons. Était figé sur Europe/Bucharest (celui du fondateur) alors que
 * les praticiens sont en France : « rappel à 10h » partait à 9h heure de Paris.
 * Délègue désormais à APP_TZ — source unique, cf. server/timezone.ts.
 */
export const TZ = APP_TZ;

/** Heure (0–23) locale au fuseau applicatif. */
export function getLocalHour(tz = TZ, date = new Date()): number {
  return zonedHour(date.getTime(), tz);
}

/** Clé jour locale "YYYY-MM-DD" pour idempotence quotidienne du cron. */
export function getLocalDayKey(tz = TZ, date = new Date()): string {
  return zonedDateKey(date.getTime(), tz);
}

/**
 * Renvoie [from, to] couvrant le jour civil « aujourd'hui + offsetDays » dans `tz`,
 * de minuit local à minuit local moins 1 ms.
 *
 * L'ancienne implémentation soustrayait `heureLocaleÀMinuitUTC × 3600000`, ce qui
 * n'est juste que pour les fuseaux à l'est de Greenwich et supposait une journée de
 * 24 h pile. Ici les deux bornes passent par zonedTimeToUtc : les jours de bascule
 * heure d'été / heure d'hiver (23 h ou 25 h) sont couverts exactement.
 */
export function getLocalDayBounds(offsetDays: number, tz = TZ): { from: number; to: number } {
  const today = zonedParts(Date.now(), tz);
  // Arithmétique en jours CIVILS via UTC (pas de DST en UTC) plutôt qu'en ms.
  const cible = new Date(Date.UTC(today.year, today.month - 1, today.day) + offsetDays * 86400000);
  const lendemain = new Date(cible.getTime() + 86400000);
  const minuit = (d: Date) =>
    zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
  return { from: minuit(cible), to: minuit(lendemain) - 1 };
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
  // Réglage « Rappels automatiques J-1 » : il était enregistré et affiché, mais AUCUN
  // code ne le lisait — la praticienne pouvait le couper, les rappels partaient quand même.
  if (user.emailRemindersEnabled === false) { out.skipped++; return out; }
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
      // Heure LOCALE au fuseau applicatif, et non celle du process (UTC en prod).
      const tplVars: TemplateVars = {
        "client.name": `${ctx.clientFirstName || ""} ${ctx.clientLastName || ""}`.trim(),
        "client.email": ctx.clientEmail || "",
        "appointment.date": dateText,
        "appointment.time": zonedTimeKey(a.startAt),
        "appointment.duration": ctx.cat?.durationMinutes ? `${ctx.cat.durationMinutes} min` : "",
        "appointment.category": ctx.cat?.name || "",
        "appointment.address": a.location || ctx.cat?.location || "",
        "appointment.meetLink": (a as any).googleMeetLink || "",
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

  // Idempotence EN BASE, une fois par jour local. C'était la seule tâche sans garde-fou
  // persistant : le garde-fou vivait en mémoire, dans une Map perdue à chaque
  // redémarrage — et Passenger recycle le process 4 à 5 fois par jour. Un cron externe
  // rejouerait donc le récap à chaque passage.
  const aujourdHui = getLocalDayKey();
  if (user.recapSentAt && getLocalDayKey(TZ, new Date(user.recapSentAt)) === aujourdHui) {
    return { ok: false, reason: "already-sent-today" };
  }

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
  if (r.ok) {
    await storage.updateUser(user.id, { recapSentAt: Date.now() } as any);
    return { ok: true, sent: rows.length };
  }
  console.error(`[recap] failed user=${user.id}: ${r.error}`);
  return { ok: false, reason: r.error };
}

/**
 * Envoie les demandes d'avis Google pour un user donné.
 * Cible : RDV terminés depuis ≥ 2 jours, avec email client, reviewEmailSentAt null.
 * Idempotent via reviewEmailSentAt.
 */
export async function sendReviewRequestsForUser(user: any): Promise<{ sent: number; skipped: number; errors: number }> {
  const out = { sent: 0, skipped: 0, errors: 0 };

  // Conditions préalables
  if (!user.reviewRequestEnabled) return out;
  if (!user.googleReviewUrl) return out;
  const cfg = getEmailConfigForUser(user);
  if (!cfg) return out;

  // beforeMs = maintenant - 2 jours
  const beforeMs = Date.now() - 2 * 86400000;
  const appts = await storage.listAppointmentsForReviewRequest(user.id, beforeMs);

  for (const a of appts) {
    try {
      // Résoudre l'email du client
      let clientEmail = a.clientEmail || null;
      let clientFirstName = a.clientFirstName || "";
      if (a.clientId) {
        const c = await storage.getClient(a.clientId);
        if (c) {
          clientEmail = c.email || clientEmail;
          clientFirstName = c.firstName || clientFirstName;
        }
      }
      if (!clientEmail) { out.skipped++; continue; }

      const { subject, html, text } = renderReviewRequestEmail({
        clientFirstName: clientFirstName || "cher(e) client(e)",
        practitionerName: user.name || user.email || "",
        googleReviewUrl: user.googleReviewUrl,
      });

      const res = await sendEmail(cfg, clientEmail, subject, html, text);
      if (res.ok) {
        await storage.updateAppointment(a.id, { reviewEmailSentAt: Date.now() } as any);
        out.sent++;
      } else {
        out.errors++;
        console.error(`[review-request] failed user=${user.id} appt=${a.id}: ${res.error}`);
      }
    } catch (e: any) {
      out.errors++;
      console.error(`[review-request] exception user=${user.id} appt=${a.id}:`, e);
    }
  }
  return out;
}
