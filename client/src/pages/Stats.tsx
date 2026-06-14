import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TrendingUp, Calendar, Download, BarChart2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";

// ── Types ────────────────────────────────────────────────────────────────────

interface StatsOverview {
  caEncaisseCents: number;
  caPrevuCents: number;
  nbRdv: number;
  nbRdvAnnules: number;
  topPrestations: { name: string; count: number; caCents: number }[];
}

// ── Helpers période ──────────────────────────────────────────────────────────

function startOfMonthMs(offset = 0): number {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.getTime();
}

function endOfMonthMs(offset = 0): number {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + offset + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 1;
}

function startOfYearMs(): number {
  const d = new Date();
  d.setUTCMonth(0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfYearMs(): number {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1, 0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 1;
}

type Periode = "mois_courant" | "mois_dernier" | "annee";

function getPeriodeLabel(p: Periode): string {
  if (p === "mois_courant") {
    return new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
  if (p === "mois_dernier") {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
  return String(new Date().getFullYear());
}

function getPeriodeRange(p: Periode): { from: number; to: number } {
  if (p === "mois_courant") return { from: startOfMonthMs(0), to: endOfMonthMs(0) };
  if (p === "mois_dernier") return { from: startOfMonthMs(-1), to: endOfMonthMs(-1) };
  return { from: startOfYearMs(), to: endOfYearMs() };
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function Stats() {
  const [periode, setPeriode] = useState<Periode>("mois_courant");
  const [downloading, setDownloading] = useState(false);

  const { from, to } = useMemo(() => getPeriodeRange(periode), [periode]);

  const { data, isLoading } = useQuery<StatsOverview>({
    queryKey: ["/api/stats/overview", from, to],
    queryFn: async () =>
      (await apiRequest("GET", `/api/stats/overview?from=${from}&to=${to}`)).json(),
  });

  // ── Export CSV ────────────────────────────────────────────────────────────

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
    } finally {
      setDownloading(false);
    }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const top = data?.topPrestations ?? [];
  const maxCount = top.length > 0 ? Math.max(...top.map((t) => t.count)) : 1;

  return (
    <AppLayout>
      <div className="max-w-6xl">
        {/* Entête */}
        <PageHeader
          title="Statistiques"
          subtitle="L'activité de votre cabinet en un coup d'œil."
          icon={BarChart2}
          actions={
            <Button
              onClick={handleExportCsv}
              disabled={downloading}
              variant="outline"
              className="rounded-lg font-bold"
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4 mr-1" />
              {downloading ? "Téléchargement…" : "Exporter le journal des recettes (CSV)"}
            </Button>
          }
        />

        {/* Aide */}
        <HelpNote>
          <p>
            Cette page vous donne une <strong>vue d'ensemble de votre activité</strong> sur la période
            choisie : chiffre d'affaires encaissé, rendez-vous réalisés, prestations les plus demandées.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Ce que vous pouvez faire ici :</p>
            <ul>
              <li>
                📊 <strong>Consulter vos KPIs</strong> (CA encaissé, CA prévu, nombre de RDV) sur le
                mois courant, le mois dernier ou l'année entière.
              </li>
              <li>
                🏆 <strong>Identifier vos prestations phares</strong> grâce au classement automatique.
              </li>
              <li>
                ⬇️ <strong>Exporter le journal des recettes en CSV</strong> (bouton en haut à droite)
                pour l'envoyer à votre comptable ou préparer votre déclaration de revenus.
              </li>
            </ul>
          </div>
          <p className="text-xs italic">
            Le CA encaissé correspond aux factures dont le statut est « Payée ». Le CA prévu correspond
            aux factures en brouillon ou envoyées, non encore réglées.
          </p>
        </HelpNote>

        {/* Sélecteur de période */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="text-sm font-semibold text-muted-foreground">Période :</span>
          <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
            <SelectTrigger className="w-52" data-testid="select-periode">
              <SelectValue placeholder="Choisir une période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mois_courant">Ce mois-ci</SelectItem>
              <SelectItem value="mois_dernier">Mois dernier</SelectItem>
              <SelectItem value="annee">Année en cours</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground capitalize">{getPeriodeLabel(periode)}</span>
        </div>

        {/* KPIs */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card-naturo animate-pulse h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="card-naturo" data-testid="kpi-ca-encaisse">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">CA encaissé</p>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-extrabold text-heading">
                {formatPrice(data?.caEncaisseCents ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">factures payées</p>
            </div>

            <div className="card-naturo" data-testid="kpi-ca-prevu">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">CA prévu</p>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-extrabold text-amber-700">
                {formatPrice(data?.caPrevuCents ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">brouillons + envoyées</p>
            </div>

            <div className="card-naturo" data-testid="kpi-nb-rdv">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">RDV réalisés</p>
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-extrabold text-heading">
                {data?.nbRdv ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">hors annulés</p>
            </div>

            <div className="card-naturo" data-testid="kpi-nb-annules">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Annulés</p>
                <Calendar className="h-4 w-4 text-red-400" />
              </div>
              <p className="text-2xl font-extrabold text-red-600">
                {data?.nbRdvAnnules ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">RDV annulés</p>
            </div>
          </div>
        )}

        {/* Top prestations */}
        <div className="card-naturo" data-testid="section-top-prestations">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-extrabold">Top prestations</h2>
          </div>

          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-10 bg-secondary/40 rounded-lg" />
              ))}
            </div>
          ) : top.length === 0 ? (
            <EmptyState
              icon={BarChart2}
              title="Aucune donnée"
              description="Aucun rendez-vous enregistré sur cette période."
              card={false}
            />
          ) : (
            <div className="space-y-3">
              {top.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3" data-testid={`row-prestation-${idx}`}>
                  <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                        {item.count} RDV{item.caCents > 0 ? ` · ${formatPrice(item.caCents)}` : ""}
                      </span>
                    </div>
                    {/* Barre proportionnelle en CSS pur */}
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round((item.count / maxCount) * 100)}%`,
                          backgroundColor: "#186749",
                          opacity: 0.7 + (0.3 * (top.length - idx)) / top.length,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
