/**
 * server/email-templates/defaults.ts — PHASE 3.5-C
 *
 * Templates par défaut pour les 3 types d'emails de RDV.
 *
 * Depuis l'éditeur visuel (option C) : le bodyHtml par défaut est un FRAGMENT
 * (contenu central uniquement, sans <html>/<style>). L'ossature complète (styles,
 * carte, pied de page) est ajoutée à l'envoi par renderTemplate via emailShell().
 * Les anciens templates custom stockés en full HTML restent rendus tels quels
 * (détection dans render.ts) — rétrocompatibilité totale.
 *
 * Les variables {{x.y}} sont interpolées au moment de l'envoi par render.ts.
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

/**
 * Emballe un fragment de contenu central dans l'ossature email complète
 * (doctype, styles, carte, pied de page). Exporté pour être réutilisé par
 * render.ts (emballage des fragments au moment du rendu).
 */
export function emailShell(title: string, bodyHtml: string): string {
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

/**
 * Détecte si un bodyHtml est un document complet (ancien format) plutôt qu'un
 * fragment. Un fragment ne contient ni <html> ni <!doctype>.
 */
export function isFullHtmlDocument(bodyHtml: string): boolean {
  return /<html[\s>]/i.test(bodyHtml) || /<!doctype/i.test(bodyHtml);
}

// ─── Fragments par défaut (contenu central éditable) ─────────────────────────

// ─── Confirmation de RDV ──────────────────────────────────────────────────────
const confirmationSubject = "Confirmation de votre rendez-vous du {{appointment.date}}";

const confirmationBody = `
  <h1>Bonjour {{client.name}},</h1>
  <p>Votre rendez-vous est bien confirmé. Nous nous réjouissons de vous accueillir !</p>

  <div class="info">
    <p><strong>Date</strong> : {{appointment.date}}</p>
    <p><strong>Heure</strong> : {{appointment.time}}</p>
    <p><strong>Durée</strong> : {{appointment.duration}}</p>
    <p><strong>Prestation</strong> : {{appointment.category}}</p>
    {{#if appointment.address}}<p><strong>Adresse</strong> : {{appointment.address}}</p>{{/if}}
  </div>

  {{#if appointment.meetLink}}
  <div class="info">
    <p><strong>Votre rendez-vous a lieu en visio (Google Meet)</strong></p>
    <p>Lien de connexion : <a href="{{appointment.meetLink}}" style="color:#186749;">{{appointment.meetLink}}</a></p>
    <p>Cliquez sur ce lien le jour du rendez-vous pour rejoindre la visioconférence.</p>
  </div>
  {{/if}}

  <p>Si vous souhaitez annuler ou modifier votre rendez-vous, vous pouvez utiliser le lien ci-dessous.</p>

  <div class="btn-row">
    <a href="{{cancelLink}}" class="btn btn-secondary">Annuler le rendez-vous</a>
  </div>

  <h2>À bientôt,</h2>
  <p>{{practitioner.name}}<br>
  <a href="mailto:{{practitioner.email}}" style="color:#186749;">{{practitioner.email}}</a></p>
`;

// ─── Rappel J-1 ──────────────────────────────────────────────────────────────
const reminderD1Subject = "Rappel : votre rendez-vous demain à {{appointment.time}}";

const reminderD1Body = `
  <h1>Bonjour {{client.name}},</h1>
  <p>Petit rappel : vous avez rendez-vous <strong>demain</strong>.</p>

  <div class="info">
    <p><strong>Date</strong> : {{appointment.date}}</p>
    <p><strong>Heure</strong> : {{appointment.time}}</p>
    <p><strong>Durée</strong> : {{appointment.duration}}</p>
    <p><strong>Prestation</strong> : {{appointment.category}}</p>
    {{#if appointment.address}}<p><strong>Adresse</strong> : {{appointment.address}}</p>{{/if}}
  </div>

  {{#if appointment.meetLink}}
  <div class="info">
    <p><strong>Rendez-vous en visio (Google Meet)</strong></p>
    <p>Lien de connexion : <a href="{{appointment.meetLink}}" style="color:#186749;">{{appointment.meetLink}}</a></p>
  </div>
  {{/if}}

  <p>Merci de bien vouloir confirmer votre présence.</p>

  <div class="btn-row">
    <a href="{{cancelLink}}" class="btn btn-secondary">Annuler le rendez-vous</a>
  </div>

  <h2>À bientôt,</h2>
  <p>{{practitioner.name}}<br>
  <a href="mailto:{{practitioner.email}}" style="color:#186749;">{{practitioner.email}}</a></p>
`;

// ─── Annulation ──────────────────────────────────────────────────────────────
const cancellationSubject = "Annulation de votre rendez-vous du {{appointment.date}}";

const cancellationBody = `
  <h1>Bonjour {{client.name}},</h1>
  <p>Votre rendez-vous a bien été annulé.</p>

  <div class="info">
    <p><strong>Date</strong> : {{appointment.date}}</p>
    <p><strong>Heure</strong> : {{appointment.time}}</p>
    <p><strong>Prestation</strong> : {{appointment.category}}</p>
  </div>

  <p>N'hésitez pas à reprendre rendez-vous quand vous le souhaitez.</p>

  <h2>À bientôt,</h2>
  <p>{{practitioner.name}}<br>
  <a href="mailto:{{practitioner.email}}" style="color:#186749;">{{practitioner.email}}</a></p>
`;

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
