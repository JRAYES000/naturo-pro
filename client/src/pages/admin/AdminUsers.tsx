import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Search, ExternalLink, Clock, Check, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

type AdminUser = {
  id: number;
  email: string;
  name: string;
  slug: string;
  plan?: string;
  trialEndsAt?: number | null;
  emailVerifiedAt?: number | null;
  onboardingCompletedAt?: number | null;
  createdAt: number;
  daysUntilTrialEnds?: number | null;
  _stats: { appointments: number; clients: number; invoices: number };
};

function planBadge(plan?: string) {
  if (plan === "active") {
    return <Badge style={{ background: "#186749", color: "#fff" }}>Actif</Badge>;
  }
  if (plan === "suspended") {
    return <Badge style={{ background: "#b91c1c", color: "#fff" }}>Suspendu</Badge>;
  }
  return <Badge style={{ background: "#ea580c", color: "#fff" }}>Essai</Badge>;
}

function fmtDate(ts?: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function trialDays(u: AdminUser): string {
  if (u.plan !== "trial") return "—";
  if (typeof u.daysUntilTrialEnds === "number") return `${u.daysUntilTrialEnds} j`;
  if (!u.trialEndsAt) return "—";
  const ms = u.trialEndsAt - Date.now();
  if (ms <= 0) return "0 j";
  return `${Math.ceil(ms / 86400000)} j`;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ users: AdminUser[]; total: number }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/users?limit=500")).json(),
    retry: false,
  });

  const filtered = useMemo(() => {
    const list = data?.users || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.slug.toLowerCase().includes(q),
    );
  }, [data, search]);

  const extendTrial = useMutation({
    mutationFn: async ({ id, days }: { id: number; days: number }) => {
      await apiRequest("POST", `/api/admin/users/${id}/extend-trial`, { days });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Trial prolongé", description: "Le compte a été mis à jour." });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Action impossible", variant: "destructive" }),
  });

  const setPlan = useMutation({
    mutationFn: async ({ id, plan }: { id: number; plan: "active" | "suspended" | "trial" }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}`, { plan });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Compte mis à jour" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Action impossible", variant: "destructive" }),
  });

  const impersonate = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/users/${id}/impersonate`, {});
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Connecté en tant que cet utilisateur" });
      window.location.hash = "#/app";
      window.location.reload();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Impossible", variant: "destructive" }),
  });

  if (error) {
    const msg = (error as any)?.message || "";
    const denied = msg.includes("refus") || msg.includes("403") || msg.includes("Non auth");
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto card-naturo text-center py-10">
          <Shield className="h-10 w-10 mx-auto mb-3 text-destructive" />
          <h1 className="text-xl font-extrabold mb-2" style={{ color: "#1b4332" }}>
            {denied ? "Accès refusé" : "Erreur"}
          </h1>
          <p className="text-muted-foreground">
            {denied ? "Vous n'avez pas les droits pour accéder à cette page." : msg}
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6" style={{ color: "#186749" }} />
          <h1 className="text-2xl font-extrabold" style={{ color: "#1b4332" }}>Administration · Utilisateurs</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, email ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-users"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filtered.length} / {data?.total ?? 0} utilisateurs
          </div>
        </div>

        <div className="card-naturo overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border bg-secondary/40">
                <th className="px-3 py-2 font-bold">Nom</th>
                <th className="px-3 py-2 font-bold">Email</th>
                <th className="px-3 py-2 font-bold">Slug</th>
                <th className="px-3 py-2 font-bold">Plan</th>
                <th className="px-3 py-2 font-bold">Trial</th>
                <th className="px-3 py-2 font-bold">Email</th>
                <th className="px-3 py-2 font-bold">Onboard.</th>
                <th className="px-3 py-2 font-bold">Inscription</th>
                <th className="px-3 py-2 font-bold">Stats</th>
                <th className="px-3 py-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Chargement…</td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Aucun utilisateur.</td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border hover:bg-secondary/30"
                  data-testid={`row-user-${u.id}`}
                >
                  <td className="px-3 py-2 font-semibold">{u.name}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2 font-mono text-xs">{u.slug}</td>
                  <td className="px-3 py-2">{planBadge(u.plan)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {trialDays(u)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.emailVerifiedAt ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-destructive" />}
                  </td>
                  <td className="px-3 py-2">
                    {u.onboardingCompletedAt ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-destructive" />}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {u._stats.appointments} RDV · {u._stats.clients} clients · {u._stats.invoices} factures
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Link href={`/admin/users/${u.id}`}>
                        <Button size="sm" variant="outline" className="rounded-[10px] h-7 px-2 text-xs" data-testid={`button-view-${u.id}`}>
                          Voir
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-[10px] h-7 px-2 text-xs"
                        disabled={extendTrial.isPending}
                        onClick={() => extendTrial.mutate({ id: u.id, days: 30 })}
                        data-testid={`button-extend-trial-${u.id}`}
                      >
                        +30j
                      </Button>
                      {u.plan !== "active" && (
                        <Button
                          size="sm"
                          className="rounded-[10px] h-7 px-2 text-xs"
                          style={{ background: "#186749", color: "#fff" }}
                          disabled={setPlan.isPending}
                          onClick={() => setPlan.mutate({ id: u.id, plan: "active" })}
                          data-testid={`button-activate-${u.id}`}
                        >
                          Activer
                        </Button>
                      )}
                      {u.plan !== "suspended" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-[10px] h-7 px-2 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                          disabled={setPlan.isPending}
                          onClick={() => {
                            if (!confirm(`Suspendre le compte de ${u.email} ?`)) return;
                            setPlan.mutate({ id: u.id, plan: "suspended" });
                          }}
                          data-testid={`button-suspend-${u.id}`}
                        >
                          Suspendre
                        </Button>
                      )}
                      {user?.id !== u.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-[10px] h-7 px-2 text-xs"
                          disabled={impersonate.isPending}
                          onClick={() => {
                            if (!confirm(`Se connecter en tant que ${u.email} ? Votre session admin sera remplacée.`)) return;
                            impersonate.mutate(u.id);
                          }}
                          data-testid={`button-impersonate-${u.id}`}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Connecter
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
