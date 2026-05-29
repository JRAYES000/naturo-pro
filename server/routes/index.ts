/**
 * server/routes/index.ts — SQUELETTE (Phase 4.0 split par domaine)
 *
 * Point d'entrée CIBLE du découpage de server/routes.ts par domaine.
 *
 * ⚠️ Pas encore actif : pendant la migration, server/index.ts importe toujours
 * `../routes` (server/routes.ts). À chaque étape, un domaine exposera
 * `register<Domaine>(app, ctx)` et sera branché ici. Quand server/routes.ts
 * sera vide, il sera supprimé et server/index.ts pointera vers ce fichier
 * (étape finale du refactor).
 *
 * Domaines prévus (ordre de migration) :
 *   categories → availability → profile → clients → appointments →
 *   email-templates → reminders → invoices → admin → google →
 *   internal(+crons) → public/booking/manage
 */

export { createContext } from "./_context";
export type { RouteContext } from "./_context";
