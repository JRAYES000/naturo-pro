/**
 * client/src/pages/admin/AdminAnalytics.tsx — tableau de bord de conversion (Lot 1, action 9)
 *
 * Les 5 événements posés avant l'ouverture du 1er septembre : inscription,
 * tentative d'accès à une fonctionnalité payante, clic sur l'abonnement,
 * souscription, résiliation. Totaux + 30 jours + derniers événements reçus.
 */

import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";

type EventCount = { event: string; count: number };
type AnalyticsPayload = {
  total: EventCount[];
  last30d: EventCount[];
  recent: { id: number; userId: number; event: string; metadata: string | null; createdAt: number }[];
};

const EVENT_LABELS: Record<string, string> = {
  signup: "Inscriptions",
  paid_feature_blocked: "Tentatives d'accès payant (402)",
  subscribe_click: "Clics sur l'abonnement",
  subscription_started: "Souscriptions",
  subscription_canceled: "Résiliations",
};
const EVENT_ORDER = ["signup", "paid_feature_blocked", "subscribe_click", "subscription_started", "subscription_canceled"];

export default function AdminAnalytics() {
  const { data, isLoading } = useQuery<AnalyticsPayload>({ queryKey: ["/api/admin/analytics"] });

  const countFor = (list: EventCount[] | undefined, ev: string) =>
    list?.find((e) => e.event === ev)?.count ?? 0;

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <PageHeader
          icon={TrendingUp}
          title="Analytics de conversion"
          subtitle="Les 5 événements du tunnel : inscription → blocage payant → clic → souscription → résiliation."
        />
        {isLoading ? (
          <Loading variant="cards" count={5} label="Chargement des événements…" />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              {EVENT_ORDER.map((ev) => (
                <div key={ev} className="card-naturo text-center" data-testid={`analytics-card-${ev}`}>
                  <p className="text-2xl font-extrabold text-primary">{countFor(data?.total, ev)}</p>
                  <p className="text-xs font-semibold text-muted-foreground mt-1">{EVENT_LABELS[ev]}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{countFor(data?.last30d, ev)} sur 30 j</p>
                </div>
              ))}
            </div>
            <div className="card-naturo">
              <h2 className="font-bold text-heading mb-3">Derniers événements</h2>
              {!data?.recent?.length ? (
                <p className="text-sm text-muted-foreground">Aucun événement enregistré pour le moment.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.recent.map((e) => (
                    <li key={e.id} className="py-2 flex items-center justify-between gap-3" data-testid={`analytics-event-${e.id}`}>
                      <span className="font-semibold">{EVENT_LABELS[e.event] || e.event}</span>
                      <span className="text-muted-foreground truncate flex-1">user #{e.userId}{e.metadata ? ` · ${e.metadata}` : ""}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(e.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
