import { Link, useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList, FileText, Ticket, Leaf, Scale, Tag, Clock, Globe,
  Settings, Bell, MailOpen,
} from "lucide-react";

export type SubNavTab = { href: string; label: string; icon: LucideIcon; id: string };

// Consolidation navigation — sous-navigation par liens (URLs inchangées),
// généralisation du pattern NaturobotTabs. Chaque groupe = une entrée sidebar.
export const SUIVI_TABS: SubNavTab[] = [
  { href: "/app/anamnese", label: "Anamnèses", icon: ClipboardList, id: "anamneses" },
  { href: "/app/programmes", label: "Programmes", icon: FileText, id: "programmes" },
  { href: "/app/forfaits", label: "Forfaits", icon: Ticket, id: "forfaits" },
];

export const RESSOURCES_TABS: SubNavTab[] = [
  { href: "/app/solutions", label: "Bibliothèque de référence", icon: Leaf, id: "solutions" },
  { href: "/app/cadre-legal", label: "Cadre légal", icon: Scale, id: "cadre-legal" },
];

export const PAGE_PUBLIQUE_TABS: SubNavTab[] = [
  { href: "/app/public-page", label: "Page publique", icon: Globe, id: "page-publique" },
  { href: "/app/categories", label: "Prestations", icon: Tag, id: "prestations" },
  { href: "/app/availability", label: "Disponibilités", icon: Clock, id: "disponibilites" },
];

export const PARAMETRES_TABS: SubNavTab[] = [
  { href: "/app/settings", label: "Paramètres", icon: Settings, id: "parametres" },
  { href: "/app/reminders", label: "Rappels", icon: Bell, id: "rappels" },
  { href: "/app/email-templates", label: "Templates email", icon: MailOpen, id: "templates-email" },
];

export function SubNav({ group, tabs }: { group: string; tabs: SubNavTab[] }) {
  const [location] = useLocation();
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      {tabs.map((t) => {
        const active = location.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-bold transition ${
              active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary hover:bg-secondary/70"
            }`}
            data-testid={`tab-${group}-${t.id}`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
