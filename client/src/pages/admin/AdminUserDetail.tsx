import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, ExternalLink } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
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

function fmtDateTime(ts?: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("fr-FR");
}

function planBadge(plan?: string) {
  if (plan === "active") return <Badge style={{ background: "#186749", color: "#fff" }}>Actif</Badge>;
  if (plan === "suspended") return <Badge style={{ background: "#b91c1c", color: "#fff" }}>Suspendu</Badge>;
  return <Badge style={{ background: "#ea580c", color: "#fff" }}>Essai</Badge>;
}

function toLocalInput(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminUserDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user: me } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data, isLoading, error, refetch } = useQuery<{ user: AdminUser }>({
    queryKey: ["/api/admin/users", id],
    queryFn: async () => (await apiRequest("GET", `/api/admin/users/${id}`)).json(),
    retry: false,
  });

  const u = data?.user;
  const [plan, setPlanLocal] = useState<string>("trial");
  const [trialEndsAtInput, setTrialEndsAtInput] = useState<string>("");
  const [emailVerified, setEmailVerified] = useState<boolean>(false);

  useEffect(() => {
    if (!u) return;
    setPlanLocal(u.plan || "trial");
    setTrialEndsAtInput(toLocalInput(u.trialEndsAt));
    setEmailVerified(!!u.emailVerifiedAt);
  }, [u?.id, u?.plan, u?.trialEndsAt, u?.emailVerifiedAt]);

  const patch = useMutation({
    mutationFn: async (body: any) => {
      await apiRequest("PATCH", `/api/admin/users/${id}`, body);
    },
    onSuccess: async () => {
      await refetch();
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur mis à jour", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Action impossible", variant: "destructive" }),
  });

  const extendTrial = useMutation({
    mutationFn: async (days: number) => {
      await apiRequest("POST", `/api/admin/users/${id}/extend-trial`, { days });
    },
    onSuccess: async () => {
      await refetch();
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Trial prolongé", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Action impossible", variant: "destructive" }),
  });

  const impersonate = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/users/${id}/impersonate`, {});
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Connecté en tant que cet utilisateur", variant: "success" });
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

  if (isLoading || !u) {
    return (
      <AppLayout>
        <div className="text-muted-foreground">Chargement…</div>
      </AppLayout>
    );
  }

  function save() {
    const body: any = { plan };
    if (trialEndsAtInput) {
      body.trialEndsAt = new Date(trialEndsAtInput).getTime();
    } else {
      body.trialEndsAt = null;
    }
    body.emailVerifiedAt = emailVerified ? (u!.emailVerifiedAt || Date.now()) : null;
    patch.mutate(body);
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader
          title={u.name || "Détail utilisateur"}
          icon={Shield}
          backTo={{ href: "/admin/users", label: "Utilisateurs" }}
          actions={planBadge(u.plan)}
        />

        <div className="card-naturo space-y-3">
          <h2 className="font-bold text-lg" style={{ color: "#1b4332" }}>Identité</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Email · </span><span className="font-semibold">{u.email}</span></div>
            <div><span className="text-muted-foreground">Slug · </span><span className="font-mono">{u.slug}</span></div>
            <div><span className="text-muted-foreground">ID · </span><span className="font-mono">{u.id}</span></div>
            <div><span className="text-muted-foreground">Inscrit le · </span><span>{fmtDateTime(u.createdAt)}</span></div>
            <div><span className="text-muted-foreground">Email vérifié · </span><span>{fmtDateTime(u.emailVerifiedAt)}</span></div>
            <div><span className="text-muted-foreground">Onboarding · </span><span>{fmtDateTime(u.onboardingCompletedAt)}</span></div>
          </div>
        </div>

        <div className="card-naturo space-y-3">
          <h2 className="font-bold text-lg" style={{ color: "#1b4332" }}>Statistiques</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-[15px] bg-secondary/50">
              <div className="text-2xl font-extrabold" style={{ color: "#186749" }}>{u._stats.appointments}</div>
              <div className="text-xs text-muted-foreground">Rendez-vous</div>
            </div>
            <div className="p-3 rounded-[15px] bg-secondary/50">
              <div className="text-2xl font-extrabold" style={{ color: "#186749" }}>{u._stats.clients}</div>
              <div className="text-xs text-muted-foreground">Clients</div>
            </div>
            <div className="p-3 rounded-[15px] bg-secondary/50">
              <div className="text-2xl font-extrabold" style={{ color: "#186749" }}>{u._stats.invoices}</div>
              <div className="text-xs text-muted-foreground">Factures</div>
            </div>
          </div>
        </div>

        <div className="card-naturo space-y-4">
          <h2 className="font-bold text-lg" style={{ color: "#1b4332" }}>Modifier l'abonnement</h2>
          <div>
            <Label htmlFor="plan">Plan</Label>
            <select
              id="plan"
              value={plan}
              onChange={(e) => setPlanLocal(e.target.value)}
              className="w-full rounded-[10px] border border-input px-3 py-2 bg-background"
              data-testid="select-plan"
            >
              <option value="trial">Essai (trial)</option>
              <option value="active">Actif (active)</option>
              <option value="suspended">Suspendu (suspended)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="trial-ends">Fin d'essai</Label>
            <Input
              id="trial-ends"
              type="datetime-local"
              value={trialEndsAtInput}
              onChange={(e) => setTrialEndsAtInput(e.target.value)}
              data-testid="input-trial-ends"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="email-verified"
              type="checkbox"
              checked={emailVerified}
              onChange={(e) => setEmailVerified(e.target.checked)}
              data-testid="checkbox-email-verified"
            />
            <Label htmlFor="email-verified" className="cursor-pointer">Email vérifié</Label>
          </div>
          <Button
            onClick={save}
            disabled={patch.isPending}
            className="rounded-[15px] py-6 font-bold w-full sm:w-auto"
            data-testid="button-save"
          >
            {patch.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>

        <div className="card-naturo space-y-3">
          <h2 className="font-bold text-lg" style={{ color: "#1b4332" }}>Actions rapides</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-[15px] font-bold"
              disabled={extendTrial.isPending}
              onClick={() => extendTrial.mutate(7)}
              data-testid="button-extend-7"
            >
              Prolonger trial +7j
            </Button>
            <Button
              variant="outline"
              className="rounded-[15px] font-bold"
              disabled={extendTrial.isPending}
              onClick={() => extendTrial.mutate(30)}
              data-testid="button-extend-30"
            >
              Prolonger trial +30j
            </Button>
            <Button
              variant="outline"
              className="rounded-[15px] font-bold"
              disabled={extendTrial.isPending}
              onClick={() => extendTrial.mutate(90)}
              data-testid="button-extend-90"
            >
              Prolonger trial +90j
            </Button>
            <Button
              variant="outline"
              className="rounded-[15px] font-bold"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ emailVerifiedAt: Date.now() })}
              data-testid="button-force-email-verified"
            >
              Forcer email vérifié
            </Button>
          </div>
        </div>

        {me?.id !== u.id && (
          <div className="card-naturo space-y-3">
            <h2 className="font-bold text-lg" style={{ color: "#1b4332" }}>Mode incarnation</h2>
            <p className="text-sm text-muted-foreground">
              Se connecter en tant que cet utilisateur pour debug. Votre session admin sera remplacée.
            </p>
            <Button
              onClick={async () => {
                if (!(await confirm({
                  title: "Se connecter en tant que cet utilisateur ?",
                  description: `Votre session admin sera remplacée par celle de ${u.email}. Vous devrez vous reconnecter pour revenir à votre compte.`,
                  confirmLabel: "Se connecter",
                  cancelLabel: "Annuler",
                  destructive: true,
                }))) return;
                impersonate.mutate();
              }}
              disabled={impersonate.isPending}
              className="rounded-[15px] py-6 font-bold"
              data-testid="button-impersonate"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Se connecter en tant que cet utilisateur
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
