/**
 * Factures fournisseurs reçues par la plateforme agréée (Super PDP).
 * La réception électronique est obligatoire depuis le 1er septembre 2026.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Inbox, Download } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

interface Received {
  id: number;
  receivedAt: string;
  number: string | null;
  issueDate: string | null;
  sellerName: string | null;
  total: string | null;
  currency: string;
  status: string | null;
}

function money(v: string | null, currency: string) {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR" }) : v;
}

function day(v: string | null) {
  return v ? new Date(v).toLocaleDateString("fr-FR") : "—";
}

function ReceivedInvoicesPage() {
  const { data, isLoading, error } = useQuery<{ connected: boolean; invoices: Received[] }>({
    queryKey: ["/api/einvoicing/received"],
  });

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <PageHeader
          title="Factures reçues"
          subtitle="Vos factures fournisseurs arrivées par la plateforme agréée."
          icon={Inbox}
          backTo={{ href: "/app/invoices", label: "Factures" }}
        />
        {isLoading ? (
          <Loading variant="list" />
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : !data?.connected ? (
          <EmptyState
            icon={Inbox}
            title="Aucune plateforme connectée"
            description="Connectez votre compte Super PDP dans les réglages pour recevoir vos factures fournisseurs ici."
            action={<Link href="/app/settings"><Button className="rounded-md font-bold">Ouvrir les réglages</Button></Link>}
            testid="empty-received-not-connected"
          />
        ) : data.invoices.length === 0 ? (
          <EmptyState icon={Inbox} title="Aucune facture reçue" description="Les factures de vos fournisseurs apparaîtront ici." testid="empty-received" />
        ) : (
          <div className="card-naturo overflow-x-auto p-0">
            <table className="table-naturo">
              <thead>
                <tr>
                  <th>Reçue le</th>
                  <th>Fournisseur</th>
                  <th>Numéro</th>
                  <th>Date</th>
                  <th className="text-right">Montant</th>
                  <th className="w-1"></th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id} data-testid={`row-received-${i.id}`}>
                    <td className="text-muted-foreground">{day(i.receivedAt)}</td>
                    <td className="font-semibold">{i.sellerName || "—"}</td>
                    <td>{i.number || "—"}</td>
                    <td className="text-muted-foreground">{day(i.issueDate)}</td>
                    <td className="text-right font-bold">{money(i.total, i.currency)}</td>
                    <td>
                      <a
                        href={`/api/einvoicing/received/${i.id}/file`}
                        className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground"
                        title="Télécharger la facture"
                        aria-label="Télécharger la facture"
                        data-testid={`button-received-download-${i.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function ReceivedInvoicesGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="La facture électronique" description="La réception et la transmission des factures électroniques sont réservées à l'abonnement Naturo Pro." />;
  }
  return <ReceivedInvoicesPage />;
}
