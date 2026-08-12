/**
 * client/src/lib/template-vars-check.ts — Lot 5 (QC Templates email)
 *
 * Détection des {{variables}} inconnues avant l'enregistrement d'un template :
 * une faute de frappe ({{cilent.name}}) partait telle quelle dans l'email envoyé
 * à la cliente, sans le moindre avertissement.
 */
import { TEMPLATE_VARS } from "./template-vars";

export function findUnknownTemplateVars(text: string): string[] {
  const known = new Set(TEMPLATE_VARS.map((v) => v.placeholder.replace(/[{}]/g, "").trim()));
  const found = new Set<string>();
  const matches = Array.from(text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g));
  for (const m of matches) {
    if (!known.has(m[1].trim())) found.add(`{{${m[1].trim()}}}`);
  }
  return Array.from(found);
}
