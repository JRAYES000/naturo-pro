// ─────────────────────────────────────────────────────────────────────────────
// server/email-templates/confirmation.ts
// Template HTML — Email de confirmation de RDV pour le client
// Phase 3.5-A — Confirmation email with .ics attachment
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Reprise exacte des styles de server/email.ts (palette #186749, fond #f7faf9)
const BASE_STYLES = `
  body { margin: 0; padding: 0; background-color: #f7faf9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
  .card { background: #ffffff; border-radius: 12px; padding: 32px 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  h1 { font-size: 22px; font-weight: 700; color: #186749; margin: 0 0 16px; }
  h2 { font-size: 16px; font-weight: 600; color: #186749; margin: 24px 0 8px; }
  p { font-size: 15px; line-height: 1.55; margin: 0 0 12px; }
  .info { background: #f7faf9; border-left: 3px solid #186749; padding: 14px 16px; border-radius: 6px; margin: 16px 0; font-size: 14px; }
  .info strong { color: #186749; }
  .ics-note { background: #eef7f2; border: 1px solid #b2d8c5; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #0f4d35; margin: 16px 0; }
  .footer { font-size: 12px; color: #6b7a76; text-align: center; margin-top: 24px; padding: 12px; }
  .footer a { color: #6b7a76; }
`;

function emailShell(title: string, bodyHtml: string, footerNote?: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${BASE_STYLES}</style>
</head><body>
<div class="wrap">
  <div class="card">${bodyHtml}</div>
  <div class="footer">${footerNote ? footerNote : "Email automatique — merci de ne pas répondre."}</div>
</div>
</body></html>`;
}

export interface ConfirmationTemplateData {
  clientFirstName: string;
  practitionerName: string;
  practitionerEmail?: string | null;
  practitionerPhone?: string | null;
  rdvDateText: string;         // ex: "samedi 9 mai 2026 à 14h00"
  durationMinutes?: number | null;
  categoryName?: string | null;
  location?: string | null;
  // PHASE 3.5 — lien public d'annulation/report (page BookingManage)
  cancelUrl?: string | null;
}

/**
 * Génère l'email de confirmation de RDV à envoyer au client immédiatement
 * après la prise de rendez-vous via la page publique de booking.
 */
export function renderConfirmationEmail(
  d: ConfirmationTemplateData,
): { subject: string; html: string; text: string } {
  const subject = `Confirmation de votre RDV avec ${d.practitionerName}`;

  const body = `
    <h1>Bonjour ${escapeHtml(d.clientFirstName)},</h1>
    <p>Votre rendez-vous est <strong>confirmé</strong>. Nous avons bien reçu votre demande de réservation.</p>

    <div class="info">
      <p><strong>Date</strong> : ${escapeHtml(d.rdvDateText)}</p>
      ${d.durationMinutes ? `<p><strong>Durée</strong> : ${d.durationMinutes} min</p>` : ""}
      ${d.categoryName ? `<p><strong>Prestation</strong> : ${escapeHtml(d.categoryName)}</p>` : ""}
      <p><strong>Praticien·ne</strong> : ${escapeHtml(d.practitionerName)}</p>
      ${d.location ? `<p><strong>Lieu</strong> : ${escapeHtml(d.location)}</p>` : ""}
    </div>

    <div class="ics-note">
      📅 Un fichier <strong>.ics</strong> est joint à cet email pour ajouter ce rendez-vous à votre calendrier (Google Calendar, Apple Calendar, Outlook…).
    </div>

    ${d.cancelUrl ? `
    <p style="margin:20px 0; padding:14px; background:#f3f7f5; border-radius:10px; text-align:center;">
      <a href="${escapeHtml(d.cancelUrl)}" style="color:#186749; font-weight:600; text-decoration:underline;">
        Gérer mon rendez-vous (annuler ou reporter)
      </a>
    </p>` : ""}

    <h2>À très vite,</h2>
    <p style="margin-top:0;">${escapeHtml(d.practitionerName)}<br>
    ${d.practitionerEmail ? `<a href="mailto:${escapeHtml(d.practitionerEmail)}" style="color:#186749;">${escapeHtml(d.practitionerEmail)}</a>` : ""}
    ${d.practitionerPhone ? ` — ${escapeHtml(d.practitionerPhone)}` : ""}</p>
  `;

  const html = emailShell(
    subject,
    body,
    `Cet email confirme votre rendez-vous chez ${escapeHtml(d.practitionerName)}. Email automatique — merci de ne pas répondre.`,
  );

  const text = [
    `Bonjour ${d.clientFirstName},`,
    ``,
    `Votre rendez-vous est confirmé.`,
    ``,
    `Date : ${d.rdvDateText}`,
    d.durationMinutes ? `Durée : ${d.durationMinutes} min` : "",
    d.categoryName ? `Prestation : ${d.categoryName}` : "",
    `Praticien·ne : ${d.practitionerName}`,
    d.location ? `Lieu : ${d.location}` : "",
    ``,
    `Un fichier .ics est joint à cet email pour ajouter ce rendez-vous à votre calendrier.`,
    ``,
    `À très vite,`,
    d.practitionerName,
    d.practitionerEmail ? d.practitionerEmail : "",
    d.practitionerPhone ? d.practitionerPhone : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}
