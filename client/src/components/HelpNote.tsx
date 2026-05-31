/**
 * HelpNote — encart d'aide repliable, à destination des praticiennes peu à
 * l'aise avec l'informatique.
 *
 * Affiché en haut d'une page, ouvert par défaut, refermable via le chevron.
 * Le contenu (children) utilise du HTML simple : <p>, <strong>, <code>,
 * <ul>/<li>, <ol>/<li>. La mise en forme est appliquée automatiquement par les
 * sélecteurs Tailwind ci-dessous — pas besoin de styler chaque balise.
 *
 * Pas de persistance (localStorage interdit côté client) : l'état d'ouverture
 * est local au composant et se réinitialise à chaque visite.
 */

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

interface HelpNoteProps {
  /** Titre affiché dans l'en-tête cliquable. */
  title?: string;
  /** Ouvert par défaut au chargement de la page. */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function HelpNote({
  title = "À quoi sert cette page ?",
  defaultOpen = true,
  children,
}: HelpNoteProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="card-naturo rounded-[15px] mb-6 border-primary/20 bg-primary/[0.03]">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full text-left"
          data-testid="button-toggle-help"
        >
          <span className="flex items-center gap-2 text-base font-semibold text-foreground">
            <HelpCircle className="h-4 w-4 text-primary" />
            {title}
          </span>
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent
          className={
            "space-y-4 text-sm text-muted-foreground pt-0 " +
            "[&_strong]:font-semibold [&_strong]:text-foreground " +
            "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs [&_code]:text-foreground " +
            "[&_ul]:space-y-1.5 [&_ol]:list-inside [&_ol]:list-decimal [&_ol]:space-y-1"
          }
        >
          {children}
        </CardContent>
      )}
    </Card>
  );
}
