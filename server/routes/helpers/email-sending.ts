/**
 * server/routes/helpers/email-sending.ts
 *
 * Config email par praticien + envoi de l'email de confirmation de booking (+ .ics).
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 */

import { storage } from "../../storage";
import {
  sendEmail, getSystemEmailConfig, formatRdvDate,
  type EmailConfig,
} from "../../email";
import { buildIcsForAppointment } from "../../ics";
import { renderConfirmationEmail } from "../../email-templates/confirmation";
import { renderUserTemplate } from "../../email-templates/render-user";
import type { TemplateVars } from "../../email-templates/render";
import { zonedTimeKey } from "../../timezone";

export function getEmailConfigForUser(u: any): EmailConfig | null {
  if (!u?.resendApiKey || !u?.emailFromAddress) return null;
  return {
    apiKey: u.resendApiKey,
    fromAddress: u.emailFromAddress,
    fromName: u.emailFromName || u.name || null,
  };
}

/**
 * Envoie un email de confirmation de RDV au client avec un fichier .ics en pièce jointe.
 *
 * Signature : sendBookingConfirmationEmail(user, appt, cat) => Promise<void>
 *
 * @param user  - L'utilisateur praticien (doit avoir resendApiKey + emailFromAddress,
 *                ou le système utilisera RESEND_API_KEY / SYSTEM_FROM_EMAIL).
 * @param appt  - L'objet appointment créé (doit avoir clientEmail non-null).
 * @param cat   - La catégorie (prestation) du RDV.
 *
 * Appelé depuis POST /api/public/:slug/book après création réussie du RDV.
 * Un échec d'envoi est logé mais n'interrompt PAS la réponse HTTP au client.
 */
export async function sendBookingConfirmationEmail(
  user: any,
  appt: any,
  cat: any,
): Promise<void> {
  const clientEmail: string | null = appt.clientEmail || null;
  if (!clientEmail) return; // pas d'email, rien à faire

  // Choisir la config email : clé du praticien si disponible, sinon clé système
  let cfg: EmailConfig | null = null;
  if (user?.resendApiKey && user?.emailFromAddress) {
    cfg = {
      apiKey: user.resendApiKey,
      fromAddress: user.emailFromAddress,
      fromName: user.emailFromName || user.name || null,
    };
  } else {
    cfg = getSystemEmailConfig();
  }

  if (!cfg) {
    console.warn("[booking-confirm] Aucune config email disponible — confirmation non envoyée pour appt", appt.id);
    return;
  }

  const practitionerName = user.name || user.email || "Votre praticien";
  const clientFirstName = appt.clientFirstName || "Client";
  const rdvDateText = formatRdvDate(appt.startAt);
  const durationMin: number = cat?.durationMinutes ?? 60;
  const location: string | null = appt.location || cat?.location || null;

  // PHASE 3.5 — génère/récupère le cancelToken pour l'URL publique de gestion (annul/report)
  let cancelUrl: string | null = null;
  try {
    const tk = await storage.ensureCancelToken(appt.id);
    if (tk) {
      const baseUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
      cancelUrl = `${baseUrl}/#/manage/${tk}`;
    }
  } catch (e) {
    console.warn("[booking-confirm] ensureCancelToken échec:", (e as any)?.message);
  }

  // Générer le fichier .ics
  const icsContent = buildIcsForAppointment({
    uid: `${appt.id}@app.ecole-naturo.fr`,
    startMs: appt.startAt,
    durationMin,
    summary: `${practitionerName} — Consultation`,
    description: `${cat?.name || "Consultation"}\\nPraticien : ${practitionerName}`,
    location: location ?? undefined,
    organizerName: practitionerName,
    organizerEmail: user.email || cfg.fromAddress,
    attendeeName: `${clientFirstName} ${appt.clientLastName || ""}`.trim(),
    attendeeEmail: clientEmail,
  });

  // Générer le template HTML — PHASE 3.5.5 : try DB-editable template first, fallback hardcodé
  const fallback = renderConfirmationEmail({
    clientFirstName,
    practitionerName,
    practitionerEmail: user.email || null,
    practitionerPhone: user.phone || null,
    rdvDateText,
    durationMinutes: durationMin,
    categoryName: cat?.name || null,
    location,
    cancelUrl,
  });

  // Heure LOCALE au fuseau applicatif, et non celle du process (UTC en production).
  // Troisième copie de ce calcul dans le code — celle de l'email de CONFIRMATION,
  // le tout premier que reçoit le client.
  const tplVars: TemplateVars = {
    "client.name": `${clientFirstName} ${appt.clientLastName || ""}`.trim(),
    "client.email": clientEmail || "",
    "appointment.date": rdvDateText,
    "appointment.time": zonedTimeKey(appt.startAt),
    "appointment.duration": `${durationMin} min`,
    "appointment.category": cat?.name || "",
    "appointment.address": location || "",
    "appointment.meetLink": appt.googleMeetLink || "",
    "practitioner.name": practitionerName,
    "practitioner.email": user.email || "",
    "cancelLink": cancelUrl || "",
  };
  const userTpl = await renderUserTemplate(user.id, "confirmation", tplVars);
  const subject = userTpl?.subject ?? fallback.subject;
  const html = userTpl?.html ?? fallback.html;
  const text = fallback.text; // version text-only conservée du fallback

  try {
    const result = await sendEmail(cfg, clientEmail, subject, html, text, [
      {
        filename: "rdv.ics",
        content: Buffer.from(icsContent).toString("base64"),
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      },
    ]);
    if (result.ok) {
      console.log(`[booking-confirm] Email envoyé à ${clientEmail} pour appt ${appt.id} (id=${result.id})`);
    } else {
      console.error(`[booking-confirm] Resend error pour appt ${appt.id}: ${result.error}`);
    }
  } catch (e: any) {
    console.error(`[booking-confirm] Exception pour appt ${appt.id}:`, e?.message || e);
  }
}

// ─── Notification praticienne : nouvelle réservation en ligne (Lot 3) ─────────
// La praticienne n'était prévenue qu'en cas d'annulation ou de report : sans
// synchro Google Agenda, une réservation pouvait passer totalement inaperçue.

/** Config praticien si complète, sinon clé système — même règle que la confirmation client. */
export function getEmailConfigOrSystem(u: any): EmailConfig | null {
  return getEmailConfigForUser(u) ?? getSystemEmailConfig();
}

function escapeHtmlLocal(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Rendu pur de la notification (testé) — sujet + HTML + texte. */
export function renderNewBookingNotification(opts: {
  clientName: string;
  rdvDateText: string;
  categoryName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  depositCents?: number | null;
  appUrl?: string;
}): { subject: string; html: string; text: string } {
  const nom = opts.clientName.trim() || "(cliente inconnue)";
  const appUrl = opts.appUrl || process.env.APP_URL || "https://app.ecole-naturo.fr";
  const subject = `Nouvelle réservation — ${nom}, ${opts.rdvDateText}`;
  const lignes: string[] = [];
  if (opts.categoryName) lignes.push(`Prestation : ${opts.categoryName}`);
  if (opts.clientEmail) lignes.push(`Email : ${opts.clientEmail}`);
  if (opts.clientPhone) lignes.push(`Téléphone : ${opts.clientPhone}`);
  if (opts.depositCents && opts.depositCents > 0) {
    lignes.push(`Acompte réglé en ligne : ${(opts.depositCents / 100).toFixed(2).replace(".", ",")} €`);
  }
  const html =
    `<p>Bonjour,</p>` +
    `<p><strong>${escapeHtmlLocal(nom)}</strong> vient de réserver un rendez-vous le ` +
    `<strong>${escapeHtmlLocal(opts.rdvDateText)}</strong>.</p>` +
    (lignes.length ? `<p>${lignes.map(escapeHtmlLocal).join("<br>")}</p>` : "") +
    `<p><a href="${appUrl}/#/app/agenda">Voir mon agenda</a></p>`;
  const text = `${nom} vient de réserver un rendez-vous le ${opts.rdvDateText}.\n` +
    (lignes.length ? lignes.join("\n") + "\n" : "") + `${appUrl}/#/app/agenda`;
  return { subject, html, text };
}

/** Envoie la notification à la praticienne. Échec logué, jamais bloquant. */
export async function sendNewBookingNotificationEmail(
  user: any,
  appt: any,
  cat: any,
  opts?: { depositCents?: number | null },
): Promise<void> {
  if (!user?.email) return;
  const cfg = getEmailConfigOrSystem(user);
  if (!cfg) {
    console.warn("[booking-notif] aucune config email — praticienne non notifiée pour appt", appt.id);
    return;
  }
  const { subject, html, text } = renderNewBookingNotification({
    clientName: `${appt.clientFirstName || ""} ${appt.clientLastName || ""}`.trim(),
    rdvDateText: formatRdvDate(appt.startAt),
    categoryName: cat?.name || null,
    clientEmail: appt.clientEmail || null,
    clientPhone: appt.clientPhone || null,
    depositCents: opts?.depositCents ?? appt.depositAmountCents ?? null,
  });
  const r = await sendEmail(cfg, user.email, subject, html, text);
  if (!r.ok) console.error(`[booking-notif] échec pour appt ${appt.id}: ${r.error}`);
}
