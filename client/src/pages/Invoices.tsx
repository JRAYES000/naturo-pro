import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, Receipt, Download, Mail, FileText } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import type { Invoice } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  cancelled: "Annulée",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

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
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-extrabold" style={{ color: "#1b4332" }}>Factures</h1>
            <p className="text-muted-foreground text-sm mt-1">Suivi de votre facturation et chiffre d'affaires.</p>
          </div>
          <Link href="/app/invoices/new">
            <Button className="rounded-[15px] font-bold" data-testid="button-new-invoice">
              <Plus className="h-4 w-4 mr-1" /> Nouvelle facture
            </Button>
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card-naturo">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">CA encaissé</p>
            <p className="text-2xl font-extrabold" style={{ color: "#1b4332" }} data-testid="text-kpi-paid">
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
            <p className="text-2xl font-extrabold" style={{ color: "#1b4332" }} data-testid="text-kpi-total">
              {kpis.totalCount}
            </p>
          </div>
          <div className="card-naturo">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Année en cours</p>
            <p className="text-2xl font-extrabold" style={{ color: "#1b4332" }}>
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
          <div className="card-naturo text-center py-16">
            <p className="text-muted-foreground">Chargement…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-naturo text-center py-16">
            <Receipt className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-bold mb-1">Aucune facture</p>
            <p className="text-sm text-muted-foreground mb-4">
              {invoices.length === 0
                ? "Créez votre première facture ou activez la facturation automatique sur RDV terminés."
                : "Aucune facture ne correspond à ces filtres."}
            </p>
            {invoices.length === 0 && (
              <Link href="/app/invoices/new">
                <Button className="rounded-[15px] font-bold">
                  <Plus className="h-4 w-4 mr-1" /> Nouvelle facture
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="card-naturo overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-left">
                  <th className="px-4 py-3 font-bold text-xs uppercase tracking-wide">Numéro</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase tracking-wide">Client</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase tracking-wide text-right">Total</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase tracking-wide">Statut</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase tracking-wide w-1"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="border-t hover:bg-secondary/20" data-testid={`row-invoice-${inv.id}`}>
                    <td className="px-4 py-3 font-bold">
                      <Link href={`/app/invoices/${inv.id}`} className="hover:underline" style={{ color: "#1b4332" }}>
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateShort(inv.issueDate)}</td>
                    <td className="px-4 py-3">
                      {`${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim() || <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{formatPrice(inv.totalCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-md ${STATUS_STYLES[inv.status] || ""}`}>
                        {STATUS_LABELS[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <a
                          href={`/api/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                          title="Télécharger le PDF"
                          data-testid={`button-pdf-${inv.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <Link
                          href={`/app/invoices/${inv.id}`}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                          title="Ouvrir"
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
