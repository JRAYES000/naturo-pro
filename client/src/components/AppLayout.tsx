import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Calendar, Users, Tag, Clock, Globe, Settings, LogOut, ExternalLink, Receipt, Shield, Bell, MailOpen, ClipboardList, FileText, BarChart2, Leaf,
} from "lucide-react";
import { Logo } from "./Logo";
import { TrialBanner } from "./TrialBanner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

const NAV = [
  { href: "/app", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/app/agenda", label: "Agenda", icon: Calendar },
  { href: "/app/clients", label: "Clients", icon: Users },
  { href: "/app/invoices", label: "Factures", icon: Receipt },
  { href: "/app/categories", label: "Prestations", icon: Tag },
  { href: "/app/availability", label: "Disponibilités", icon: Clock },
  { href: "/app/public-page", label: "Page publique", icon: Globe },
  { href: "/app/reminders", label: "Rappels", icon: Bell },
  { href: "/app/email-templates", label: "Templates email", icon: MailOpen },
  { href: "/app/anamnese", label: "Anamnèses", icon: ClipboardList },
  { href: "/app/programmes", label: "Programmes", icon: FileText },
  { href: "/app/solutions", label: "Solutions naturelles", icon: Leaf },
  { href: "/app/stats", label: "Statistiques", icon: BarChart2 },
  { href: "/app/settings", label: "Paramètres", icon: Settings },
];

// Phase 3 Lot 4 — whitelist admin côté front (cosmétique uniquement, le backend reste source de vérité)
const ADMIN_EMAIL_WHITELIST = ["jrayes000@gmail.com"];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, refetch } = useAuth();
  const [location, navigate] = useLocation();
  const isAdmin = !!user?.email && ADMIN_EMAIL_WHITELIST.includes(user.email.toLowerCase());

  async function logout() {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.clear();
    refetch();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <Logo />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(item => {
            const active = item.exact ? location === item.href : location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-secondary"
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {/* Phase 3 Lot 4 — lien Admin visible uniquement pour la whitelist */}
          {isAdmin && (
            <Link
              href="/admin/users"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                location.startsWith("/admin")
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-secondary"
              }`}
              data-testid="nav-admin"
            >
              <Shield className="h-4 w-4" />
              <span>Admin</span>
            </Link>
          )}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-1">
          {user && (
            <a
              href={`/#/p/${user.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-primary"
              data-testid="link-public-page"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Voir ma page publique
            </a>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-destructive"
            data-testid="button-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="md:hidden border-b border-border bg-card flex items-center justify-between px-4 py-3">
          <Logo />
          <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout-mobile">
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
          <TrialBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
