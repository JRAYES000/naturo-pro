/**
 * server/email-templates/render.ts — PHASE 3.5-C
 *
 * Interpolation de templates email avec variables {{x.y}}.
 * Sécurité XSS : les valeurs interpolées sont échappées côté HTML.
 */

import { emailShell, isFullHtmlDocument } from "./defaults";

export interface TemplateVars {
  "client.name"?: string;
  "client.email"?: string;
  "appointment.date"?: string;
  "appointment.time"?: string;
  "appointment.duration"?: string;
  "appointment.category"?: string;
  "appointment.address"?: string;
  "appointment.meetLink"?: string;
  "practitioner.name"?: string;
  "practitioner.email"?: string;
  "cancelLink"?: string;
}

/** Échappe les caractères spéciaux HTML pour éviter les injections XSS. */
function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Remplace toutes les occurrences de {{varName}} dans une chaîne par leur valeur.
 * Les valeurs sont échappées pour le HTML.
 * Si une variable est absente du contexte, le placeholder est laissé tel quel.
 */
function interpolate(template: string, vars: TemplateVars): string {
  // 1) Bloc conditionnel : {{#if x.y}}...{{/if}} — le bloc n'est rendu que si la variable est non-vide
  let out = template.replace(
    /\{\{#if\s+([^}\s]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, key: string, body: string) => {
      const trimmedKey = key.trim() as keyof TemplateVars;
      const v = vars[trimmedKey];
      return v !== undefined && v !== null && String(v).trim() !== "" ? body : "";
    },
  );
  // 2) Placeholders simples : {{x.y}}
  out = out.replace(/\{\{([^}#/][^}]*)\}\}/g, (_match, key: string) => {
    const trimmedKey = key.trim() as keyof TemplateVars;
    if (trimmedKey in vars && vars[trimmedKey] !== undefined) {
      return escapeHtml(vars[trimmedKey]);
    }
    return `{{${key}}}`;
  });
  return out;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
}

/**
 * Interpole les variables dans le sujet et le corps HTML d'un template.
 *
 * @param template - Objet avec `subject` et `bodyHtml` contenant des {{variables}}
 * @param vars - Valeurs des variables à injecter
 * @returns Objet avec `subject` et `html` interpolés
 */
export function renderTemplate(
  template: { subject: string; bodyHtml: string },
  vars: TemplateVars,
): RenderedTemplate {
  const subject = interpolate(template.subject, vars);
  const body = interpolate(template.bodyHtml, vars);
  // Nouveau format (option C) : bodyHtml est un FRAGMENT → on l'emballe dans
  // l'ossature email complète (styles + carte + pied de page). Ancien format
  // custom (document HTML complet) → utilisé tel quel (rétrocompatibilité).
  const html = isFullHtmlDocument(template.bodyHtml) ? body : emailShell(subject, body);
  return { subject, html };
}
