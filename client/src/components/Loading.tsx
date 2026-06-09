import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

type LoadingProps = {
  /** "inline" = spinner centré ; "list" = skeletons en lignes ; "cards" = skeletons en grille. */
  variant?: "inline" | "list" | "cards";
  count?: number;
  label?: string;
  className?: string;
};

/**
 * État de chargement unifié (remplace les "Chargement…" bruts, spinners isolés
 * et skeletons dupliqués éparpillés dans l'app).
 */
export function Loading({ variant = "inline", count = 3, label = "Chargement…", className = "" }: LoadingProps) {
  if (variant === "list") {
    return (
      <div className={`space-y-3 ${className}`} aria-busy="true" aria-label={label}>
        {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (variant === "cards") {
    return (
      <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`} aria-busy="true" aria-label={label}>
        {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-muted-foreground ${className}`} aria-busy="true" aria-label={label}>
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}
