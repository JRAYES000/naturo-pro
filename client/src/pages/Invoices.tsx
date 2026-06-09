import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, Receipt, Download, FileText } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import type { Invoice } from "@shared/schema";

function formatDateShort(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

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
              <Button className="rounded-[15px] font-bold" data-testid="button-new-invoice">
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
                  <Button className="rounded-[15px] font-bold">
                    <Plus className="h-4 w-4 mr-1" /> Nouvelle facture
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="card-naturo overflow-x-auto p-0">
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
        )}
      </div>
    </AppLayout>
  );
}
