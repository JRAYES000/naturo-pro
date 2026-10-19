import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Calendar, Users, Tag, Globe, ArrowRight, CheckCircle2, StickyNote, Megaphone, ListChecks, Circle, X, Download,
  Plus, UserPlus, FileText, Link2, Video, MapPin, Clock, AlertCircle, FileWarning, Check, TrendingUp, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatBand, StatCell, StatCellSkeleton } from "@/components/StatBand";
import { EmptyState } from "@/components/EmptyState";
import { formatTime, durationLabel, formatPrice, formatDateShort } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Appointment, Client, AppointmentCategory, Invoice } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { tenantPathUrl } from "@/lib/tenant";
import { useToast } from "@/hooks/use-toast";
import { FeatureGate } from "@/components/FeatureGate";
import { PendingBookings } from "@/components/PendingBookings";
import {
  type Periode, getPeriodeRange, getPreviousRange, getPeriodeLabel, PREVIOUS_LABEL, deltaPct, fillLabel,
  apptsToClose, overdueInvoices, draftInvoices, groupByDay, dayHeading, isSameLocalDay, untilLabel,
} from "@/lib/dashboard";

interface StatsOverview {
  caEncaisseCents: number;
  caPrevuCents: number;
  nbRdv: number;
  nbRdvAnnules: number;
  topPrestations: Array<{ name: string; count: number; caCents: number }>;
}

const DAY = 86400000;

/** Horloge à la minute : « dans 25 min » et « Aujourd'hui » restent justes si l'onglet reste ouvert. */
function useNow(stepMs = 60000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

function Dashboard() {
  const { user } = useAuth();
  const now = useNow();
  // Fenêtre de chargement figée au montage : ne relance pas la requête chaque minute.
  const [range] = useState(() => ({ from: Date.now() - 30 * DAY, to: Date.now() + 14 * DAY }));

  const { data: appts, isLoading } = useQuery<Appointment[]>({
    // Préfixe /api/appointments : c'est ce que les mutations de l'agenda invalident.
    queryKey: ["/api/appointments", "dashboard", range.from, range.to],
    queryFn: async () => (await apiRequest("GET", `/api/appointments?from=${range.from}&to=${range.to}`)).json(),
  });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: cats } = useQuery<AppointmentCategory[]>({ queryKey: ["/api/categories"] });
  const { data: invoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });

  const catById = useMemo(() => new Map((cats || []).map((c) => [c.id, c])), [cats]);

  const { upcoming, today, nextUp, weekCount, completed30 } = useMemo(() => {
    const list = appts || [];
    const active = list
      .filter((a) => a.endAt > now && a.status !== "cancelled" && a.status !== "blocked")
      .sort((a, b) => a.startAt - b.startAt);
    const todayAll = list
      .filter((a) => isSameLocalDay(a.startAt, now) && a.status !== "cancelled" && a.status !== "blocked")
      .sort((a, b) => a.startAt - b.startAt);
    return {
      upcoming: active.filter((a) => !isSameLocalDay(a.startAt, now)),
      today: todayAll,
      nextUp: active[0],
      weekCount: active.filter((a) => a.startAt < now + 7 * DAY).length,
      completed30: list.filter((a) => a.status === "completed").length,
    };
  }, [appts, now]);

  const toClose = useMemo(() => apptsToClose((appts || []) as any[], now) as Appointment[], [appts, now]);
  const overdue = useMemo(() => overdueInvoices((invoices || []) as any[], now) as Invoice[], [invoices, now]);
  const drafts = useMemo(() => draftInvoices((invoices || []) as any[]) as Invoice[], [invoices]);

  const heure = new Date(now).getHours();
  const salutation = heure >= 5 && heure < 12 ? "Bonjour" : heure >= 12 && heure < 18 ? "Bon après-midi" : "Bonsoir";
  const dateDuJour = new Date(now).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const resume = today.length === 0
    ? "aucun rendez-vous aujourd'hui"
    : `${today.length} rendez-vous aujourd'hui`;

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <PageHeader
          title={`${salutation} ${user?.name?.split(" ")[0] ?? ""}`.trim()}
          subtitle={`${dateDuJour.charAt(0).toUpperCase()}${dateDuJour.slice(1)} — ${resume}`}
        />

        <QuickActions slug={user?.slug} />

        <OnboardingChecklistCard />

        <PendingBookings />

        <div className="grid lg:grid-cols-5 gap-4 mb-6">
          <TodayCard className="lg:col-span-3" today={today} nextUp={nextUp} now={now} catById={catById} loading={isLoading} />
          <TodoCard className="lg:col-span-2" toClose={toClose} overdue={overdue} drafts={drafts} loading={isLoading} />
        </div>

        <h2 className="text-lg mb-3">Activité</h2>
        <StatBand className="mb-6">
          <StatCell label="RDV aujourd'hui" value={today.length} testid="stat-today" />
          <StatCell label="7 prochains jours" value={weekCount} sub={fillLabel(weekCount)} testid="stat-week" />
          <StatCell label="Clients" value={(clients || []).length} testid="stat-clients" />
          <StatCell label="Consultations terminées (30j)" value={completed30} testid="stat-completed" />
        </StatBand>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <UpcomingCard className="lg:col-span-2" upcoming={upcoming} now={now} catById={catById} loading={isLoading} />
          <div className="space-y-4">
            <ShortcutsCard slug={user?.slug} />
            <NoteToSelfCard initial={(user as any)?.dashboardNote ?? ""} />
          </div>
        </div>

        <FinancesSection />
      </div>
    </AppLayout>
  );
}

// ── Actions rapides : les quatre gestes du quotidien, en un clic ─────────────

function QuickActions({ slug }: { slug?: string }) {
  const { toast } = useToast();
  async function copyBookingLink() {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(tenantPathUrl(slug));
      toast({ title: "Lien de réservation copié", description: "Collez-le dans un message ou sur vos réseaux." });
    } catch {
      toast({ title: "Copie impossible", description: tenantPathUrl(slug), variant: "destructive" });
    }
  }
  return (
    <div className="flex flex-wrap gap-2 mb-6" data-testid="row-quick-actions">
      <Button asChild className="rounded-md font-bold" data-testid="button-quick-new-appointment">
        <Link href="/app/agenda?new=1"><Plus className="h-4 w-4 mr-1" />Nouveau rendez-vous</Link>
      </Button>
      <Button asChild variant="outline" className="rounded-md font-bold" data-testid="button-quick-new-client">
        <Link href="/app/clients"><UserPlus className="h-4 w-4 mr-1" />Nouveau client</Link>
      </Button>
      <Button asChild variant="outline" className="rounded-md font-bold" data-testid="button-quick-new-invoice">
        <Link href="/app/invoices/new"><FileText className="h-4 w-4 mr-1" />Nouvelle facture</Link>
      </Button>
      {slug && (
        <Button variant="outline" className="rounded-md font-bold" onClick={copyBookingLink} data-testid="button-copy-booking-link">
          <Link2 className="h-4 w-4 mr-1" />Copier mon lien de réservation
        </Button>
      )}
    </div>
  );
}

// ── Aujourd'hui : la journée en un coup d'œil, prochain RDV mis en avant ────

function TodayCard({ today, nextUp, now, catById, loading, className = "" }: {
  today: Appointment[]; nextUp?: Appointment; now: number; catById: Map<number, AppointmentCategory>; loading: boolean; className?: string;
}) {
  return (
    <section className={`card-naturo ${className}`} data-testid="card-today">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg">Aujourd'hui</h2>
        <Link href="/app/agenda" className="text-sm font-bold text-primary inline-flex items-center gap-1" data-testid="link-agenda-today">
          Agenda <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : today.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4" data-testid="text-today-empty">
          <p>Pas de consultation aujourd'hui.</p>
          {nextUp && (
            <p className="mt-1">
              Prochain rendez-vous : <span className="font-semibold text-foreground">{nextUp.clientFirstName} {nextUp.clientLastName}</span>,{" "}
              {dayHeading(nextUp.startAt, now).toLowerCase()} à {formatTime(nextUp.startAt)}.
            </p>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {today.map((a) => {
            const isNext = nextUp?.id === a.id;
            const past = a.endAt <= now;
            const cat = a.categoryId ? catById.get(a.categoryId) : undefined;
            return (
              <li
                key={a.id}
                className={`flex items-center gap-3 rounded-md border p-3 ${isNext ? "border-primary bg-secondary/50" : "border-border"} ${past ? "opacity-60" : ""}`}
                data-testid={`today-row-${a.id}`}
              >
                <div className="w-14 shrink-0 text-center">
                  <p className="font-bold text-primary tabular-nums">{formatTime(a.startAt)}</p>
                  <p className="text-xs text-muted-foreground">{durationLabel(Math.round((a.endAt - a.startAt) / 60000))}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <ClientName appt={a} />
                  <p className="text-sm text-muted-foreground truncate">
                    {cat?.name ?? "Rendez-vous"}
                    {a.status === "completed" && " • terminé"}
                  </p>
                </div>
                {isNext && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-sm bg-accent/30 px-2 py-0.5 text-xs font-bold text-primary" data-testid="badge-next">
                    <Clock className="h-3 w-3" />{untilLabel(a.startAt, a.endAt, now)}
                  </span>
                )}
                <ApptPlace appt={a} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ClientName({ appt }: { appt: Appointment }) {
  const name = `${appt.clientFirstName ?? ""} ${appt.clientLastName ?? ""}`.trim() || "Client";
  return appt.clientId ? (
    <Link href={`/app/clients/${appt.clientId}`} className="font-bold hover:text-primary truncate block" data-testid={`link-client-${appt.id}`}>
      {name}
    </Link>
  ) : (
    <p className="font-bold truncate">{name}</p>
  );
}

function ApptPlace({ appt }: { appt: Appointment }) {
  if (appt.googleMeetLink) {
    return (
      <Button asChild size="sm" variant="outline" className="rounded-md shrink-0" data-testid={`button-join-${appt.id}`}>
        <a href={appt.googleMeetLink} target="_blank" rel="noreferrer"><Video className="h-4 w-4 mr-1" />Visio</a>
      </Button>
    );
  }
  if (!appt.location) return null;
  return (
    <span className="hidden md:inline-flex items-center gap-1 text-xs text-muted-foreground max-w-40 truncate shrink-0">
      <MapPin className="h-3 w-3 shrink-0" />{appt.location}
    </span>
  );
}

// ── À faire : ce qui attend une action de la praticienne ─────────────────────

function TodoCard({ toClose, overdue, drafts, loading, className = "" }: {
  toClose: Appointment[]; overdue: Invoice[]; drafts: Invoice[]; loading: boolean; className?: string;
}) {
  const { toast } = useToast();
  const closeMut = useMutation({
    mutationFn: async (id: number) => apiRequest("PATCH", `/api/appointments/${id}`, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/overview"] });
      toast({ title: "Consultation marquée terminée" });
    },
    onError: () => toast({ title: "Impossible de mettre à jour ce rendez-vous", variant: "destructive" }),
  });
  const total = toClose.length + overdue.length + drafts.length;

  return (
    <section className={`card-naturo ${className}`} data-testid="card-todo">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg">À faire</h2>
        {total > 0 && <span className="rounded-sm bg-secondary px-2 py-0.5 text-xs font-bold text-primary" data-testid="text-todo-count">{total}</span>}
      </div>
      {loading ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : total === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4" data-testid="text-todo-empty">
          <CheckCircle2 className="h-4 w-4 text-primary" />Tout est à jour.
        </div>
      ) : (
        <div className="space-y-4">
          {toClose.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Consultations à clôturer ({toClose.length})
              </p>
              <ul className="space-y-1.5">
                {toClose.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-center gap-2" data-testid={`todo-close-${a.id}`}>
                    <div className="min-w-0 flex-1 text-sm">
                      <ClientName appt={a} />
                      <p className="text-xs text-muted-foreground">{formatDateShort(a.startAt)} à {formatTime(a.startAt)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-md shrink-0"
                      disabled={closeMut.isPending}
                      onClick={() => closeMut.mutate(a.id)}
                      title="Marquer la consultation comme terminée"
                      data-testid={`button-close-appt-${a.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" />Terminé
                    </Button>
                  </li>
                ))}
              </ul>
              {toClose.length > 4 && (
                <Link href="/app/agenda" className="text-xs font-bold text-primary mt-1.5 inline-block">
                  + {toClose.length - 4} autre{toClose.length - 4 > 1 ? "s" : ""} dans l'agenda
                </Link>
              )}
            </div>
          )}
          {overdue.length > 0 && (
            <Link href="/app/invoices" className="flex items-center gap-2 rounded-md border border-destructive/30 p-2.5 text-sm hover:bg-destructive/5" data-testid="todo-overdue">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <span className="flex-1">
                <strong>{overdue.length} facture{overdue.length > 1 ? "s" : ""} en retard</strong> —{" "}
                {formatPrice(overdue.reduce((s, i) => s + (i.totalCents || 0), 0))}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
          {drafts.length > 0 && (
            <Link href="/app/invoices" className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-secondary/40" data-testid="todo-drafts">
              <FileWarning className="h-4 w-4 text-primary shrink-0" />
              <span className="flex-1">
                <strong>{drafts.length} brouillon{drafts.length > 1 ? "s" : ""}</strong> de facture à émettre
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

// ── Prochains rendez-vous, groupés par jour ──────────────────────────────────

function UpcomingCard({ upcoming, now, catById, loading, className = "" }: {
  upcoming: Appointment[]; now: number; catById: Map<number, AppointmentCategory>; loading: boolean; className?: string;
}) {
  const groups = useMemo(() => groupByDay(upcoming.slice(0, 10)), [upcoming]);
  return (
    <section className={`card-naturo ${className}`} data-testid="card-upcoming">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg">Prochains rendez-vous</h2>
        <Link href="/app/agenda" className="text-sm font-bold text-primary inline-flex items-center gap-1" data-testid="link-agenda">
          Voir l'agenda <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Aucun rendez-vous dans les 14 prochains jours"
          description="Partagez votre lien de réservation pour remplir votre agenda."
          card={false}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 first-letter:uppercase">
                {dayHeading(g.day, now)}
              </p>
              <ul className="divide-y divide-border rounded-md border border-border">
                {g.items.map((a) => {
                  const cat = a.categoryId ? catById.get(a.categoryId) : undefined;
                  return (
                    <li key={a.id} className="flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors" data-testid={`appt-row-${a.id}`}>
                      <p className="w-14 shrink-0 font-bold text-primary tabular-nums">{formatTime(a.startAt)}</p>
                      <div className="min-w-0 flex-1">
                        <ClientName appt={a} />
                        <p className="text-sm text-muted-foreground truncate">
                          {cat?.name ?? "Rendez-vous"} • {durationLabel(Math.round((a.endAt - a.startAt) / 60000))}
                          {a.status === "pending" && " • à valider"}
                        </p>
                      </div>
                      <ApptPlace appt={a} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {upcoming.length > 10 && (
            <Link href="/app/agenda" className="text-sm font-bold text-primary inline-block">
              + {upcoming.length - 10} autres rendez-vous
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

// ── Raccourcis ───────────────────────────────────────────────────────────────

function ShortcutsCard({ slug }: { slug?: string }) {
  const items = [
    { href: "/app/clients", label: "Clients", icon: Users, testid: "quick-clients" },
    { href: "/app/availability", label: "Disponibilités", icon: Calendar, testid: "quick-availability" },
    { href: "/app/studio-contenu", label: "Studio contenu", icon: Megaphone, testid: "quick-studio" },
  ];
  return (
    <section className="card-naturo" data-testid="card-shortcuts">
      <h3 className="mb-3">Raccourcis</h3>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-semibold hover:bg-secondary/50 hover:text-primary" data-testid={it.testid}>
              <it.icon className="h-4 w-4 text-primary" />{it.label}
              <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
            </Link>
          </li>
        ))}
        {slug && (
          <li>
            <a href={tenantPathUrl(slug)} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-semibold hover:bg-secondary/50 hover:text-primary" data-testid="quick-public">
              <Globe className="h-4 w-4 text-primary" />Ma page publique
              <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}

// ── Finances : période, évolution vs période précédente, export, tendance ────

function FinancesSection() {
  const [periode, setPeriode] = useState<Periode>("mois_courant");
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  const { from, to } = useMemo(() => getPeriodeRange(periode), [periode]);
  const prev = useMemo(() => getPreviousRange(periode), [periode]);
  const { data: stats, isLoading: statsLoading } = useQuery<StatsOverview>({
    queryKey: ["/api/stats/overview", from, to],
    queryFn: async () => (await apiRequest("GET", `/api/stats/overview?from=${from}&to=${to}`)).json(),
  });
  const { data: prevStats } = useQuery<StatsOverview>({
    queryKey: ["/api/stats/overview", prev.from, prev.to],
    queryFn: async () => (await apiRequest("GET", `/api/stats/overview?from=${prev.from}&to=${prev.to}`)).json(),
    staleTime: 5 * 60000,
  });
  // CA encaissé mensuel sur 12 mois glissants.
  const { data: revenue = [] } = useQuery<Array<{ month: string; caCents: number }>>({
    queryKey: ["/api/stats/revenue-monthly"],
    queryFn: async () => (await apiRequest("GET", "/api/stats/revenue-monthly")).json(),
  });

  const tauxAnnulation = stats && stats.nbRdv + stats.nbRdvAnnules > 0
    ? Math.round((stats.nbRdvAnnules / (stats.nbRdv + stats.nbRdvAnnules)) * 100)
    : null;

  async function handleExportCsv() {
    setDownloading(true);
    try {
      const res = await apiRequest("GET", `/api/stats/recettes.csv?from=${from}&to=${to}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recettes-${getPeriodeLabel(periode).replace(/\s+/g, "-")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export impossible", description: "Réessayez dans un instant.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  const delta = (cur?: number, old?: number) => <Delta value={cur !== undefined && old !== undefined ? deltaPct(cur, old) : null} label={PREVIOUS_LABEL[periode]} />;

  return (
    <section data-testid="section-finances">
      <div className="flex items-center gap-3 mb-3 flex-wrap" data-testid="row-periode-stats">
        <h2 className="text-lg">Finances</h2>
        <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
          <SelectTrigger className="w-44" data-testid="select-periode" aria-label="Période">
            <SelectValue placeholder="Choisir une période" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mois_courant">Ce mois-ci</SelectItem>
            <SelectItem value="mois_dernier">Mois dernier</SelectItem>
            <SelectItem value="annee">Année en cours</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground capitalize">{getPeriodeLabel(periode)}</span>
        <Button
          onClick={handleExportCsv}
          disabled={downloading}
          variant="outline"
          size="sm"
          className="ml-auto rounded-md font-bold"
          data-testid="button-export-csv"
        >
          <Download className="h-4 w-4 mr-1" />
          {downloading ? "Téléchargement…" : "Exporter les recettes (CSV)"}
        </Button>
      </div>

      <StatBand className="mb-6">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCellSkeleton key={i} />)
        ) : (
          <>
            <StatCell label="CA encaissé" value={formatPrice(stats?.caEncaisseCents ?? 0)} sub={delta(stats?.caEncaisseCents, prevStats?.caEncaisseCents)} testid="stat-ca-encaisse" />
            <StatCell label="CA en attente" value={formatPrice(stats?.caPrevuCents ?? 0)} sub="factures émises non réglées" testid="stat-ca-prevu" />
            <StatCell label="RDV honorés" value={stats?.nbRdv ?? 0} sub={delta(stats?.nbRdv, prevStats?.nbRdv)} testid="stat-rdv-honores" />
            <StatCell
              label="RDV annulés"
              value={stats?.nbRdvAnnules ?? 0}
              testid="stat-rdv-annules"
              sub={tauxAnnulation !== null ? `${tauxAnnulation} % d'annulation` : undefined}
            />
          </>
        )}
      </StatBand>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <RevenueChartCard className="lg:col-span-2" data={revenue} />
        <TopPrestationsCard stats={stats} loading={statsLoading} />
      </div>
    </section>
  );
}

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? "text-primary" : "text-destructive"}`} data-testid="text-delta">
      <Icon className="h-3 w-3" />{up ? "+" : ""}{value} % <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function TopPrestationsCard({ stats, loading }: { stats?: StatsOverview; loading: boolean }) {
  const top = (stats?.topPrestations || []).slice(0, 5);
  const max = Math.max(1, ...top.map((p) => p.count));
  return (
    <section className="card-naturo" data-testid="card-top-prestations">
      <h3 className="mb-3">Top prestations</h3>
      {loading ? (
        <div className="space-y-3" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : top.length === 0 ? (
        <EmptyState icon={Tag} title="Aucune prestation sur la période" description="Vos prestations les plus demandées apparaîtront ici." card={false} />
      ) : (
        <ul className="space-y-3">
          {top.map((p, i) => (
            <li key={p.name} data-testid={`top-prestation-${i}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-semibold truncate">{p.name}</p>
                <p className="shrink-0 text-muted-foreground tabular-nums">
                  {p.count} RDV{p.caCents > 0 && <> • <span className="font-bold text-primary">{formatPrice(p.caCents)}</span></>}
                </p>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round((p.count / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Champ texte libre auto-sauvegardé (débounce 1 s, PATCH /api/profile).
function NoteToSelfCard({ initial }: { initial: string }) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
        setSaved("error");
      }
    }, 1000);
  }

  return (
    <section className="card-naturo" data-testid="card-note-to-self">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3>Note à moi-même</h3>
        </div>
        <span className={`text-xs ${saved === "error" ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
          {saved === "saving" ? "Enregistrement…" : saved === "saved" ? "Enregistré" : saved === "error" ? "Non enregistré" : ""}
        </span>
      </div>
      <textarea
        className="w-full min-h-28 rounded-md border border-input bg-background p-3 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Un pense-bête personnel, visible de vous seule : idées, choses à faire, rappels…"
        aria-label="Note à moi-même"
        value={note}
        onChange={(e) => onChange(e.target.value)}
        data-testid="input-note-to-self"
      />
    </section>
  );
}

// CA encaissé par mois (12 mois glissants), barres CSS pures ; mois en cours en accent.
function RevenueChartCard({ data, className = "" }: { data: Array<{ month: string; caCents: number }>; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.caCents));
  const total = data.reduce((s, d) => s + d.caCents, 0);
  const nonZero = data.filter((d) => d.caCents > 0);
  const average = nonZero.length ? Math.round(total / nonZero.length) : 0;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });
  };
  return (
    <section className={`card-naturo ${className}`} data-testid="card-revenue-chart">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h3>CA encaissé — 12 derniers mois</h3>
        <p className="text-sm">
          <span className="font-bold text-primary">{formatPrice(total)}</span>
          {average > 0 && <span className="text-muted-foreground"> • moyenne {formatPrice(average)}/mois actif</span>}
        </p>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Vos revenus encaissés apparaîtront ici dès votre première facture payée.
        </p>
      ) : (
        <div className="flex items-end gap-1.5 h-36" role="img" aria-label="Évolution mensuelle du chiffre d'affaires encaissé">
          {data.map((d) => {
            const isCurrent = d.month === currentMonth;
            return (
              <div key={d.month} className="group relative flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full" title={`${monthLabel(d.month)} : ${formatPrice(d.caCents)}`}>
                <span className="pointer-events-none absolute -top-1 hidden group-hover:block rounded-sm bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background whitespace-nowrap shadow-md z-10">
                  {formatPrice(d.caCents)}
                </span>
                <div
                  className={`w-full rounded-t-sm transition-colors ${isCurrent ? "bg-accent" : "bg-primary/70 group-hover:bg-primary"}`}
                  style={{ height: `${Math.max(2, Math.round((d.caCents / max) * 85))}%` }}
                  data-testid={`bar-revenue-${d.month}`}
                />
                <span className={`text-[10px] truncate ${isCurrent ? "font-bold text-primary" : "text-muted-foreground"}`}>{monthLabel(d.month)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Checklist de démarrage persistante : état réel calculé côté serveur sur les
// données existantes, masquable définitivement. Repliable une fois bien entamée.
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
  const [expanded, setExpanded] = useState<boolean | null>(null);
  if (!data || data.hiddenAt) return null;
  const done = CHECKLIST_STEPS.filter((s) => data.steps[s.key]).length;
  if (done === CHECKLIST_STEPS.length) return null;
  const nextStep = CHECKLIST_STEPS.find((s) => !data.steps[s.key])!;
  // Repliée par défaut dès que la moitié est faite : on ne montre que l'étape suivante.
  const open = expanded ?? done < CHECKLIST_STEPS.length / 2;
  return (
    <div className="mb-6 rounded-lg border border-primary/20 bg-secondary/40 p-4 sm:p-5" data-testid="card-onboarding-checklist">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <p className="font-bold text-heading">Bien démarrer avec Naturo Pro — {done}/{CHECKLIST_STEPS.length}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setExpanded(!open)}
            className="text-xs font-bold text-primary hover:underline"
            aria-expanded={open}
            data-testid="button-toggle-checklist"
          >
            {open ? "Réduire" : "Tout voir"}
          </button>
          <button
            onClick={() => hideMut.mutate()}
            className="text-muted-foreground hover:text-foreground"
            title="Masquer définitivement cette checklist"
            aria-label="Masquer la checklist"
            data-testid="button-hide-checklist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="h-2 rounded-full bg-border mb-4 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((done / CHECKLIST_STEPS.length) * 100)}%` }} />
      </div>
      {open ? (
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {CHECKLIST_STEPS.map((s) => {
            const ok = !!data.steps[s.key];
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={`flex items-center gap-2 text-sm py-1 rounded-sm hover:text-primary ${ok ? "text-muted-foreground line-through" : "font-semibold"}`}
                  data-testid={`checklist-step-${s.key}`}
                >
                  {ok ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Link href={nextStep.href} className="inline-flex items-center gap-2 text-sm font-semibold hover:text-primary" data-testid={`checklist-step-${nextStep.key}`}>
          <Circle className="h-4 w-4 text-muted-foreground" />Prochaine étape : {nextStep.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

// Gating interface : écran payant remplacé par un état bloqué explicite
// (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function DashboardGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="Le tableau de bord" description="Vos indicateurs d'activité (RDV, CA, remplissage) sont réservés à l'abonnement Naturo Pro." />;
  }
  return <Dashboard />;
}
