import { Link, useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList, FileText, Ticket, Leaf, Scale, Tag, Clock, Globe,
  Settings, Bell, MailOpen,
} from "lucide-react";

export type SubNavTab = { href: string; label: string; icon: LucideIcon; id: string };

// ── Teintes d'identité par domaine ───────────────────────────────────────────
// Appliquées aux pastilles d'icônes (sidebar, PageHeader) et à l'onglet actif
// des sous-navs, pour donner un repère de zone. Les CTA restent verts (marque).
export type DomainTone =
  | "brand" | "agenda" | "clients" | "factures" | "suivi"
  | "naturobot" | "ressources" | "page-publique" | "parametres";

export const DOMAIN_TONES: Record<DomainTone, { chip: string; icon: string; active: string }> = {
  brand: {
    chip: "bg-secondary text-primary",
    icon: "text-primary",
    active: "bg-primary text-primary-foreground",
  },
  agenda: {
    chip: "bg-blue-600/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    icon: "text-blue-600 dark:text-blue-300",
    active: "bg-blue-700 text-white",
  },
  clients: {
    chip: "bg-orange-600/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
    icon: "text-orange-600 dark:text-orange-300",
    active: "bg-orange-700 text-white",
  },
  factures: {
    chip: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-300",
    active: "bg-amber-600 text-white",
  },
  suivi: {
    chip: "bg-violet-600/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    icon: "text-violet-600 dark:text-violet-300",
    active: "bg-violet-700 text-white",
  },
  naturobot: {
    chip: "bg-teal-600/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
    icon: "text-teal-600 dark:text-teal-300",
    active: "bg-teal-700 text-white",
  },
  ressources: {
    chip: "bg-lime-600/10 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300",
    icon: "text-lime-700 dark:text-lime-300",
    active: "bg-lime-700 text-white",
  },
  "page-publique": {
    chip: "bg-rose-600/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    icon: "text-rose-600 dark:text-rose-300",
    active: "bg-rose-700 text-white",
  },
  parametres: {
    chip: "bg-slate-600/10 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
    icon: "text-slate-600 dark:text-slate-300",
    active: "bg-slate-700 text-white",
  },
};

// Route → teinte, pour que PageHeader colore sa pastille sans prop sur chaque page.
export const ROUTE_TONES: Array<[prefix: string, tone: DomainTone]> = [
  ["/app/agenda", "agenda"],
  ["/app/clients", "clients"],
  ["/app/notes", "clients"],
  ["/app/invoices", "factures"],
  ["/app/anamnese", "suivi"],
  ["/app/programmes", "suivi"],
  ["/app/forfaits", "suivi"],
  ["/app/chat", "naturobot"],
  ["/app/studio-contenu", "naturobot"],
  ["/app/naturobot-bibliotheque", "naturobot"],
  ["/app/solutions", "ressources"],
  ["/app/cadre-legal", "ressources"],
  ["/app/public-page", "page-publique"],
  ["/app/categories", "page-publique"],
  ["/app/availability", "page-publique"],
  ["/app/settings", "parametres"],
  ["/app/reminders", "parametres"],
  ["/app/email-templates", "parametres"],
];

export function toneForRoute(location: string): DomainTone {
  const hit = ROUTE_TONES.find(([prefix]) => location.startsWith(prefix));
  return hit ? hit[1] : "brand";
}

// ── Groupes de sous-navigation (URLs inchangées) ─────────────────────────────
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
  const tone = DOMAIN_TONES[group as DomainTone] ?? DOMAIN_TONES.brand;
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      {tabs.map((t) => {
        const active = location.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? tone.active : `${tone.chip} hover:opacity-75`
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
