import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Action optionnelle (bouton) sous la description. */
  action?: ReactNode;
  /** Enveloppe dans une card-naturo (défaut : true). Mettre false si déjà dans une carte. */
  card?: boolean;
  testid?: string;
}

/**
 * État vide unifié (icône + titre + description + action).
 * Remplace les multiples implémentations divergentes éparpillées dans les pages.
 */
export function EmptyState({ icon: Icon, title, description, action, card = true, testid }: EmptyStateProps) {
  return (
    <div className={`${card ? "card-naturo " : ""}text-center py-12 px-6`} data-testid={testid}>
      <div className="h-12 w-12 mx-auto rounded-full bg-secondary text-primary flex items-center justify-center mb-3">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-bold mb-1" style={{ color: "#1b4332" }}>{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
