// Source UNIQUE des libellés et styles de statut, pour tous les domaines.
// Élimine les définitions dupliquées/divergentes (factures, RDV, programmes).

export type StatusMeta = { label: string; className: string };

/** Classe de base d'une pilule de statut (fond clair teinté + texte foncé). */
export const STATUS_PILL = "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold whitespace-nowrap";

export const INVOICE_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Brouillon", className: "bg-muted text-muted-foreground" },
  sent: { label: "Envoyée", className: "bg-amber-100 text-amber-800" },
  paid: { label: "Payée", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Annulée", className: "bg-red-100 text-red-800" },
};

export const APPOINTMENT_STATUS: Record<string, StatusMeta> = {
  confirmed: { label: "Confirmé", className: "bg-secondary text-primary" },
  pending: { label: "En attente", className: "bg-amber-100 text-amber-800" },
  completed: { label: "Terminé", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Annulé", className: "bg-red-100 text-red-800" },
  blocked: { label: "Bloqué", className: "bg-muted text-muted-foreground" },
};

export const PROGRAM_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Brouillon", className: "bg-muted text-muted-foreground" },
  sent: { label: "Envoyé", className: "bg-emerald-100 text-emerald-800" },
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
