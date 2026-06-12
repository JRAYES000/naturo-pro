// ─────────────────────────────────────────────────────────────────────────────
// Email module — Resend wrapper + templates HTML pour Naturo Pro
// Phase 0.7 — Rappels J-1 + récap quotidien praticienne
// ─────────────────────────────────────────────────────────────────────────────
import { Resend } from "resend";
import type { Appointment, AppointmentCategory, Client, User } from "@shared/schema";

// Cache des instances Resend par clé (une praticienne = une clé)
const resendCache = new Map<string, Resend>();

function getResend(apiKey: string): Resend {
  let inst = resendCache.get(apiKey);
  if (!inst) {
    inst = new Resend(apiKey);
    resendCache.set(apiKey, inst);
  }
  return inst;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export interface EmailConfig {
  apiKey: string;
  fromAddress: string;
  fromName?: string | null;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string; // Buffer ou base64
  contentType?: string;
}

/**
 * Envoi bas-niveau d'un email via Resend (avec pièces jointes optionnelles).
 */
export async function sendEmail(
  cfg: EmailConfig,
  to: string,
  subject: string,
  html: string,
  text?: string,
  attachments?: EmailAttachment[],
): Promise<SendResult> {
  if (!cfg.apiKey || !cfg.fromAddress) {
    return { ok: false, error: "Configuration email incomplète" };
  }
  try {
    const resend = getResend(cfg.apiKey);
    const from = cfg.fromName
      ? `${cfg.fromName} <${cfg.fromAddress}>`
      : cfg.fromAddress;
    const payload: any = { from, to, subject, html, text };
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
        contentType: a.contentType,
      }));
    }
    const res = await resend.emails.send(payload);
    if ((res as any)?.error) {
      return { ok: false, error: String((res as any).error.message || (res as any).error) };
    }
    const id = (res as any)?.data?.id || "ok";
    return { ok: true, id };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(cents: number | null | undefined): string {
  if (!cents) return "—";
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

const FR_DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const FR_MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * Formate une date ms epoch dans le timezone Europe/Bucharest pour affichage humain.
 * Ex: "vendredi 8 mai 2026 à 14h30"
 */
export function formatRdvDate(startAtMs: number, tz = "Europe/Bucharest"): string {
  const d = new Date(startAtMs);
  // On utilise toLocaleString pour récupérer les composants en TZ cible
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const weekday = get("weekday");
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  return `${weekday} ${day} ${month} ${year} à ${hour}h${minute}`;
}

/** Récupère "HH:MM" dans un TZ donné */
export function formatRdvTime(startAtMs: number, tz = "Europe/Bucharest"): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(startAtMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("hour")}h${get("minute")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates HTML
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_BASE_STYLES = `
  body { margin: 0; padding: 0; background-color: #f7faf9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
  .card { background: #ffffff; border-radius: 12px; padding: 32px 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  h1 { font-size: 22px; font-weight: 700; color: #186749; margin: 0 0 16px; }
  h2 { font-size: 16px; font-weight: 600; color: #186749; margin: 24px 0 8px; }
  p { font-size: 15px; line-height: 1.55; margin: 0 0 12px; }
  .info { background: #f7faf9; border-left: 3px solid #186749; padding: 14px 16px; border-radius: 6px; margin: 16px 0; font-size: 14px; }
  .info strong { color: #186749; }
  .btn-row { margin: 28px 0 8px; text-align: center; }
  .btn { display: inline-block; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; text-decoration: none; margin: 0 6px 8px; }
  .btn-primary { background: #186749; color: #ffffff; }
  .btn-secondary { background: #f0f5f3; color: #186749; border: 1px solid #d6e0dc; }
  .footer { font-size: 12px; color: #6b7a76; text-align: center; margin-top: 24px; padding: 12px; }
  .footer a { color: #6b7a76; }
  table.recap { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  table.recap th { text-align: left; padding: 8px; background: #f7faf9; color: #186749; font-weight: 600; border-bottom: 2px solid #d6e0dc; }
  table.recap td { padding: 10px 8px; border-bottom: 1px solid #eef2f0; vertical-align: top; }
  table.recap tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-confirmed { background: #d1f0e0; color: #186749; }
  .badge-pending   { background: #fff4d6; color: #8b6500; }
  .badge-cancelled { background: #fde2e2; color: #a83232; }
`;

function emailShell(title: string, bodyHtml: string, footerNote?: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${EMAIL_BASE_STYLES}</style>
</head><body>
<div class="wrap">
  <div class="card">${bodyHtml}</div>
  <div class="footer">${footerNote ? footerNote : "Email automatique — merci de ne pas répondre."}</div>
</div>
</body></html>`;
}

// ─── Template : Rappel J-1 client ────────────────────────────────────────────
export interface ReminderTemplateData {
  clientFirstName: string;
  practitionerName: string;
  practitionerEmail?: string | null;
  practitionerPhone?: string | null;
  rdvDateText: string;        // "vendredi 8 mai 2026 à 14h30"
  categoryName?: string | null;
  durationMinutes?: number | null;
  priceCents?: number | null;
  location?: string | null;
  paymentStatus?: string | null;
  confirmUrl: string;
  cancelUrl: string;
  notesBefore?: string | null;
}

export function renderReminderEmail(d: ReminderTemplateData): { subject: string; html: string; text: string } {
  const subject = `Rappel : votre rendez-vous demain (${d.rdvDateText.split(" à ")[1] || ""})`;
  const priceStr = d.priceCents ? formatPrice(d.priceCents) : null;
  const paymentLabel: Record<string, string> = {
    paid: "Payé",
    partial: "Acompte versé",
    unpaid: "Non payé",
  };
  const paymentStr = d.paymentStatus ? paymentLabel[d.paymentStatus] || "Non payé" : null;

  const body = `
    <h1>Bonjour ${escapeHtml(d.clientFirstName)},</h1>
    <p>Petit rappel : nous nous voyons <strong>demain</strong> pour votre rendez-vous.</p>

    <div class="info">
      <p><strong>Date</strong> : ${escapeHtml(d.rdvDateText)}</p>
      ${d.categoryName ? `<p><strong>Prestation</strong> : ${escapeHtml(d.categoryName)}${d.durationMinutes ? ` — ${d.durationMinutes} min` : ""}${priceStr ? ` — ${priceStr}` : ""}</p>` : ""}
      ${d.location ? `<p><strong>Lieu</strong> : ${escapeHtml(d.location)}</p>` : ""}
      ${paymentStr ? `<p><strong>Paiement</strong> : ${escapeHtml(paymentStr)}</p>` : ""}
    </div>

    <p>Pouvez-vous me confirmer votre présence ?</p>

    <div class="btn-row">
      <a href="${escapeHtml(d.confirmUrl)}" class="btn btn-primary">✓ Je confirme</a>
      <a href="${escapeHtml(d.cancelUrl)}" class="btn btn-secondary">Annuler le rendez-vous</a>
    </div>

    <h2>À très vite,</h2>
    <p style="margin-top:0;">${escapeHtml(d.practitionerName)}<br>
    ${d.practitionerEmail ? `<a href="mailto:${escapeHtml(d.practitionerEmail)}" style="color:#186749;">${escapeHtml(d.practitionerEmail)}</a>` : ""}
    ${d.practitionerPhone ? ` — ${escapeHtml(d.practitionerPhone)}` : ""}</p>
  `;

  const html = emailShell(
    subject,
    body,
    `Si les boutons ne fonctionnent pas, copiez ce lien : ${d.confirmUrl}`,
  );

  const text = [
    `Bonjour ${d.clientFirstName},`,
    ``,
    `Petit rappel : nous nous voyons demain pour votre rendez-vous.`,
    ``,
    `Date : ${d.rdvDateText}`,
    d.categoryName ? `Prestation : ${d.categoryName}${d.durationMinutes ? ` (${d.durationMinutes} min)` : ""}${priceStr ? ` — ${priceStr}` : ""}` : "",
    d.location ? `Lieu : ${d.location}` : "",
    paymentStr ? `Paiement : ${paymentStr}` : "",
    ``,
    `✓ Confirmer : ${d.confirmUrl}`,
    `✗ Annuler : ${d.cancelUrl}`,
    ``,
    `À très vite,`,
    d.practitionerName,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

// ─── Template : Récap quotidien praticienne ─────────────────────────────────
export interface RecapAppointmentRow {
  startAtMs: number;
  endAtMs: number;
  clientName: string;
  categoryName?: string | null;
  location?: string | null;
  status: "confirmed" | "blocked" | "cancelled" | "completed" | string;
  clientConfirmed: boolean;
  clientCancelled: boolean;
}

export interface RecapTemplateData {
  practitionerFirstName: string;
  dateText: string;        // "jeudi 7 mai 2026"
  rows: RecapAppointmentRow[];
  appUrl: string;          // pour lien "Ouvrir mon agenda"
}

export function renderRecapEmail(d: RecapTemplateData): { subject: string; html: string; text: string } {
  const subject = `Vos rendez-vous du jour — ${d.dateText}`;

  const tableRows = d.rows.length === 0
    ? `<tr><td colspan="4" style="text-align:center; color:#6b7a76; padding:20px;">Aucun rendez-vous prévu aujourd'hui.</td></tr>`
    : d.rows.map((r) => {
        const time = formatRdvTime(r.startAtMs);
        const endTime = formatRdvTime(r.endAtMs);
        let badge = "";
        if (r.status === "blocked") {
          badge = `<span class="badge badge-pending">Bloqué</span>`;
        } else if (r.status === "cancelled" || r.clientCancelled) {
          badge = `<span class="badge badge-cancelled">Annulé</span>`;
        } else if (r.clientConfirmed) {
          badge = `<span class="badge badge-confirmed">Confirmé</span>`;
        } else {
          badge = `<span class="badge badge-pending">En attente</span>`;
        }
        return `<tr>
          <td><strong>${time}</strong> – ${endTime}</td>
          <td>${escapeHtml(r.clientName)}</td>
          <td>${escapeHtml(r.categoryName || "—")}${r.location ? `<br><span style="color:#6b7a76; font-size:12px;">${escapeHtml(r.location)}</span>` : ""}</td>
          <td>${badge}</td>
        </tr>`;
      }).join("");

  const body = `
    <h1>Bonjour ${escapeHtml(d.practitionerFirstName)},</h1>
    <p>Voici votre planning pour <strong>${escapeHtml(d.dateText)}</strong> :</p>
    <table class="recap">
      <thead><tr><th>Heure</th><th>Client</th><th>Prestation</th><th>Statut</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="btn-row">
      <a href="${escapeHtml(d.appUrl)}/#/app/agenda" class="btn btn-primary">Ouvrir mon agenda</a>
    </div>
    <p style="font-size:13px; color:#6b7a76;">Belle journée à vous.</p>
  `;

  const html = emailShell(subject, body, "Récap quotidien — Naturo Pro");

  const text = [
    `Bonjour ${d.practitionerFirstName},`,
    ``,
    `Voici votre planning pour ${d.dateText} :`,
    ``,
    ...d.rows.map((r) => {
      const time = formatRdvTime(r.startAtMs);
      const status = r.status === "blocked" ? "[Bloqué]"
        : r.status === "cancelled" || r.clientCancelled ? "[Annulé]"
        : r.clientConfirmed ? "[Confirmé]" : "[En attente]";
      return `${time}  ${r.clientName}  ${r.categoryName || "—"}  ${status}`;
    }),
    d.rows.length === 0 ? "Aucun rendez-vous prévu aujourd'hui." : "",
    ``,
    `Ouvrir mon agenda : ${d.appUrl}/#/app/agenda`,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

// ─── Template : Notification praticienne — annulation client ────────────────
export function renderClientCancellationEmail(opts: {
  practitionerFirstName: string;
  clientName: string;
  rdvDateText: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Annulation : ${opts.clientName} — ${opts.rdvDateText}`;
  const body = `
    <h1>Annulation reçue</h1>
    <p>Bonjour ${escapeHtml(opts.practitionerFirstName)},</p>
    <p><strong>${escapeHtml(opts.clientName)}</strong> vient d'annuler son rendez-vous du <strong>${escapeHtml(opts.rdvDateText)}</strong> via le lien envoyé dans l'email de rappel.</p>
    <p>Le créneau est désormais libre dans votre agenda.</p>
    <div class="btn-row">
      <a href="${escapeHtml(opts.appUrl)}/#/app/agenda" class="btn btn-primary">Ouvrir mon agenda</a>
    </div>
  `;
  const html = emailShell(subject, body);
  const text = `${opts.clientName} a annulé son RDV du ${opts.rdvDateText}. Créneau libéré.`;
  return { subject, html, text };
}

// ─── Template : Demande d'avis Google ────────────────────────────────────────
export interface ReviewRequestTemplateData {
  clientFirstName: string;
  practitionerName: string;
  googleReviewUrl: string;
}

export function renderReviewRequestEmail(d: ReviewRequestTemplateData): { subject: string; html: string; text: string } {
  const subject = `Votre avis compte beaucoup pour ${escapeHtml(d.practitionerName)}`;
  const body = `
    <h1>Bonjour ${escapeHtml(d.clientFirstName)},</h1>
    <p>Merci d'avoir pris le temps de me consulter. J'espère que notre séance vous a été utile et bénéfique.</p>
    <p>Si vous en avez envie, un avis Google m'aiderait vraiment à faire connaître mon cabinet et à accompagner de nouveaux clients sur leur chemin de santé naturelle.</p>
    <p>Cela ne prend que 2 minutes et fait vraiment la différence — merci infiniment !</p>
    <div class="btn-row">
      <a href="${escapeHtml(d.googleReviewUrl)}" class="btn btn-primary">Laisser un avis Google</a>
    </div>
    <p style="font-size:13px;color:#6b7a76;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${escapeHtml(d.googleReviewUrl)}</span></p>
    <h2>À bientôt,</h2>
    <p style="margin-top:0;">${escapeHtml(d.practitionerName)}</p>
  `;
  const html = emailShell(subject, body, "Email automatique — Naturo Pro");
  const text = [
    `Bonjour ${d.clientFirstName},`,
    ``,
    `Merci d'avoir pris le temps de me consulter. J'espère que notre séance vous a été utile.`,
    ``,
    `Si vous en avez envie, un avis Google m'aiderait vraiment à faire connaître mon cabinet :`,
    d.googleReviewUrl,
    ``,
    `Merci infiniment !`,
    ``,
    `À bientôt,`,
    d.practitionerName,
  ].join("\n");
  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM EMAILS — Phase 3 Lot 1 (signup confirmation, password reset)
// Utilise RESEND_API_KEY système (pas la clé personnelle de la praticienne).
// ─────────────────────────────────────────────────────────────────────────────
export function getSystemEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY || "";
  const fromAddress = process.env.SYSTEM_FROM_EMAIL || "noreply@ecole-naturo.fr";
  const fromName = process.env.SYSTEM_FROM_NAME || "Naturo Pro";
  if (!apiKey) return null;
  return { apiKey, fromAddress, fromName };
}

export function renderWelcomeVerifyEmail(opts: {
  firstName: string;
  verifyUrl: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Bienvenue sur Naturo Pro — confirmez votre email";
  const body = `
    <h1>Bienvenue ${escapeHtml(opts.firstName)} 👋</h1>
    <p>Merci d'avoir créé votre compte <strong>Naturo Pro</strong>, le logiciel pensé pour les naturopathes.</p>
    <p>Votre essai gratuit de <strong>30 jours</strong> a démarré. Pour activer votre compte, confirmez votre adresse email :</p>
    <div class="btn-row">
      <a href="${escapeHtml(opts.verifyUrl)}" class="btn btn-primary">Confirmer mon email</a>
    </div>
    <p style="font-size:13px;color:#666;">Ou copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${escapeHtml(opts.verifyUrl)}</span></p>
    <p>Pendant vos 30 jours d'essai, vous accédez à <strong>toutes les fonctionnalités</strong> sans aucune limite : agenda, fiches clients, page de réservation publique, factures, rappels automatiques par email…</p>
    <p>À très vite,<br>L'équipe Naturo Pro</p>
  `;
  const html = emailShell(subject, body, "Naturo Pro — votre cabinet en mode pro");
  const text = `Bienvenue ${opts.firstName} ! Confirmez votre email : ${opts.verifyUrl}`;
  return { subject, html, text };
}

export function renderPasswordResetEmail(opts: {
  firstName: string;
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Réinitialisation de votre mot de passe Naturo Pro";
  const body = `
    <h1>Réinitialisation du mot de passe</h1>
    <p>Bonjour ${escapeHtml(opts.firstName)},</p>
    <p>Vous avez demandé à réinitialiser votre mot de passe Naturo Pro. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
    <div class="btn-row">
      <a href="${escapeHtml(opts.resetUrl)}" class="btn btn-primary">Choisir un nouveau mot de passe</a>
    </div>
    <p style="font-size:13px;color:#666;">Ce lien expire dans <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email — votre mot de passe restera inchangé.</p>
    <p style="font-size:13px;color:#666;">Lien complet :<br><span style="word-break:break-all;">${escapeHtml(opts.resetUrl)}</span></p>
  `;
  const html = emailShell(subject, body);
  const text = `Réinitialisez votre mot de passe : ${opts.resetUrl}`;
  return { subject, html, text };
}
