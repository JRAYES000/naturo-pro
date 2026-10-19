import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Search, Mail, Phone, ArrowRight, Users, Upload, Loader2, Send, Archive, X, Download,
  FileSpreadsheet, MoreHorizontal, LayoutGrid, List, CalendarClock, Building2,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompanyLookup } from "@/components/CompanyLookup";
import { BroadcastDialog } from "@/components/BroadcastDialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  clientStatus, clientsToCsv, countByFilter, filterAndSort, IMPORT_TEMPLATE_CSV, normalize, relativeDay,
  type ApptInfo, type ClientFilter, type ClientSort, type ClientStatus,
} from "@/lib/clients-list";
import type { Client } from "@shared/schema";

type ApptRow = { clientId: number } & ApptInfo;

const FILTERS: Array<{ value: ClientFilter; label: string; hint: string }> = [
  { value: "all", label: "Toutes", hint: "Toutes les fiches actives (hors archivées)" },
  { value: "upcoming", label: "RDV à venir", hint: "Un rendez-vous est déjà planifié" },
  { value: "active", label: "Vues récemment", hint: "Dernier RDV il y a moins de 90 jours, rien de planifié" },
  { value: "dormant", label: "À relancer", hint: "Pas de RDV depuis plus de 90 jours, rien de planifié" },
  { value: "never", label: "Jamais vues", hint: "Aucun rendez-vous enregistré" },
];

const STATUS_STYLE: Record<ClientStatus, { label: string; dot: string }> = {
  upcoming: { label: "RDV à venir", dot: "bg-accent" },
  active: { label: "Vue récemment", dot: "bg-primary" },
  dormant: { label: "À relancer", dot: "bg-amber-500" },
  never: { label: "Jamais vue", dot: "bg-muted-foreground/40" },
};

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const initials = (c: Client) => `${c.firstName?.[0] || ""}${c.lastName?.[0] || ""}`.toUpperCase() || "?";

export default function Clients() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [sortBy, setSortBy] = useState<ClientSort>("name");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [broadcasting, setBroadcasting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Liste chargée une fois : recherche et filtres se font sur place, sans aller-retour serveur à chaque frappe.
  const { data: list, isLoading } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: apptRows = [] } = useQuery<ApptRow[]>({ queryKey: ["/api/clients-last-appointment"] });
  const appts = useMemo(() => new Map(apptRows.map((r) => [r.clientId, r])), [apptRows]);

  const all = useMemo(() => (list || []) as any[], [list]);
  const counts = useMemo(() => countByFilter(all, appts), [all, appts]);
  const shown = useMemo(
    () => filterAndSort(all, appts, { query: search, filter, sort: sortBy }) as unknown as Client[],
    [all, appts, search, filter, sortBy],
  );

  // « / » place le curseur dans la recherche, comme sur la plupart des outils de liste.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lot 3 — import CSV de coordonnées (prénom, nom, email, téléphone).
  const importMut = useMutation({
    mutationFn: async (csv: string) => (await apiRequest("POST", "/api/clients/import", { csv })).json(),
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      const details = [
        `${r.crees} fiche(s) créée(s)`,
        r.doublons ? `${r.doublons} doublon(s) ignoré(s)` : null,
        r.totalErreurs ? `${r.totalErreurs} ligne(s) en erreur` : null,
        r.totalAvertissements ? `${r.totalAvertissements} email(s) invalide(s) ignoré(s)` : null,
      ].filter(Boolean).join(" · ");
      toast({ title: "Import terminé", description: details, variant: "success" });
    },
    onError: (e: any) => toast({ title: "Import impossible", description: e?.message || "Vérifiez le fichier CSV.", variant: "destructive" }),
  });

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    importMut.mutate(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  }

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`clients-${stamp}.csv`, clientsToCsv(shown as any, appts));
    toast({ title: "Export prêt", description: `${shown.length} fiche(s) exportée(s) : coordonnées et rendez-vous, sans donnée de santé.` });
  }

  const archivedView = filter === "archived";
  const total = counts.all + counts.archived;

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <PageHeader
          icon={Users}
          title="Clients"
          subtitle="Vos fiches clients : coordonnées, antécédents et historique de consultations."
          actions={
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onImportFile(e.target.files?.[0])}
                data-testid="input-import-csv"
              />
              {user?.hasFullAccess && (
                <Button variant="outline" onClick={() => setBroadcasting(true)} className="rounded-md font-bold hidden sm:inline-flex" data-testid="button-broadcast">
                  <Send className="h-4 w-4 mr-1" /> Écrire à toutes
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-md" aria-label="Importer, exporter" data-testid="button-clients-more">
                    {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Importer</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => fileRef.current?.click()} disabled={importMut.isPending} data-testid="button-import-clients">
                    <Upload className="h-4 w-4 mr-2" /> Importer un fichier CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => downloadText("modele-import-clients.csv", IMPORT_TEMPLATE_CSV)} data-testid="button-import-template">
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Télécharger le modèle
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Exporter</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={exportCsv} disabled={!shown.length} data-testid="button-export-clients">
                    <Download className="h-4 w-4 mr-2" /> Exporter la liste affichée ({shown.length})
                  </DropdownMenuItem>
                  {user?.hasFullAccess && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setBroadcasting(true)} className="sm:hidden">
                        <Send className="h-4 w-4 mr-2" /> Écrire à toutes
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => setCreating(true)} className="rounded-md font-bold" data-testid="button-new-client">
                <Plus className="h-4 w-4 mr-1" /> Nouveau client
              </Button>
            </div>
          }
        />

        {total > 0 && (
          <div className="card-naturo mb-6 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  type="search"
                  placeholder="Nom, email, téléphone, ville…  ( / )"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearch("");
                    if (e.key === "Enter" && shown.length === 1) navigate(`/app/clients/${shown[0].id}`);
                  }}
                  className="pl-10 pr-9 rounded-md"
                  aria-label="Rechercher un client"
                  data-testid="input-search-clients"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-muted-foreground hover:text-foreground"
                    aria-label="Effacer la recherche"
                    data-testid="button-clear-search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as ClientSort)}>
                <SelectTrigger className="w-full sm:w-56" aria-label="Trier" data-testid="select-sort-clients">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Tri : nom (A → Z)</SelectItem>
                  <SelectItem value="nextAppt">Tri : prochain RDV</SelectItem>
                  <SelectItem value="lastAppt">Tri : dernier RDV</SelectItem>
                  <SelectItem value="recent">Tri : fiche la plus récente</SelectItem>
                </SelectContent>
              </Select>
              <div className="hidden sm:flex rounded-md border border-border p-0.5" role="group" aria-label="Affichage">
                {([["cards", LayoutGrid, "Cartes"], ["list", List, "Liste"]] as const).map(([v, Icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    title={label}
                    className={`px-2.5 rounded-sm transition-colors ${view === v ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid={`button-view-${v}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="sr-only">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrer les clients">
              {FILTERS.map((f) => (
                <FilterChip key={f.value} active={filter === f.value} count={counts[f.value]} title={f.hint} onClick={() => setFilter(f.value)} testid={`filter-${f.value}`}>
                  {f.value !== "all" && <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[f.value as ClientStatus].dot}`} />}
                  {f.label}
                </FilterChip>
              ))}
              {counts.archived > 0 && (
                <FilterChip active={archivedView} count={counts.archived} title="Fiches archivées : hors liste et hors messages groupés, historique intact" onClick={() => setFilter(archivedView ? "all" : "archived")} testid="filter-archived">
                  <Archive className="h-3.5 w-3.5" /> Archivées
                </FilterChip>
              )}
              <span className="ml-auto text-xs text-muted-foreground" aria-live="polite" data-testid="text-clients-count">
                {shown.length} fiche{shown.length > 1 ? "s" : ""}{search ? ` pour « ${search} »` : ""}
              </span>
            </div>
          </div>
        )}

        {isLoading ? (
          <Loading variant="cards" count={6} label="Chargement des clients…" />
        ) : total === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun client pour le moment"
            description="Créez votre première fiche, ou importez votre carnet depuis Excel ou Google Sheets (colonnes Prénom, Nom, Email, Téléphone)."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCreating(true)} className="rounded-md" data-testid="button-empty-create">
                  <Plus className="h-4 w-4 mr-1" /> Nouveau client
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()} className="rounded-md" data-testid="button-empty-import">
                  <Upload className="h-4 w-4 mr-1" /> Importer un CSV
                </Button>
                <Button variant="ghost" onClick={() => downloadText("modele-import-clients.csv", IMPORT_TEMPLATE_CSV)} className="rounded-md">
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> Modèle CSV
                </Button>
              </div>
            }
            testid="empty-clients"
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={archivedView ? Archive : Search}
            title={search ? "Aucun client trouvé" : "Aucune fiche dans ce filtre"}
            description={search ? "Vérifiez l'orthographe ou cherchez par email, téléphone ou ville." : "Changez de filtre pour voir les autres fiches."}
            action={
              <Button variant="outline" onClick={() => { setSearch(""); setFilter("all"); }} className="rounded-md" data-testid="button-reset-filters">
                Tout afficher
              </Button>
            }
            testid="empty-clients"
          />
        ) : view === "list" ? (
          <div className="card-naturo p-0 overflow-x-auto">
            <table className="table-naturo">
              <thead>
                <tr><th>Client</th><th>Contact</th><th>Dernier RDV</th><th>Prochain RDV</th><th className="w-10"><span className="sr-only">Ouvrir</span></th></tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const a = appts.get(c.id);
                  return (
                    <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/app/clients/${c.id}`)} data-testid={`row-client-${c.id}`}>
                      <td>
                        <Link href={`/app/clients/${c.id}`} className="flex items-center gap-3 font-bold hover:text-primary" onClick={(e) => e.stopPropagation()}>
                          <span className="h-8 w-8 shrink-0 rounded-full bg-secondary text-primary flex items-center justify-center text-xs font-bold">{initials(c)}</span>
                          <span className="truncate">{c.lastName} {c.firstName}</span>
                        </Link>
                      </td>
                      <td className="text-muted-foreground">
                        <ContactLinks client={c} compact />
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap">{a?.lastApptAt ? <DateCell ms={a.lastApptAt} /> : "—"}</td>
                      <td className="whitespace-nowrap">{a?.nextApptAt ? <DateCell ms={a.nextApptAt} strong /> : <span className="text-muted-foreground">—</span>}</td>
                      <td><ArrowRight className="h-4 w-4 text-muted-foreground" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((c) => {
              const a = appts.get(c.id);
              const status = clientStatus(a);
              const archivedAt = (c as any).archivedAt as number | null;
              return (
                <li key={c.id} className="card-naturo relative flex flex-col gap-3 hover:border-primary transition-colors" data-testid={`card-client-${c.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 shrink-0 rounded-full bg-secondary text-primary flex items-center justify-center font-bold">
                      {initials(c)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Le lien couvre toute la carte (after:inset-0) sans englober les boutons d'action. */}
                      <Link href={`/app/clients/${c.id}`} className="font-bold truncate block hover:text-primary after:absolute after:inset-0 after:content-['']">
                        {c.firstName} {c.lastName}
                      </Link>
                      {c.companyName && (
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Building2 className="h-3 w-3" /> {c.companyName}</p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        {archivedAt ? (
                          <><Archive className="h-3 w-3" /> Archivée le {new Date(archivedAt).toLocaleDateString("fr-FR")}</>
                        ) : (
                          <><span className={`h-2 w-2 rounded-full ${STATUS_STYLE[status].dot}`} /> {STATUS_STYLE[status].label}</>
                        )}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>

                  <div className="text-sm space-y-1" data-testid={`text-last-appt-${c.id}`}>
                    {a?.nextApptAt && (
                      <p className="flex items-center gap-2 text-primary font-semibold">
                        <CalendarClock className="h-3.5 w-3.5" /> Prochain RDV {relativeDay(a.nextApptAt)} · {new Date(a.nextApptAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {a?.lastApptAt ? `Dernier RDV ${relativeDay(a.lastApptAt)} (${new Date(a.lastApptAt).toLocaleDateString("fr-FR")})` : "Aucun RDV passé"}
                    </p>
                  </div>

                  <div className="relative z-10 mt-auto">
                    <ContactLinks client={c} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NewClientDialog
        open={creating}
        onClose={() => setCreating(false)}
        existing={list || []}
        onCreated={(id) => navigate(`/app/clients/${id}`)}
      />
      <BroadcastDialog open={broadcasting} onClose={() => setBroadcasting(false)} />
    </AppLayout>
  );
}

function FilterChip({ active, count, title, onClick, testid, children }: {
  active: boolean; count: number; title: string; onClick: () => void; testid: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-sm transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary hover:text-primary"
      }`}
      data-testid={testid}
    >
      {children}
      <span className={`text-xs tabular-nums ${active ? "opacity-90" : "text-muted-foreground"}`}>{count}</span>
    </button>
  );
}

function ContactLinks({ client: c, compact }: { client: Client; compact?: boolean }) {
  const { toast } = useToast();
  if (!c.email && !c.phone) return <span className="text-sm text-muted-foreground">{compact ? "—" : "Pas de coordonnées"}</span>;
  const copy = (e: React.MouseEvent, v: string) => {
    if (!e.altKey) return;
    e.preventDefault();
    navigator.clipboard?.writeText(v).then(() => toast({ title: "Copié", description: v }));
  };
  const cls = "flex items-center gap-2 min-w-0 text-sm text-muted-foreground hover:text-primary";
  return (
    <div className={compact ? "space-y-0.5" : "flex flex-col gap-1"} onClick={(e) => e.stopPropagation()}>
      {c.email && (
        <a href={`mailto:${c.email}`} onClick={(e) => copy(e, c.email!)} className={cls} title="Écrire (Alt+clic : copier)" data-testid={`link-email-${c.id}`}>
          <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.email}</span>
        </a>
      )}
      {c.phone && (
        <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} onClick={(e) => copy(e, c.phone!)} className={cls} title="Appeler (Alt+clic : copier)" data-testid={`link-phone-${c.id}`}>
          <Phone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.phone}</span>
        </a>
      )}
    </div>
  );
}

function DateCell({ ms, strong }: { ms: number; strong?: boolean }) {
  return (
    <span title={new Date(ms).toLocaleString("fr-FR")}>
      <span className={strong ? "text-primary font-semibold" : undefined}>{new Date(ms).toLocaleDateString("fr-FR")}</span>
      <span className="block text-xs text-muted-foreground">{relativeDay(ms)}</span>
    </span>
  );
}

function NewClientDialog({ open, onClose, existing, onCreated }: { open: boolean; onClose: () => void; existing: Client[]; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const confirm = useConfirm();
  // Lot 1 (décision 5) — la fiche client gratuite se limite aux coordonnées :
  // le champ « Date de naissance » (donnée étendue, ignorée par le serveur en
  // gratuit) est masqué au lieu d'être silencieusement perdu à l'enregistrement.
  const fullAccess = !!user?.hasFullAccess;
  const emptyForm = { firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", clientType: "particulier", companyName: "", companySiret: "", companyVatNumber: "", address: "", postalCode: "", city: "" };
  const [data, setData] = useState(emptyForm);
  const isPro = data.clientType !== "particulier";
  const createMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/clients", {
      ...data,
      companyName: isPro ? data.companyName || null : null,
      companySiret: isPro ? data.companySiret || null : null,
      companyVatNumber: isPro ? data.companyVatNumber || null : null,
      // Adresse d'un client pro : utile à la facture (mention obligatoire).
      address: data.address || null,
      postalCode: data.postalCode || null,
      city: data.city || null,
    })).json(),
    onSuccess: (created: Client) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client créé", description: "Sa fiche est ouverte : complétez-la quand vous voulez.", variant: "success" });
      setData(emptyForm);
      onClose();
      if (created?.id) onCreated(created.id);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  async function submit() {
    if (createMut.isPending || !data.firstName.trim() || !data.lastName.trim()) return;
    // Lot 5 (QC Client) — détection de doublon à la création : même nom
    // complet (accents ignorés) ou même email → confirmation avant de créer une 2e fiche.
    const nom = normalize(`${data.firstName} ${data.lastName}`);
    const email = normalize(data.email);
    const doublon = existing.find((c) =>
      normalize(`${c.firstName} ${c.lastName}`) === nom ||
      (email && normalize(c.email) === email));
    if (doublon) {
      const ok = await confirm({
        title: "Cette cliente existe peut-être déjà",
        description: `Une fiche « ${doublon.firstName} ${doublon.lastName}${doublon.email ? ` — ${doublon.email}` : ""} » existe déjà. Créer une seconde fiche éclaterait son historique. Créer quand même ?`,
        confirmLabel: "Créer quand même",
        cancelLabel: "Annuler",
      });
      if (!ok) return;
    }
    createMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouveau client</DialogTitle></DialogHeader>
        <form className="space-y-3 py-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="new-firstName">Prénom *</Label><Input id="new-firstName" autoFocus autoComplete="off" value={data.firstName} onChange={e => setData({ ...data, firstName: e.target.value })} data-testid="input-firstName" /></div>
            <div><Label htmlFor="new-lastName">Nom *</Label><Input id="new-lastName" autoComplete="off" value={data.lastName} onChange={e => setData({ ...data, lastName: e.target.value })} data-testid="input-lastName" /></div>
          </div>
          <div><Label htmlFor="new-email">Email</Label><Input id="new-email" type="email" autoComplete="off" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} data-testid="input-email" /></div>
          <div><Label htmlFor="new-phone">Téléphone</Label><Input id="new-phone" type="tel" autoComplete="off" value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} data-testid="input-phone" /></div>
          {fullAccess && (
            <div><Label htmlFor="new-dob">Date de naissance</Label><Input id="new-dob" type="date" value={data.dateOfBirth} onChange={e => setData({ ...data, dateOfBirth: e.target.value })} data-testid="input-dob" /></div>
          )}
          {/* Lot 4 (action C5) — facturation B2B : client particulier ou entreprise */}
          <div>
            <Label>Type de client</Label>
            <Select value={data.clientType} onValueChange={v => setData({ ...data, clientType: v })}>
              <SelectTrigger data-testid="select-new-client-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="particulier">Particulier</SelectItem>
                <SelectItem value="entreprise">Entreprise ou professionnel</SelectItem>
                <SelectItem value="association">Association</SelectItem>
                <SelectItem value="public">Organisme public</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isPro && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Raison sociale</Label><Input value={data.companyName} onChange={e => setData({ ...data, companyName: e.target.value })} data-testid="input-new-company-name" /></div>
              <div className="col-span-2">
                <Label>SIREN ou SIRET</Label>
                <div className="flex gap-2">
                  <Input value={data.companySiret} onChange={e => setData({ ...data, companySiret: e.target.value })} data-testid="input-new-company-siret" />
                  <CompanyLookup
                    initialQuery={data.companySiret || data.companyName}
                    testid="button-new-client-lookup"
                    onPick={(r) => setData({
                      ...data,
                      clientType: data.clientType === "entreprise" ? r.clientKind : data.clientType,
                      companyName: r.name,
                      companySiret: r.siret || r.siren,
                      companyVatNumber: r.vatNumber || data.companyVatNumber,
                      address: r.address || data.address,
                      postalCode: r.postalCode || data.postalCode,
                      city: r.city || data.city,
                    })}
                  />
                </div>
              </div>
              <div className="col-span-2"><Label>N° de TVA intracommunautaire</Label><Input value={data.companyVatNumber} onChange={e => setData({ ...data, companyVatNumber: e.target.value })} data-testid="input-new-company-vat" /></div>
              {fullAccess && (
                <>
                  <div className="col-span-2"><Label>Adresse</Label><Input value={data.address} onChange={e => setData({ ...data, address: e.target.value })} data-testid="input-new-company-address" /></div>
                  <div><Label>Code postal</Label><Input value={data.postalCode} onChange={e => setData({ ...data, postalCode: e.target.value })} data-testid="input-new-company-postal" /></div>
                  <div><Label>Ville</Label><Input value={data.city} onChange={e => setData({ ...data, city: e.target.value })} data-testid="input-new-company-city" /></div>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Seuls le prénom et le nom sont obligatoires : le reste se complète depuis la fiche.</p>
          <Button
            type="submit"
            disabled={createMut.isPending || !data.firstName.trim() || !data.lastName.trim()}
            className="w-full rounded-md py-5 font-bold" data-testid="button-submit-client"
          >{createMut.isPending ? "Création…" : "Créer et ouvrir la fiche"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
