import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Mail, Phone, ArrowRight, Users, Upload, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Client } from "@shared/schema";

export default function Clients() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: list, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients", { search }],
    queryFn: async () => (await apiRequest("GET", `/api/clients?search=${encodeURIComponent(search)}`)).json(),
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
              <Button onClick={() => setCreating(true)} className="rounded-lg font-bold" data-testid="button-new-client">
                <Plus className="h-4 w-4 mr-1" /> Nouveau client
              </Button>
            </div>
          }
        />

        <div className="card-naturo mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, prénom, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 rounded-[12px]"
              data-testid="input-search-clients"
            />
          </div>
        </div>

        {isLoading ? (
          <Loading variant="cards" count={6} label="Chargement des clients…" />
        ) : (list || []).length === 0 ? (
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
            {(list || []).map(c => (
              <li key={c.id}>
                <Link href={`/app/clients/${c.id}`} className="card-naturo block hover:-translate-y-0.5 transition" data-testid={`card-client-${c.id}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-12 w-12 rounded-full bg-secondary text-primary flex items-center justify-center text-lg font-extrabold">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold truncate">{c.firstName} {c.lastName}</p>
                      {c.dateOfBirth && <p className="text-xs text-muted-foreground">Né(e) le {new Date(c.dateOfBirth).toLocaleDateString("fr-FR")}</p>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {c.email && <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5" /> {c.email}</p>}
                    {c.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {c.phone}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewClientDialog open={creating} onClose={() => setCreating(false)} />
    </AppLayout>
  );
}

function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  // Lot 1 (décision 5) — la fiche client gratuite se limite aux coordonnées :
  // le champ « Date de naissance » (donnée étendue, ignorée par le serveur en
  // gratuit) est masqué au lieu d'être silencieusement perdu à l'enregistrement.
  const fullAccess = !!user?.hasFullAccess;
  const emptyForm = { firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", clientType: "particulier", companyName: "", companySiret: "" };
  const [data, setData] = useState(emptyForm);
  const createMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/clients", {
      ...data,
      companyName: data.clientType === "entreprise" ? data.companyName || null : null,
      companySiret: data.clientType === "entreprise" ? data.companySiret || null : null,
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
                <SelectItem value="entreprise">Entreprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data.clientType === "entreprise" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Raison sociale</Label><Input value={data.companyName} onChange={e => setData({ ...data, companyName: e.target.value })} data-testid="input-new-company-name" /></div>
              <div><Label>SIRET</Label><Input value={data.companySiret} onChange={e => setData({ ...data, companySiret: e.target.value })} data-testid="input-new-company-siret" /></div>
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
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !data.firstName || !data.lastName}
            className="w-full rounded-lg py-5 font-bold" data-testid="button-submit-client"
          >{createMut.isPending ? "Création…" : "Créer"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
