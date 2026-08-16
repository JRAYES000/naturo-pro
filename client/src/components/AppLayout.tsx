import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Calendar, Users, Globe, Settings, LogOut,
  ExternalLink, Receipt, Shield, ClipboardList,
  BarChart2, Leaf, Sparkles, BookOpen, Menu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "./Logo";
import { TrialBanner } from "./TrialBanner";
import { useAuth, type AuthUser } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { DOMAIN_TONES, type DomainTone } from "@/components/SubNav";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; match?: string[]; tone?: DomainTone };

// Consolidation navigation : 9 entrées plates. Les pages regroupées gardent leur
// URL et s'atteignent via la sous-nav (SubNav) en tête de page ; `match` liste
// les routes sœurs pour garder l'entrée active.
const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/app", label: "Tableau de bord", icon: LayoutDashboard, exact: true, tone: "brand" },
      { href: "/app/agenda", label: "Agenda", icon: Calendar, tone: "agenda" },
      { href: "/app/clients", label: "Clients", icon: Users, tone: "clients" },
      { href: "/app/invoices", label: "Factures", icon: Receipt, tone: "factures" },
      { href: "/app/anamnese", label: "Suivi", icon: ClipboardList, match: ["/app/programmes", "/app/forfaits"], tone: "suivi" },
      { href: "/app/chat", label: "Naturobot", icon: Sparkles, match: ["/app/studio-contenu", "/app/naturobot-bibliotheque"], tone: "naturobot" },
      { href: "/app/solutions", label: "Ressources", icon: Leaf, match: ["/app/cadre-legal"], tone: "ressources" },
      { href: "/app/public-page", label: "Ma page publique", icon: Globe, match: ["/app/categories", "/app/availability"], tone: "page-publique" },
      { href: "/app/settings", label: "Paramètres", icon: Settings, match: ["/app/reminders", "/app/email-templates"], tone: "parametres" },
    ],
  },
];

// Phase 3 Lot 4 — whitelist admin côté front (cosmétique uniquement, le backend reste source de vérité)
const ADMIN_EMAIL_WHITELIST = ["jrayes000@gmail.com"];

function initials(name?: string) {
  return (
    (name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

const navItemClass = (active: boolean) =>
  `group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? "bg-primary text-primary-foreground"
      : "text-foreground/80 hover:bg-secondary hover:text-primary"
  }`;

function NavLinks({
  location,
  isAdmin,
  onNavigate,
}: {
  location: string;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="space-y-1">
          {group.label && (
            <p className="px-3 mb-1 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = item.exact
              ? location === item.href
              : [item.href, ...(item.match ?? [])].some((p) => location.startsWith(p));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={navItemClass(active)}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                aria-current={active ? "page" : undefined}
              >
                {/* Icône teintée par domaine (repère de zone) ; blanche quand l'entrée est active. */}
                <Icon className={`h-4 w-4 shrink-0 ${active ? "" : DOMAIN_TONES[item.tone ?? "brand"].icon}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
      {isAdmin && (
        <div className="space-y-1 pt-3 border-t border-sidebar-border">
          <Link
            href="/admin/users"
            onClick={onNavigate}
            className={navItemClass(location.startsWith("/admin/users"))}
            data-testid="nav-admin"
          >
            <Shield className={`h-4 w-4 shrink-0 ${location.startsWith("/admin/users") ? "" : "text-muted-foreground group-hover:text-primary"}`} />
            <span>Admin</span>
          </Link>
          <Link
            href="/admin/assistant"
            onClick={onNavigate}
            className={navItemClass(location.startsWith("/admin/assistant"))}
            data-testid="nav-admin-assistant"
          >
            <BookOpen className={`h-4 w-4 shrink-0 ${location.startsWith("/admin/assistant") ? "" : "text-muted-foreground group-hover:text-primary"}`} />
            <span>Naturobot (admin)</span>
          </Link>
          <Link
            href="/admin/analytics"
            onClick={onNavigate}
            className={navItemClass(location.startsWith("/admin/analytics"))}
            data-testid="nav-admin-analytics"
          >
            <BarChart2 className={`h-4 w-4 shrink-0 ${location.startsWith("/admin/analytics") ? "" : "text-muted-foreground group-hover:text-primary"}`} />
            <span>Conversion (admin)</span>
          </Link>
        </div>
      )}
    </nav>
  );
}

function SidebarFooter({
  user,
  onLogout,
  onNavigate,
}: {
  user: AuthUser | null;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="border-t border-sidebar-border p-3 space-y-1">
      {user && (
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="h-9 w-9 shrink-0 rounded-full bg-secondary text-primary flex items-center justify-center text-sm font-bold">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate text-heading">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
      )}
      {user && (
        <a
          href={`/p/${user.slug}`}
          target="_blank"
          rel="noreferrer"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-primary transition"
          data-testid="link-public-page"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          Voir ma page publique
        </a>
      )}
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
        data-testid="button-logout"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Déconnexion
      </button>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, refetch } = useAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = !!user?.email && ADMIN_EMAIL_WHITELIST.includes(user.email.toLowerCase());

  async function logout() {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.clear();
    refetch();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar desktop — sticky pleine hauteur avec scroll interne */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
        <div className="px-5 py-4 border-b border-sidebar-border">
          <Link href="/app" className="inline-flex" data-testid="link-logo">
            <Logo />
          </Link>
        </div>
        <NavLinks location={location} isAdmin={isAdmin} />
        <SidebarFooter user={user} onLogout={logout} />
      </aside>

      <main className="flex-1 min-w-0">
        {/* Barre supérieure mobile avec menu (drawer) — corrige l'absence de nav < 768px */}
        <header className="md:hidden sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur flex items-center gap-2 px-4 py-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="inline-flex items-center justify-center h-10 w-10 -ml-1 rounded-lg text-foreground hover:bg-secondary transition"
                aria-label="Ouvrir le menu"
                data-testid="button-open-menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-sidebar flex flex-col gap-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-5 py-4 border-b border-sidebar-border">
                <Logo />
              </div>
              <NavLinks location={location} isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
              <SidebarFooter
                user={user}
                onLogout={() => {
                  setMobileOpen(false);
                  logout();
                }}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <Link href="/app" className="inline-flex" aria-label="Tableau de bord">
            <Logo />
          </Link>
        </header>

        <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <TrialBanner />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
