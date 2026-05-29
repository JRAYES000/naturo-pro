/**
 * server/email-templates/defaults.ts — PHASE 3.5-C
 *
 * Templates par défaut pour les 3 types d'emails de RDV.
 * Utilise les mêmes styles inline que les emails existants dans server/email.ts.
 * Les variables {{x.y}} seront interpolées au moment de l'envoi par render.ts.
 */

export type EmailKind = "confirmation" | "reminder_d1" | "cancellation";

export interface EmailTemplateDefault {
  subject: string;
  bodyHtml: string;
}

// ─── Styles communs (identiques à EMAIL_BASE_STYLES dans server/email.ts) ────
const BASE_STYLES = `
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
`;

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>${BASE_STYLES}</style>
</head><body>
<div class="wrap">
  <div class="card">${bodyHtml}</div>
  <div class="footer">Email automatique — merci de ne pas répondre directement.</div>
</div>
</body></html>`;
}

// ─── Confirmation de RDV ──────────────────────────────────────────────────────
const confirmationSubject = "Confirmation de votre rendez-vous du {{appointment.date}}";

const confirmationBody = emailShell(
  "Confirmation de votre rendez-vous",
  `
  <h1>Bonjour {{client.name}},</h1>
  <p>Votre rendez-vous est bien confirmé. Nous nous réjouissons de vous accueillir !</p>

  <div class="info">
    <p><strong>Date</strong> : {{appointment.date}}</p>
    <p><strong>Heure</strong> : {{appointment.time}}</p>
    <p><strong>Durée</strong> : {{appointment.duration}}</p>
    <p><strong>Prestation</strong> : {{appointment.category}}</p>
    {{#if appointment.address}}<p><strong>Adresse</strong> : {{appointment.address}}</p>{{/if}}
  </div>

  <p>Si vous souhaitez annuler ou modifier votre rendez-vous, vous pouvez utiliser le lien ci-dessous.</p>

  <div class="btn-row">
    <a href="{{cancelLink}}" class="btn btn-secondary">Annuler le rendez-vous</a>
  </div>

  <h2>À bientôt,</h2>
  <p>{{practitioner.name}}<br>
  <a href="mailto:{{practitioner.email}}" style="color:#186749;">{{practitioner.email}}</a></p>
`,
);

// ─── Rappel J-1 ──────────────────────────────────────────────────────────────
const reminderD1Subject = "Rappel : votre rendez-vous demain à {{appointment.time}}";

const reminderD1Body = emailShell(
  "Rappel de votre rendez-vous demain",
  `
  <h1>Bonjour {{client.name}},</h1>
  <p>Petit rappel : nous nous voyons <strong>demain</strong> pour votre rendez-vous.</p>

  <div class="info">
    <p><strong>Date</strong> : {{appointment.date}}</p>
    <p><strong>Heure</strong> : {{appointment.time}}</p>
    <p><strong>Durée</strong> : {{appointment.duration}}</p>
    <p><strong>Prestation</strong> : {{appointment.category}}</p>
    {{#if appointment.address}}<p><strong>Adresse</strong> : {{appointment.address}}</p>{{/if}}
  </div>

  <p>Pouvez-vous me confirmer votre présence ?</p>

  <div class="btn-row">
    <a href="{{cancelLink}}" class="btn btn-secondary">Annuler le rendez-vous</a>
  </div>

  <h2>À très vite,</h2>
  <p>{{practitioner.name}}<br>
  <a href="mailto:{{practitioner.email}}" style="color:#186749;">{{practitioner.email}}</a></p>
`,
);

// ─── Annulation de RDV (notification au praticien) ───────────────────────────
const cancellationSubject = "Annulation : RDV de {{client.name}} le {{appointment.date}}";

const cancellationBody = emailShell(
  "Annulation d'un rendez-vous",
  `
  <h1>Bonjour {{practitioner.name}},</h1>
  <p>Le client <strong>{{client.name}}</strong> vient d'annuler son rendez-vous via le lien d'annulation envoyé par email.</p>

  <div class="info">
    <p><strong>Client</strong> : {{client.name}}{{#if client.email}} ({{client.email}}){{/if}}</p>
    <p><strong>Date annulée</strong> : {{appointment.date}}</p>
    <p><strong>Heure</strong> : {{appointment.time}}</p>
    <p><strong>Durée</strong> : {{appointment.duration}}</p>
    <p><strong>Prestation</strong> : {{appointment.category}}</p>
    {{#if appointment.address}}<p><strong>Adresse</strong> : {{appointment.address}}</p>{{/if}}
  </div>

  <p>Le créneau est désormais à nouveau disponible dans votre agenda.</p>

  <p style="font-size:13px;color:#6b7a76;margin-top:20px;">Email automatique envoyé par Naturo Pro.</p>
`,
);

// ─── Export ───────────────────────────────────────────────────────────────────
export const DEFAULT_TEMPLATES: Record<EmailKind, EmailTemplateDefault> = {
  confirmation: {
    subject: confirmationSubject,
    bodyHtml: confirmationBody,
  },
  reminder_d1: {
    subject: reminderD1Subject,
    bodyHtml: reminderD1Body,
  },
  cancellation: {
    subject: cancellationSubject,
    bodyHtml: cancellationBody,
  },
};

export function getDefaultTemplate(kind: EmailKind): EmailTemplateDefault {
  return DEFAULT_TEMPLATES[kind];
}
