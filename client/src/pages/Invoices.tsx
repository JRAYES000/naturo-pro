import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, Receipt, Download, FileText, CheckCircle2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPrice } from "@/lib/format";
import type { Invoice } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

function formatDateShort(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function canMarkPaid(status: string) {
  return status !== "paid" && status !== "cancelled";
}

function MobileInvoiceCard({
  inv,
  onMarkPaid,
  markPaidPending,
}: {
  inv: Invoice;
  onMarkPaid: () => void;
  markPaidPending: boolean;
}) {
  const clientName = `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim();
  return (
    <div className="card-naturo" data-testid={`card-invoice-${inv.id}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/invoices/${inv.id}`} className="font-bold text-heading hover:underline">
          {inv.number}
        </Link>
        <StatusBadge domain="invoice" status={inv.status} />
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {clientName || "—"} · {formatDateShort(inv.issueDate)}
      </div>
      <div className="mt-2 font-extrabold text-lg text-heading">
        {formatPrice(inv.totalCents)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={`/api/invoices/${inv.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 h-11 min-h-[44px] px-3 rounded-lg text-sm font-bold border border-input hover:bg-secondary"
          data-testid={`button-pdf-${inv.id}`}
        >
          <Download className="h-4 w-4" /> PDF
        </a>
        <Link
          href={`/app/invoices/${inv.id}`}
          className="inline-flex items-center gap-1 h-11 min-h-[44px] px-3 rounded-lg text-sm font-bold border border-input hover:bg-secondary"
          data-testid={`button-open-${inv.id}`}
        >
          <FileText className="h-4 w-4" /> Ouvrir
        </Link>
        {canMarkPaid(inv.status) && (
          <button
            type="button"
            onClick={onMarkPaid}
            disabled={markPaidPending}
            className="inline-flex items-center gap-1 h-11 min-h-[44px] px-3 rounded-lg text-sm font-bold border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-60"
            data-testid={`button-mark-paid-${inv.id}`}
          >
            <CheckCircle2 className="h-4 w-4" /> Marquer payée
          </button>
        )}
      </div>
    </div>
  );
}

function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const confirm = useConfirm();

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const markPaidMut = useMutation({
    mutationFn: async (id: number) =>
      apiRequest("PATCH", `/api/invoices/${id}`, { status: "paid", paidAt: Date.now() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Facture marqu\u00e9e comme pay\u00e9e", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  async function handleMarkPaid(inv: Invoice) {
    const ok = await confirm({
      title: `Marquer la facture N\u00b0 ${inv.number} comme pay\u00e9e ?`,
      description: "La date de paiement sera fix\u00e9e \u00e0 aujourd'hui.",
      confirmLabel: "Oui, marquer pay\u00e9e",
      cancelLabel: "Annuler",
    });
    if (!ok) return;
    markPaidMut.mutate(inv.id);
  }

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.toLowerCase();
        if (!name.includes(q) && !inv.number.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search]);

  // KPIs
  const kpis = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const pending = invoices.filter((i) => i.status === "sent" || i.status === "draft");
    return {
      caEncaisseCents: paid.reduce((s, i) => s + (i.totalCents || 0), 0),
      enAttenteCents: pending.reduce((s, i) => s + (i.totalCents || 0), 0),
      totalCount: invoices.length,
      paidCount: paid.length,
    };
  }, [invoices]);

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <PageHeader
          title="Factures"
          subtitle="Émettez et suivez vos factures."
          icon={Receipt}
          actions={
            <Link href="/app/invoices/new">
              <Button className="rounded-lg font-bold" data-testid="button-new-invoice">
                <Plus className="h-4 w-4 mr-1" /> Nouvelle facture
              </Button>
            </Link>
          }
        />

        <HelpNote>
          <p>
            Cette page rassemble <strong>toutes vos factures au même endroit</strong>. En un coup
            d'œil, vous voyez ce que vous avez déjà encaissé et ce qu'il reste à encaisser.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Ce que vous pouvez faire ici :</p>
            <ul>
              <li>📄 <strong>Créer une facture</strong> pour une cliente (bouton « Nouvelle facture »).</li>
              <li>⬇️ La <strong>télécharger en PDF</strong> ou l'<strong>envoyer par email</strong> à votre cliente.</li>
              <li>✅ La <strong>marquer comme payée</strong> une fois le règlement reçu.</li>
              <li>🔎 <strong>Retrouver une facture</strong> grâce aux filtres (statut) et à la recherche par nom.</li>
            </ul>
          </div>
          <p className="text-xs italic">
            💡 Les couleurs indiquent l'état de chaque facture : <strong>Brouillon</strong> (pas encore
            envoyée), <strong>Envoyée</strong> (en attente de paiement) et <strong>Payée</strong>. Pensez à
            renseigner vos coordonnées dans <strong>Paramètres</strong> : elles apparaîtront sur vos factures.
          </p>
        </HelpNote>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card-naturo">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">CA encaissé</p>
            <p className="text-2xl font-extrabold text-heading" data-testid="text-kpi-paid">
              {formatPrice(kpis.caEncaisseCents)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{kpis.paidCount} facture{kpis.paidCount > 1 ? "s" : ""} payée{kpis.paidCount > 1 ? "s" : ""}</p>
          </div>
          <div className="card-naturo">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">En attente</p>
            <p className="text-2xl font-extrabold text-amber-700" data-testid="text-kpi-pending">
              {formatPrice(kpis.enAttenteCents)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">brouillons + envoyées</p>
          </div>
          <div className="card-naturo">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total factures</p>
            <p className="text-2xl font-extrabold text-heading" data-testid="text-kpi-total">
              {kpis.totalCount}
            </p>
          </div>
          <div className="card-naturo">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Année en cours</p>
            <p className="text-2xl font-extrabold text-heading">
              {new Date().getFullYear()}
            </p>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Input
            placeholder="Rechercher (numéro ou client)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            data-testid="input-search-invoices"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="select-status-filter">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillon</SelectItem>
              <SelectItem value="sent">Envoyée</SelectItem>
              <SelectItem value="paid">Payée</SelectItem>
              <SelectItem value="cancelled">Annulée</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Liste */}
        {isLoading ? (
          <Loading variant="list" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Aucune facture"
            description={
              invoices.length === 0
                ? "Créez votre première facture ou activez la facturation automatique sur RDV terminés."
                : "Aucune facture ne correspond à ces filtres."
            }
            action={
              invoices.length === 0 ? (
                <Link href="/app/invoices/new">
                  <Button className="rounded-lg font-bold">
                    <Plus className="h-4 w-4 mr-1" /> Nouvelle facture
                  </Button>
                </Link>
              ) : undefined
            }
            testid="empty-invoices"
          />
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((inv) => (
                <MobileInvoiceCard
                  key={inv.id}
                  inv={inv}
                  onMarkPaid={() => handleMarkPaid(inv)}
                  markPaidPending={markPaidMut.isPending}
                />
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block card-naturo overflow-x-auto p-0">
              <table className="table-naturo">
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th className="text-right">Total</th>
                    <th>Statut</th>
                    <th className="w-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                      <td className="font-bold">
                        <Link href={`/app/invoices/${inv.id}`} className="hover:underline text-heading">
                          {inv.number}
                        </Link>
                      </td>
                      <td className="text-muted-foreground">{formatDateShort(inv.issueDate)}</td>
                      <td>
                        {`${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim() || <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="text-right font-bold">{formatPrice(inv.totalCents)}</td>
                      <td>
                        <StatusBadge domain="invoice" status={inv.status} />
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            title="Télécharger le PDF"
                            aria-label="Télécharger le PDF"
                            data-testid={`button-pdf-${inv.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          {canMarkPaid(inv.status) && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(inv)}
                              disabled={markPaidMut.isPending}
                              className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-secondary text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                              title="Marquer comme payée"
                              aria-label="Marquer comme payée"
                              data-testid={`button-mark-paid-${inv.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          <Link
                            href={`/app/invoices/${inv.id}`}
                            className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            title="Ouvrir"
                            aria-label="Ouvrir la facture"
                            data-testid={`button-open-${inv.id}`}
                          >
                            <FileText className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function InvoicesPageGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="La facturation" description="Création de factures, PDF, envoi par email et suivi des paiements sont réservés à l'abonnement Naturo Pro." />;
  }
  return <InvoicesPage />;
}
