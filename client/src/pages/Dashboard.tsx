import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "wouter";
import { Calendar, Users, Tag, Globe, ArrowRight, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";
import { formatTime, formatDay, durationLabel } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { Appointment, Client, AppointmentCategory } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();
  const now = useMemo(() => Date.now(), []);
  const in14d = now + 14 * 86400000;
  const last30d = now - 30 * 86400000;

  const { data: appts, isLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments-dashboard"],
    queryFn: async () => (await apiRequest("GET", `/api/appointments?from=${last30d}&to=${in14d}`)).json(),
  });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: cats } = useQuery<AppointmentCategory[]>({ queryKey: ["/api/categories"] });

  const upcoming = (appts || []).filter(a => a.startAt >= now && a.status !== "cancelled").sort((a,b) => a.startAt - b.startAt);
  const todayCount = upcoming.filter(a => new Date(a.startAt).toDateString() === new Date().toDateString()).length;
  const thisWeekCount = upcoming.filter(a => a.startAt < now + 7 * 86400000).length;
  const completed = (appts || []).filter(a => a.status === "completed").length;

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <PageHeader
          kicker={`Bonjour ${user?.name?.split(" ")[0] ?? ""}`.trim()}
          title="Votre cabinet, en un coup d'œil"
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="RDV aujourd'hui" value={todayCount} icon={Calendar} testid="stat-today" />
          <StatCard label="Cette semaine" value={thisWeekCount} icon={Sparkles} testid="stat-week" />
          <StatCard label="Clients" value={(clients || []).length} icon={Users} testid="stat-clients" />
          <StatCard label="Consultations terminées (30j)" value={completed} icon={Tag} testid="stat-completed" />
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
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
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
              <a href={`/#/p/${user.slug}`} target="_blank" rel="noreferrer" className="card-naturo block hover:-translate-y-0.5 transition" data-testid="quick-public">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/30 flex items-center justify-center text-primary"><Globe className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-extrabold">Page publique</h3>
                    <p className="text-xs text-muted-foreground">naturo.pro/p/{user.slug}</p>
                  </div>
                </div>
              </a>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, icon: Icon, testid }: any) {
  return (
    <div className="card-naturo" data-testid={testid}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="text-3xl font-extrabold text-heading">{value}</p>
    </div>
  );
}
