import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Titre de la page (obligatoire). */
  title: string;
  /** Sous-titre optionnel, sous le titre. */
  subtitle?: string;
  /** Sur-titre optionnel, au-dessus du titre (ex. « Bonjour Marie »). */
  kicker?: string;
  /** Pastille d'icône optionnelle à gauche du titre. */
  icon?: LucideIcon;
  /** Lien de retour optionnel (flèche + libellé) au-dessus du titre. */
  backTo?: { href: string; label: string };
  /** Actions à droite (boutons…). */
  actions?: ReactNode;
}

/**
 * En-tête de page unifié pour l'app authentifiée.
 * Centralise le bloc titre + sous-titre + retour + actions
 * (auparavant réinventé sur chaque page).
 */
export function PageHeader({ title, subtitle, kicker, icon: Icon, backTo, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {backTo && (
        <Link
          href={backTo.href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition mb-3"
          data-testid="page-back"
        >
          <ArrowLeft className="h-4 w-4" />
          {backTo.label}
        </Link>
      )}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <span className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            {kicker && <p className="text-sm text-muted-foreground mb-0.5">{kicker}</p>}
            <h1 className="text-2xl lg:text-3xl font-extrabold leading-tight" style={{ color: "#1b4332" }}>
              {title}
            </h1>
            {subtitle && <p className="text-muted-foreground text-sm mt-1 max-w-2xl">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
