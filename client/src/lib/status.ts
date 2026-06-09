// Source UNIQUE des libellés et styles de statut, pour tous les domaines.
// Élimine les définitions dupliquées/divergentes (factures, RDV, programmes).

export type StatusMeta = { label: string; className: string };

/** Classe de base d'une pilule de statut (fond clair teinté + texte foncé). */
export const STATUS_PILL = "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold whitespace-nowrap";

// Couleurs sémantiques avec variantes dark (fond translucide + texte clair).
const AMBER = "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
const EMERALD = "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
const RED = "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
const NEUTRAL = "bg-muted text-muted-foreground";

export const INVOICE_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Brouillon", className: NEUTRAL },
  sent: { label: "Envoyée", className: AMBER },
  paid: { label: "Payée", className: EMERALD },
  cancelled: { label: "Annulée", className: RED },
};

export const APPOINTMENT_STATUS: Record<string, StatusMeta> = {
  confirmed: { label: "Confirmé", className: "bg-secondary text-secondary-foreground" },
  pending: { label: "En attente", className: AMBER },
  completed: { label: "Terminé", className: EMERALD },
  cancelled: { label: "Annulé", className: RED },
  blocked: { label: "Bloqué", className: NEUTRAL },
};

export const PROGRAM_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Brouillon", className: NEUTRAL },
  sent: { label: "Envoyé", className: EMERALD },
};

export const STATUS_DOMAINS = {
  invoice: INVOICE_STATUS,
  appointment: APPOINTMENT_STATUS,
  program: PROGRAM_STATUS,
} as const;

export type StatusDomain = keyof typeof STATUS_DOMAINS;

/** Métadonnées d'un statut, avec repli neutre si statut inconnu. */
export function statusMeta(domain: StatusDomain, status: string | null | undefined): StatusMeta {
  const map = STATUS_DOMAINS[domain] as Record<string, StatusMeta>;
  if (status && map[status]) return map[status];
  return { label: status || "—", className: "bg-muted text-muted-foreground" };
}
