import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "wouter";
import { Calendar, Users, Tag, Globe, ArrowRight, Sparkles, FlaskConical, Euro, Wallet, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";
import { formatTime, formatDay, durationLabel, formatPrice } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { Appointment, Client, AppointmentCategory } from "@shared/schema";

interface StatsOverview {
  caEncaisseCents: number;
  caPrevuCents: number;
  nbRdv: number;
  nbRdvAnnules: number;
  topPrestations: Array<{ name: string; count: number; caCents: number }>;
}

export default function Dashboard() {
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
