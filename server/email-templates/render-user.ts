/**
 * server/email-templates/render-user.ts — PHASE 3.5.5
 *
 * Helper qui résout le template email à utiliser pour un (userId, kind) :
 *   1. Cherche un template personnalisé en DB (table email_templates)
 *   2. Sinon, fallback sur le template par défaut (defaults.ts)
 *   3. Interpole les variables {{x.y}} avec render.ts
 *
 * Retourne null en cas d'erreur DB pour permettre au caller de fallback
 * sur le rendu hardcodé existant (ex: renderConfirmationEmail).
 */

import { storage } from "../storage";
import { getDefaultTemplate, type EmailKind } from "./defaults";
import { renderTemplate, type TemplateVars } from "./render";

export async function renderUserTemplate(
  userId: number,
  kind: EmailKind,
  vars: TemplateVars,
): Promise<{ subject: string; html: string } | null> {
  try {
    const tpl = await storage.getEmailTemplate(userId, kind);
    const source = tpl
      ? { subject: tpl.subject, bodyHtml: tpl.bodyHtml }
      : getDefaultTemplate(kind);
    return renderTemplate(source, vars);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[renderUserTemplate] failed for user=${userId} kind=${kind}: ${msg}`,
    );
    return null;
  }
}
