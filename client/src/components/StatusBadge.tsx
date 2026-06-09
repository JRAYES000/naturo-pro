import { STATUS_PILL, statusMeta, type StatusDomain } from "@/lib/status";

interface StatusBadgeProps {
  domain: StatusDomain;
  status: string | null | undefined;
  className?: string;
}

/**
 * Badge de statut unifié (factures, rendez-vous, programmes).
 * Traduit et style le statut depuis la source unique lib/status.ts.
 */
export function StatusBadge({ domain, status, className = "" }: StatusBadgeProps) {
  const meta = statusMeta(domain, status);
  return (
    <span className={`${STATUS_PILL} ${meta.className} ${className}`} data-testid={`status-${status ?? "unknown"}`}>
      {meta.label}
    </span>
  );
}
