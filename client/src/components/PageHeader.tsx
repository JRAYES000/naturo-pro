import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DOMAIN_TONES, toneForRoute } from "@/components/SubNav";

interface PageHeaderProps {
  /** Titre de la page (obligatoire). */
  title: string;
  /** Sous-titre optionnel, sous le titre. */
  subtitle?: string;
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
export function PageHeader({ title, subtitle, icon: Icon, backTo, actions }: PageHeaderProps) {
  // Teinte de domaine dérivée de la route — colore la pastille d'icône sans
  // qu'aucune page n'ait à passer de prop.
  const [location] = useLocation();
  const tone = DOMAIN_TONES[toneForRoute(location)];
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
            <span className={`hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}>
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            {/* Poids et interlettrage viennent de la règle h1 du thème : un seul endroit. */}
            <h1 className="text-2xl lg:text-3xl leading-tight text-heading">
              {title}
            </h1>
            {subtitle && <p className="text-muted-foreground text-sm mt-1.5 max-w-[65ch]">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
