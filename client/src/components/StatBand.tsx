/**
 * Bande de chiffres-clés.
 *
 * Quatre cartes identiques « icône + libellé en majuscules + gros nombre » est le
 * gabarit générique par excellence. Ici : un seul contour, des filets internes,
 * pas d'icône décorative. La lecture se fait en ligne, pas objet par objet.
 *
 * Les filets viennent d'un `gap-px` sur fond `border` — robuste quelle que soit
 * la façon dont la grille se replie, contrairement à `divide-x`.
 */
import type { ReactNode } from "react";

export function StatBand({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-lg border border-card-border bg-border ${className}`}
    >
      {children}
    </div>
  );
}

interface StatCellProps {
  label: string;
  value: ReactNode;
  /** Ligne de précision sous le chiffre (« 3 factures payées »). */
  sub?: ReactNode;
  /** Classe de couleur du chiffre, pour un statut (montant en attente…). */
  valueClassName?: string;
  testid?: string;
}

export function StatCell({ label, value, sub, valueClassName = "text-heading", testid }: StatCellProps) {
  return (
    <div className="bg-card px-4 py-3.5" data-testid={testid}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClassName}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/** Cellule de chargement, aux mêmes dimensions qu'une StatCell remplie. */
export function StatCellSkeleton() {
  return (
    <div className="bg-card px-4 py-3.5">
      <div className="h-3 w-24 rounded-sm bg-muted animate-pulse" />
      <div className="h-7 w-28 rounded-sm bg-muted animate-pulse mt-2" />
    </div>
  );
}
