import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Mail, Phone, ArrowRight, Users, Upload, Loader2, Send, Archive } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompanyLookup } from "@/components/CompanyLookup";
import { BroadcastDialog } from "@/components/BroadcastDialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Client } from "@shared/schema";

export default function Clients() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // Lot 5 (action P21) — tri de la liste (nom / dernier RDV / fiche récente).
  const [sortBy, setSortBy] = useState<"name" | "lastAppt" | "recent">("name");
  // Lot 2b — fiches archivées (masquées par défaut) et message groupé.
  const [showArchived, setShowArchived] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: list, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients", { search }],
    queryFn: async () => (await apiRequest("GET", `/api/clients?search=${encodeURIComponent(search)}`)).json(),
  });
  const { data: lastAppts = [] } = useQuery<Array<{ clientId: number; lastApptAt: number }>>({
    queryKey: ["/api/clients-last-appointment"],
  });
  const lastApptByClient = new Map(lastAppts.map((r) => [r.clientId, r.lastApptAt]));
  const archivedCount = (list || []).filter((c) => (c as any).archivedAt).length;
  const visible = (list || []).filter((c) => !!(c as any).archivedAt === showArchived);
  const sorted = [...visible].sort((a, b) => {
    if (sortBy === "lastAppt") return (lastApptByClient.get(b.id) || 0) - (lastApptByClient.get(a.id) || 0);
    if (sortBy === "recent") return b.createdAt - a.createdAt;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr");
  });

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
      toast({ title: "Import terminé", description: details });
    },
    onError: (e: any) => toast({ title: "Import impossible", description: e?.message || "Vérifie le fichier CSV.", variant: "destructive" }),
  });

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    importMut.mutate(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  }

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
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importMut.isPending}
                className="rounded-lg font-bold"
                title="CSV avec colonnes Prénom, Nom, Email, Téléphone (export Excel ou Google Sheets)"
                data-testid="button-import-clients"
              >
                {importMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                Importer CSV
              </Button>
              {user?.hasFullAccess && (
                <Button variant="outline" onClick={() => setBroadcasting(true)} className="rounded-lg font-bold" data-testid="button-broadcast">
                  <Send className="h-4 w-4 mr-1" /> Écrire à toutes
                </Button>
              )}
              <Button onClick={() => setCreating(true)} className="rounded-lg font-bold" data-testid="button-new-client">
                <Plus className="h-4 w-4 mr-1" /> Nouveau client
              </Button>
            </div>
          }
        />

        <div className="card-naturo mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, prénom, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 rounded-lg"
              data-testid="input-search-clients"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-full sm:w-56" data-testid="select-sort-clients">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Tri : nom (A → Z)</SelectItem>
              <SelectItem value="lastAppt">Tri : dernier RDV</SelectItem>
              <SelectItem value="recent">Tri : fiche la plus récente</SelectItem>
            </SelectContent>
          </Select>
          {(archivedCount > 0 || showArchived) && (
            <Button
              variant={showArchived ? "default" : "outline"}
              onClick={() => setShowArchived(!showArchived)}
              className="rounded-md font-bold whitespace-nowrap"
              aria-pressed={showArchived}
              data-testid="button-toggle-archived"
            >
              <Archive className="h-4 w-4 mr-1" /> {showArchived ? "Voir les actives" : `Archivées (${archivedCount})`}
            </Button>
          )}
        </div>

        {isLoading ? (
          <Loading variant="cards" count={6} label="Chargement des clients…" />
        ) : showArchived && sorted.length === 0 ? (
          <EmptyState icon={Archive} title="Aucune fiche archivée" description="Une fiche archivée quitte la liste et les messages groupés, sans rien perdre de son historique." testid="empty-archived" />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Users}
            title={`Aucun client ${search ? "trouvé" : "pour le moment"}`}
            description={search ? "Essayez avec un autre mot-clé." : "Créez votre première fiche client pour commencer."}
            action={!search ? (
              <Button onClick={() => setCreating(true)} className="rounded-lg" data-testid="button-empty-create">
                <Plus className="h-4 w-4 mr-1" /> Nouveau client
              </Button>
            ) : undefined}
            testid="empty-clients"
          />
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(c => {
              const lastAppt = lastApptByClient.get(c.id);
              // Actif = au moins un RDV (passé ou à venir) dans une fenêtre de 90 jours.
              const actif = lastAppt != null && lastAppt > Date.now() - 90 * 86400000;
              return (
                <li key={c.id}>
                  <Link href={`/app/clients/${c.id}`} className="card-naturo block hover:border-primary hover:bg-secondary/30 transition-colors" data-testid={`card-client-${c.id}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="h-12 w-12 rounded-full bg-secondary text-primary flex items-center justify-center text-lg font-bold">
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{c.firstName} {c.lastName}</p>
                        {c.dateOfBirth && <p className="text-xs text-muted-foreground">Né(e) le {new Date(c.dateOfBirth).toLocaleDateString("fr-FR")}</p>}
                        {(c as any).archivedAt && <p className="text-xs text-muted-foreground">Archivée le {new Date((c as any).archivedAt).toLocaleDateString("fr-FR")}</p>}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {c.email && <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5" /> {c.email}</p>}
                      {c.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {c.phone}</p>}
                      {/* Lot 5 (P21) — dernier RDV + statut d'activité sur la carte */}
                      <p className="flex items-center gap-2 pt-1" data-testid={`text-last-appt-${c.id}`}>
                        <span className={`inline-block h-2 w-2 rounded-full ${actif ? "bg-primary" : "bg-gray-300"}`} />
                        {lastAppt
                          ? `Dernier RDV : ${new Date(lastAppt).toLocaleDateString("fr-FR")}${actif ? "" : " — inactif"}`
                          : "Aucun RDV"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NewClientDialog open={creating} onClose={() => setCreating(false)} existing={list || []} />
      <BroadcastDialog open={broadcasting} onClose={() => setBroadcasting(false)} />
    </AppLayout>
  );
}

function NewClientDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: Client[] }) {
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
    mutationFn: async () => apiRequest("POST", "/api/clients", {
      ...data,
      companyName: isPro ? data.companyName || null : null,
      companySiret: isPro ? data.companySiret || null : null,
      companyVatNumber: isPro ? data.companyVatNumber || null : null,
      // Adresse d'un client pro : utile à la facture (mention obligatoire).
      address: data.address || null,
      postalCode: data.postalCode || null,
      city: data.city || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client créé", variant: "success" });
      setData(emptyForm);
      onClose();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau client</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
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
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Prénom *</Label><Input value={data.firstName} onChange={e => setData({ ...data, firstName: e.target.value })} data-testid="input-firstName" /></div>
            <div><Label>Nom *</Label><Input value={data.lastName} onChange={e => setData({ ...data, lastName: e.target.value })} data-testid="input-lastName" /></div>
          </div>
          <div><Label>Email</Label><Input type="email" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} data-testid="input-email" /></div>
          <div><Label>Téléphone</Label><Input value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} data-testid="input-phone" /></div>
          {fullAccess && (
            <div><Label>Date de naissance</Label><Input type="date" value={data.dateOfBirth} onChange={e => setData({ ...data, dateOfBirth: e.target.value })} data-testid="input-dob" /></div>
          )}
          <Button
            onClick={async () => {
              // Lot 5 (QC Client) — détection de doublon à la création : même nom
              // complet ou même email → confirmation avant de créer une 2e fiche.
              const nom = `${data.firstName} ${data.lastName}`.trim().toLowerCase();
              const email = data.email.trim().toLowerCase();
              const doublon = existing.find((c) =>
                `${c.firstName} ${c.lastName}`.trim().toLowerCase() === nom ||
                (email && (c.email || "").toLowerCase() === email));
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
            }}
            disabled={createMut.isPending || !data.firstName || !data.lastName}
            className="w-full rounded-lg py-5 font-bold" data-testid="button-submit-client"
          >{createMut.isPending ? "Création…" : "Créer"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
