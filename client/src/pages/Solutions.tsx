/**
 * client/src/pages/Solutions.tsx — Base de solutions naturelles
 *
 * Catalogue de référence (plantes, HE, compléments, fleurs de Bach…) consultable
 * et cherchable. Entrées globales (lecture seule) + entrées perso du praticien
 * (modifiables/supprimables). Sert d'aide à la construction des programmes.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Leaf } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Loading } from "@/components/Loading";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/hooks/use-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { NaturalSolution } from "@shared/schema";

const CATEGORY_COLORS: Record<string, string> = {
  "Plante": "bg-emerald-50 border-emerald-200 text-emerald-800",
  "Huile essentielle": "bg-violet-50 border-violet-200 text-violet-800",
  "Complément": "bg-sky-50 border-sky-200 text-sky-800",
  "Fleur de Bach": "bg-rose-50 border-rose-200 text-rose-800",
};
const CATEGORIES = ["Plante", "Huile essentielle", "Complément", "Fleur de Bach"];

export default function Solutions() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: solutions = [], isLoading } = useQuery<NaturalSolution[]>({ queryKey: ["/api/solutions"] });
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [editing, setEditing] = useState<NaturalSolution | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return solutions.filter((s) => {
      if (catFilter !== "all" && s.category !== catFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.properties || "").toLowerCase().includes(q)
      );
    });
  }, [solutions, search, catFilter]);

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/solutions/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/solutions"] });
      const prev = queryClient.getQueryData(["/api/solutions"]);
      queryClient.setQueryData(["/api/solutions"], (old: any) => (old ?? []).filter((it: any) => it.id !== id));
      return { prev };
    },
    onSuccess: () => { toast({ title: "Solution supprimée", variant: "success" }); },
    onError: (_e, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/solutions"], ctx.prev);
      toast({ title: "Erreur", description: "Suppression impossible.", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/solutions"] }),
  });

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <PageHeader
          title="Bibliothèque de référence"
          subtitle="Votre catalogue de solutions naturelles."
          icon={Leaf}
          actions={
            <Button onClick={() => setEditing("new")} className="rounded-[15px] font-bold" data-testid="button-new-solution">
              <Plus className="h-4 w-4 mr-1" /> Ajouter une solution
            </Button>
          }
        />

        <HelpNote>
          <p>
            Cette page est une <strong>bibliothèque de référence</strong> : plantes, huiles essentielles,
            compléments et fleurs de Bach, avec leurs propriétés, leurs précautions et des conseils d'usage.
            Elle vous évite de partir de zéro quand vous construisez un <strong>programme d'hygiène de vie</strong>.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Comment ça marche ?</p>
            <ul>
              <li>🔎 <strong>Cherchez</strong> une solution par nom ou propriété, ou filtrez par catégorie.</li>
              <li>➕ <strong>Ajoutez vos propres fiches</strong> : elles s'ajoutent à la base (les fiches de base ne sont pas modifiables).</li>
              <li>📄 Depuis un <strong>programme</strong>, bouton « Piocher dans la base » pour insérer une solution dans une section.</li>
            </ul>
          </div>
          <p className="text-xs italic">
            ⚠️ Information d'hygiène de vie à visée naturopathique : ne remplace pas un avis médical.
            Vérifiez toujours les précautions (grossesse, traitements, terrain) avant tout conseil.
          </p>
        </HelpNote>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (nom, propriété…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-solution"
            />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-56" data-testid="select-category-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Loading variant="cards" count={4} label="Chargement des solutions…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Leaf}
            title="Aucune solution trouvée"
            description="Modifiez votre recherche ou ajoutez votre propre fiche."
          />
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {filtered.map((s) => (
              <li key={s.id} className="card-naturo" data-testid={`solution-${s.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-extrabold">{s.name}</h3>
                    <Badge variant="outline" className={`mt-1 text-[11px] ${CATEGORY_COLORS[s.category] || ""}`}>{s.category}</Badge>
                  </div>
                  {s.userId !== null && (
                    <div className="flex gap-1 shrink-0">
                      <button aria-label="Modifier la solution" className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => setEditing(s)} data-testid={`button-edit-solution-${s.id}`}><Pencil className="h-4 w-4" /></button>
                      <button aria-label="Supprimer la solution" className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={async () => { if (!(await confirm({ title: "Supprimer cette solution ?", description: "Cette action est définitive.", confirmLabel: "Supprimer", cancelLabel: "Annuler", destructive: true }))) return; delMut.mutate(s.id); }} data-testid={`button-delete-solution-${s.id}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
                {s.properties && <p className="text-sm mb-2"><span className="font-semibold text-primary">Propriétés :</span> {s.properties}</p>}
                {s.usageNotes && <p className="text-sm mb-2 text-muted-foreground"><span className="font-semibold text-foreground">Usage :</span> {s.usageNotes}</p>}
                {s.contraindications && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1"><span className="font-semibold">⚠️ Précautions :</span> {s.contraindications}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing !== null && (
        <SolutionEditor editing={editing} onClose={() => setEditing(null)} />
      )}
    </AppLayout>
  );
}

function SolutionEditor({ editing, onClose }: { editing: NaturalSolution | "new"; onClose: () => void }) {
  const { toast } = useToast();
  const isNew = editing === "new";
  const init = isNew ? null : (editing as NaturalSolution);
  const [name, setName] = useState(init?.name ?? "");
  const [category, setCategory] = useState(init?.category ?? "Plante");
  const [properties, setProperties] = useState(init?.properties ?? "");
  const [contraindications, setContraindications] = useState(init?.contraindications ?? "");
  const [usageNotes, setUsageNotes] = useState(init?.usageNotes ?? "");

  const mut = useMutation({
    mutationFn: async () => {
      const body = { name, category, properties: properties || null, contraindications: contraindications || null, usageNotes: usageNotes || null };
      if (isNew) await apiRequest("POST", "/api/solutions", body);
      else await apiRequest("PATCH", `/api/solutions/${(editing as NaturalSolution).id}`, body);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/solutions"] }); toast({ title: "Solution enregistrée", variant: "success" }); onClose(); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "Nouvelle solution" : "Modifier la solution"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-solution-name" /></div>
          <div>
            <Label>Catégorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-solution-category"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Propriétés / indications</Label><Textarea rows={2} value={properties} onChange={(e) => setProperties(e.target.value)} /></div>
          <div><Label>Conseils d'usage</Label><Textarea rows={2} value={usageNotes} onChange={(e) => setUsageNotes(e.target.value)} /></div>
          <div><Label>Précautions / contre-indications</Label><Textarea rows={2} value={contraindications} onChange={(e) => setContraindications(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-[12px]">Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending} className="rounded-[15px] font-bold" data-testid="button-save-solution">
            {mut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
