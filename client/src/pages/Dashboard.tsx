import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Calendar, Users, Tag, Globe, ArrowRight, Sparkles, FlaskConical, Euro, Wallet, CheckCircle2, XCircle, TrendingUp, StickyNote, Megaphone, ListChecks, Circle, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { formatTime, formatDay, durationLabel, formatPrice } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Appointment, Client, AppointmentCategory } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

interface StatsOverview {
  caEncaisseCents: number;
  caPrevuCents: number;
  nbRdv: number;
  nbRdvAnnules: number;
  topPrestations: Array<{ name: string; count: number; caCents: number }>;
}

function Dashboard() {
  const { user } = useAuth();
  const now = useMemo(() => Date.now(), []);
  const in14d = now + 14 * 86400000;
  const last30d = now - 30 * 86400000;

  const { data: appts, isLoading } = useQuery<Appointment[]>({
    // Préfixe /api/appointments : c'est ce que les mutations de l'agenda invalident.
    // Avec l'ancienne clé "appointments-dashboard", le tableau de bord gardait des
    // données périmées après création ou modification d'un rendez-vous.
    queryKey: ["/api/appointments", "dashboard", last30d, in14d],
    queryFn: async () => (await apiRequest("GET", `/api/appointments?from=${last30d}&to=${in14d}`)).json(),
  });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: cats } = useQuery<AppointmentCategory[]>({ queryKey: ["/api/categories"] });
  const { data: stats, isLoading: statsLoading } = useQuery<StatsOverview>({
    queryKey: ["/api/stats/overview"],
    queryFn: async () => (await apiRequest("GET", "/api/stats/overview")).json(),
  });
  // Lot 4 (action C2) — CA encaissé mensuel sur 12 mois glissants.
  const { data: revenue = [] } = useQuery<Array<{ month: string; caCents: number }>>({
    queryKey: ["/api/stats/revenue-monthly"],
    queryFn: async () => (await apiRequest("GET", "/api/stats/revenue-monthly")).json(),
  });

  const upcoming = (appts || []).filter(a => a.startAt >= now && a.status !== "cancelled").sort((a,b) => a.startAt - b.startAt);
  const todayCount = upcoming.filter(a => new Date(a.startAt).toDateString() === new Date().toDateString()).length;
  const thisWeekCount = upcoming.filter(a => a.startAt < now + 7 * 86400000).length;
  const completed = (appts || []).filter(a => a.status === "completed").length;

  const heure = new Date().getHours();
  const salutation = heure >= 5 && heure < 12 ? "Bonjour" : heure >= 12 && heure < 18 ? "Bon après-midi" : "Bonsoir";
  const dateDuJour = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const tauxAnnulation = stats && stats.nbRdv + stats.nbRdvAnnules > 0
    ? Math.round((stats.nbRdvAnnules / (stats.nbRdv + stats.nbRdvAnnules)) * 100)
    : null;

  const remplissageLabel = thisWeekCount >= 16 ? "Semaine complète" : thisWeekCount >= 6 ? "Semaine chargée" : "Semaine calme";

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <PageHeader
          kicker={`${salutation} ${user?.name?.split(" ")[0] ?? ""}`.trim()}
          title="Votre cabinet, en un coup d'œil"
          subtitle={dateDuJour}
        />

        {user?.plan === "active" && (
          <div
            className="mb-8 rounded-lg border border-primary/20 bg-secondary/40 p-4 sm:p-5"
            data-testid="banner-beta"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-accent/30 flex items-center justify-center text-primary">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div className="text-sm leading-relaxed">
                <p className="font-extrabold text-heading mb-1">Naturo Pro est en version bêta 🧪</p>
                <p className="text-muted-foreground">
                  Vous utilisez actuellement une version de test. L'ouverture officielle est prévue le{" "}
                  <strong className="text-foreground font-bold">1ᵉʳ septembre 2026</strong>. Si vous rencontrez
                  un bug ou un comportement inattendu, n'hésitez pas à me contacter à{" "}
                  <a
                    href="mailto:contact@ecole-naturo.fr"
                    className="font-bold text-primary underline underline-offset-2"
                    data-testid="link-beta-contact"
                  >
                    contact@ecole-naturo.fr
                  </a>{" "}
                  — votre retour m'aide à améliorer l'outil. Merci !
                </p>
              </div>
            </div>
          </div>
        )}

        <OnboardingChecklistCard />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard label="RDV aujourd'hui" value={todayCount} icon={Calendar} testid="stat-today" />
          <StatCard label="Cette semaine" value={thisWeekCount} icon={Sparkles} testid="stat-week" />
          <StatCard label="Clients" value={(clients || []).length} icon={Users} testid="stat-clients" />
          <StatCard label="Consultations terminées (30j)" value={completed} icon={Tag} testid="stat-completed" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div className="card-naturo" key={i}>
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-32" />
              </div>
            ))
          ) : (
            <>
              <StatCard label="CA encaissé (mois)" value={formatPrice(stats?.caEncaisseCents ?? 0)} icon={Euro} testid="stat-ca-encaisse" />
              <StatCard label="CA prévu" value={formatPrice(stats?.caPrevuCents ?? 0)} icon={Wallet} testid="stat-ca-prevu" />
              <StatCard label="RDV honorés (mois)" value={stats?.nbRdv ?? 0} icon={CheckCircle2} testid="stat-rdv-honores" />
              <StatCard
                label="RDV annulés (mois)"
                value={stats?.nbRdvAnnules ?? 0}
                icon={XCircle}
                testid="stat-rdv-annules"
                sub={tauxAnnulation !== null ? `${tauxAnnulation}% d'annulation` : undefined}
              />
            </>
          )}
        </div>

        {/* Lot 4 (action C2) — note libre + tendance de revenus sans ouvrir Factures */}
        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <RevenueChartCard data={revenue} />
          <NoteToSelfCard initial={(user as any)?.dashboardNote ?? ""} />
        </div>

        <div className="card-naturo mb-8 flex items-center gap-4" data-testid="card-remplissage-semaine">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-secondary flex items-center justify-center text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Remplissage des 7 prochains jours</p>
            <p className="font-extrabold text-heading">
              {thisWeekCount} RDV — <span className="text-primary">{remplissageLabel}</span>
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card-naturo">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-extrabold">Prochains rendez-vous</h2>
              <Link href="/app/agenda" className="text-sm font-bold text-primary inline-flex items-center gap-1" data-testid="link-agenda">
                Voir l'agenda <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-3" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Aucun rendez-vous à venir"
                description="Vos prochaines consultations apparaîtront ici."
                card={false}
              />
            ) : (
              <ul className="space-y-3">
                {upcoming.slice(0, 6).map(a => {
                  const cat = cats?.find(c => c.id === a.categoryId);
                  return (
                    <li key={a.id} className="flex items-center gap-4 p-3 rounded-xl border border-border bg-secondary/30 hover:bg-secondary transition" data-testid={`appt-row-${a.id}`}>
                      <div className="text-center min-w-[72px]">
                        <p className="text-xs uppercase font-bold text-primary">{new Date(a.startAt).toLocaleDateString("fr-FR", { weekday: "short" })}</p>
                        <p className="text-2xl font-extrabold leading-none text-heading">{new Date(a.startAt).getDate()}</p>
                        <p className="text-xs text-muted-foreground">{new Date(a.startAt).toLocaleDateString("fr-FR", { month: "short" })}</p>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold">{a.clientFirstName} {a.clientLastName}</p>
                        <p className="text-sm text-muted-foreground">{cat?.name} • {durationLabel(cat?.durationMinutes || 60)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatTime(a.startAt)}</p>
                        <p className="text-xs text-muted-foreground">{a.location}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <Link href="/app/clients" className="card-naturo block hover:-translate-y-0.5 transition" data-testid="quick-clients">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center text-primary"><Users className="h-5 w-5" /></div>
                <div>
                  <h3 className="font-extrabold">Clients</h3>
                  <p className="text-xs text-muted-foreground">Gérer les fiches</p>
                </div>
              </div>
            </Link>
            <Link href="/app/availability" className="card-naturo block hover:-translate-y-0.5 transition" data-testid="quick-availability">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center text-primary"><Calendar className="h-5 w-5" /></div>
                <div>
                  <h3 className="font-extrabold">Disponibilités</h3>
                  <p className="text-xs text-muted-foreground">Vos plages horaires</p>
                </div>
              </div>
            </Link>
            {/* Lot 4 (action P5) — mise en avant du Studio contenu */}
            <Link href="/app/studio-contenu" className="card-naturo block hover:-translate-y-0.5 transition border-primary/30 bg-secondary/40" data-testid="quick-studio">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/30 flex items-center justify-center text-primary"><Megaphone className="h-5 w-5" /></div>
                <div>
                  <h3 className="font-extrabold">Studio contenu ✨</h3>
                  <p className="text-xs text-muted-foreground">Générez vos posts Instagram et Facebook en quelques clics.</p>
                </div>
              </div>
            </Link>
            {user && (
              <a href={`/p/${user.slug}`} target="_blank" rel="noreferrer" className="card-naturo block hover:-translate-y-0.5 transition" data-testid="quick-public">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/30 flex items-center justify-center text-primary"><Globe className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-extrabold">Page publique</h3>
                    <p className="text-xs text-muted-foreground">naturo.pro/p/{user.slug}</p>
                  </div>
                </div>
              </a>
            )}

            <div className="card-naturo" data-testid="card-top-prestations">
              <h3 className="font-extrabold mb-3">Top prestations du mois</h3>
              {statsLoading ? (
                <div className="space-y-3" aria-busy="true">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (stats?.topPrestations || []).length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title="Aucune prestation ce mois"
                  description="Vos prestations les plus demandées apparaîtront ici."
                  card={false}
                />
              ) : (
                <ul className="space-y-3">
                  {stats!.topPrestations.slice(0, 3).map((p, i) => (
                    <li key={p.name} className="flex items-center justify-between gap-3" data-testid={`top-prestation-${i}`}>
                      <div className="min-w-0">
                        <p className="font-bold truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.count} RDV</p>
                      </div>
                      <p className="font-extrabold text-primary shrink-0">{formatPrice(p.caCents)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// Lot 4 (action C2) — champ texte libre auto-sauvegardé (débounce 1 s, PATCH /api/profile).
function NoteToSelfCard({ initial }: { initial: string }) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onChange(v: string) {
    setNote(v);
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (v === lastSaved.current) { setSaved("idle"); return; }
      try {
        await apiRequest("PATCH", "/api/profile", { dashboardNote: v || null });
        lastSaved.current = v;
        setSaved("saved");
      } catch {
        setSaved("idle");
      }
    }, 1000);
  }

  return (
    <div className="card-naturo" data-testid="card-note-to-self">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3 className="font-extrabold">Note à moi-même</h3>
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {saved === "saving" ? "Enregistrement…" : saved === "saved" ? "Enregistré ✓" : ""}
        </span>
      </div>
      <textarea
        className="w-full min-h-[120px] rounded-[12px] border border-input bg-background p-3 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Un pense-bête personnel, visible de vous seule : idées, choses à faire, rappels…"
        value={note}
        onChange={(e) => onChange(e.target.value)}
        data-testid="input-note-to-self"
      />
    </div>
  );
}

// Lot 4 (action C2) — CA encaissé par mois (12 mois glissants), barres CSS pures.
function RevenueChartCard({ data }: { data: Array<{ month: string; caCents: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.caCents));
  const total = data.reduce((s, d) => s + d.caCents, 0);
  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("fr-FR", { month: "short" });
  };
  return (
    <div className="card-naturo" data-testid="card-revenue-chart">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold">CA encaissé — 12 derniers mois</h3>
        <span className="text-sm font-bold text-primary">{formatPrice(total)}</span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Vos revenus encaissés apparaîtront ici dès votre première facture payée.
        </p>
      ) : (
        <div className="flex items-end gap-1.5 h-32" role="img" aria-label="Évolution mensuelle du chiffre d'affaires encaissé">
          {data.map((d) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${monthLabel(d.month)} : ${formatPrice(d.caCents)}`}>
              <div
                className="w-full rounded-t-md bg-primary/80 hover:bg-primary transition-colors"
                style={{ height: `${Math.max(2, Math.round((d.caCents / max) * 100))}%` }}
                data-testid={`bar-revenue-${d.month}`}
              />
              <span className="text-[10px] text-muted-foreground truncate">{monthLabel(d.month)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lot 4 (action C3) — checklist de démarrage persistante : état réel calculé
// côté serveur sur les données existantes, masquable définitivement.
const CHECKLIST_STEPS: Array<{ key: string; label: string; href: string }> = [
  { key: "profil", label: "Compléter votre profil (bio)", href: "/app/settings" },
  { key: "prestation", label: "Créer votre première prestation", href: "/app/categories" },
  { key: "disponibilites", label: "Définir vos disponibilités", href: "/app/availability" },
  { key: "client", label: "Ajouter votre premier client", href: "/app/clients" },
  { key: "rdv", label: "Planifier votre premier rendez-vous", href: "/app/agenda" },
  { key: "anamnese", label: "Créer votre premier modèle d'anamnèse", href: "/app/anamnese" },
  { key: "pagePublique", label: "Personnaliser votre page publique (photo)", href: "/app/public-page" },
  { key: "google", label: "Connecter Google Agenda (visio, synchronisation)", href: "/app/settings" },
];

function OnboardingChecklistCard() {
  const { data } = useQuery<{ hiddenAt: number | null; steps: Record<string, boolean> }>({
    queryKey: ["/api/onboarding/checklist"],
    queryFn: async () => (await apiRequest("GET", "/api/onboarding/checklist")).json(),
  });
  const hideMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/profile", { onboardingChecklistHiddenAt: Date.now() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/onboarding/checklist"] }),
  });
  if (!data || data.hiddenAt) return null;
  const done = CHECKLIST_STEPS.filter((s) => data.steps[s.key]).length;
  if (done === CHECKLIST_STEPS.length) return null;
  return (
    <div className="mb-6 rounded-lg border border-primary/20 bg-secondary/40 p-4 sm:p-5" data-testid="card-onboarding-checklist">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <p className="font-extrabold text-heading">Bien démarrer avec Naturo Pro — {done}/{CHECKLIST_STEPS.length}</p>
        </div>
        <button
          onClick={() => hideMut.mutate()}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title="Masquer définitivement cette checklist"
          aria-label="Masquer la checklist"
          data-testid="button-hide-checklist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-2 rounded-full bg-border mb-4 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((done / CHECKLIST_STEPS.length) * 100)}%` }} />
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {CHECKLIST_STEPS.map((s) => {
          const ok = !!data.steps[s.key];
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                className={`flex items-center gap-2 text-sm py-1 rounded hover:text-primary ${ok ? "text-muted-foreground line-through" : "font-semibold"}`}
                data-testid={`checklist-step-${s.key}`}
              >
                {ok ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, testid, sub }: any) {
  return (
    <div className="card-naturo" data-testid={testid}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="text-3xl font-extrabold text-heading">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function DashboardGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="Le tableau de bord" description="Vos indicateurs d'activité (RDV, CA, remplissage) sont réservés à l'abonnement Naturo Pro." />;
  }
  return <Dashboard />;
}
