import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bell,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";

// ── Types ──────────────────────────────────────────────────────────────────────

type ReminderStatus = "sent" | "pending" | "disabled" | "past";

interface ReminderLogEntry {
  id: number;
  clientName: string;
  clientEmail: string | null;
  scheduledAt: number;
  status: ReminderStatus;
  reminderSentAt: number | null;
}

interface ReminderStats {
  sentThisMonth: number;
  sentTotal: number;
  pendingCount: number;
  nextSendAt: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(tsMs: number): string {
  return format(new Date(tsMs), "d MMM yyyy, HH:mm", { locale: fr });
}

function fmtDateShort(tsMs: number): string {
  return format(new Date(tsMs), "d MMM yyyy", { locale: fr });
}

const STATUS_CONFIG: Record<
  ReminderStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  sent: {
    label: "Envoyé",
    className: "bg-[#dcfce7] text-[#166534] border-0",
    icon: CheckCircle2,
  },
  pending: {
    label: "En attente",
    className: "bg-orange-100 text-orange-700 border-0",
    icon: Clock,
  },
  disabled: {
    label: "Sans email",
    className: "bg-gray-100 text-gray-500 border-0",
    icon: XCircle,
  },
  past: {
    label: "Passé",
    className: "bg-red-100 text-red-600 border-0",
    icon: AlertCircle,
  },
};

// ── Skeleton loaders ───────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <Card className="card-naturo rounded-[15px]">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconColor?: string;
  "data-testid"?: string;
}

function StatCard({ title, value, icon: Icon, iconColor = "text-[#186749]", ...props }: StatCardProps) {
  return (
    <Card className="card-naturo rounded-[15px]" {...props}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground py-6 font-bold">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReminderStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.className} flex items-center gap-1 w-fit text-xs font-semibold`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Reminders() {
  const {
    data: stats,
    isLoading: statsLoading,
  } = useQuery<ReminderStats>({
    queryKey: ["/api/reminders/stats"],
    queryFn: () => apiRequest("GET", "/api/reminders/stats").then((r) => r.json()),
  });

  const {
    data: log,
    isLoading: logLoading,
  } = useQuery<ReminderLogEntry[]>({
    queryKey: ["/api/reminders/log"],
    queryFn: () => apiRequest("GET", "/api/reminders/log").then((r) => r.json()),
  });

  // Calcule le libellé du prochain envoi
  const nextSendLabel: string = (() => {
    if (!stats?.nextSendAt) return "—";
    const d = new Date(stats.nextSendAt);
    const now = new Date();
    if (d < now) return "Aujourd'hui";
    return fmtDateShort(stats.nextSendAt);
  })();

  const isEmpty = !logLoading && (!log || log.length === 0);

  return (
    <AppLayout>
      {/* ── Header ── */}
      <PageHeader
        title="Rappels"
        subtitle="Le suivi de vos rappels automatiques J-1."
        icon={Bell}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/app/settings" data-testid="button-configure-settings">
              Configurer les rappels
            </Link>
          </Button>
        }
      />

      <HelpNote>
        <p>
          La veille de chaque rendez-vous, Naturo Pro envoie <strong>automatiquement un email de
          rappel à vos clientes</strong> — sans aucune action de votre part. C'est ce qui aide à
          <strong> réduire les oublis et les rendez-vous manqués</strong>.
        </p>
        <p>
          Cette page est un simple <strong>tableau de suivi</strong> : vous y voyez les rappels déjà
          envoyés, ceux à venir et ceux qui n'ont pas pu partir. <strong>Vous n'avez rien à remplir ici.</strong>
        </p>
        <div>
          <p className="font-semibold text-foreground mb-2">Comment lire le tableau ?</p>
          <ul>
            <li>🟢 <strong>Envoyé</strong> — le rappel est bien parti.</li>
            <li>🟠 <strong>En attente</strong> — le rappel partira la veille du rendez-vous.</li>
            <li>⚪ <strong>Sans email</strong> — la cliente n'a pas d'adresse email renseignée.</li>
          </ul>
        </div>
        <p className="text-xs italic">
          💡 Pour activer/désactiver les rappels ou changer l'heure d'envoi, utilisez le bouton
          <strong> « Configurer les rappels »</strong> (page Paramètres).
        </p>
      </HelpNote>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" aria-busy={statsLoading}>
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title="Envoyés ce mois"
              value={stats?.sentThisMonth ?? 0}
              icon={CheckCircle2}
              iconColor="text-[#186749]"
              data-testid="text-stat-sent-month"
            />
            <StatCard
              title="Total envoyés"
              value={stats?.sentTotal ?? 0}
              icon={Bell}
              iconColor="text-[#186749]"
              data-testid="text-stat-sent-total"
            />
            <StatCard
              title="En attente"
              value={stats?.pendingCount ?? 0}
              icon={Clock}
              iconColor="text-orange-500"
              data-testid="text-stat-pending"
            />
            <StatCard
              title="Prochain envoi"
              value={nextSendLabel}
              icon={AlertCircle}
              iconColor="text-[#17EC9B]"
              data-testid="text-stat-next-send"
            />
          </>
        )}
      </div>

      {/* ── Tableau ── */}
      <Card className="card-naturo rounded-[15px]">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base font-bold">
            Derniers rappels (J-7 → J+30)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 px-0" aria-busy={logLoading}>
          {logLoading ? (
            <div className="px-6">
              <TableSkeleton />
            </div>
          ) : isEmpty ? (
            <EmptyState
              icon={Bell}
              title="Aucun rappel programmé"
              description="Les rappels J-1 s'envoient automatiquement lorsque vous avez des rendez-vous à venir avec des clients ayant une adresse email."
              card={false}
              testid="text-empty-reminders"
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/app/settings" data-testid="button-configure-reminders">
                    Configurer les rappels
                  </Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Date RDV</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell pr-6">
                    Envoyé le
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(log ?? []).slice(0, 20).map((entry) => (
                  <TableRow key={entry.id} data-testid={`row-reminder-${entry.id}`}>
                    <TableCell className="pl-6 font-medium text-sm">
                      <span data-testid={`text-scheduled-${entry.id}`}>
                        {fmtDate(entry.scheduledAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span data-testid={`text-client-${entry.id}`}>
                        {entry.clientName}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      <span data-testid={`text-email-${entry.id}`}>
                        {entry.clientEmail ?? (
                          <span className="italic text-gray-400">—</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={entry.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground pr-6">
                      <span data-testid={`text-sent-at-${entry.id}`}>
                        {entry.reminderSentAt
                          ? fmtDate(entry.reminderSentAt)
                          : <span className="text-gray-400">—</span>}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Lien configurateur en bas ── */}
      <p className="text-xs text-muted-foreground mt-4 text-center">
        Pour activer ou désactiver les rappels, rendez-vous dans{" "}
        <Link
          href="/app/settings"
          className="underline text-[#186749] hover:text-heading"
          data-testid="link-settings-reminders"
        >
          Paramètres → Resend
        </Link>
        .
      </p>
    </AppLayout>
  );
}
