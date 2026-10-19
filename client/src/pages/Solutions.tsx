/**
 * client/src/pages/Solutions.tsx — Base de solutions naturelles
 *
 * Catalogue de référence (plantes, HE, compléments, fleurs de Bach…) consultable
 * et cherchable. Entrées globales (lecture seule, duplicables) + entrées perso du
 * praticien (modifiables/supprimables). Sert d'aide à la construction des programmes.
 *
 * Liste compacte (une ligne par fiche), fiche complète au clic : la base dépasse
 * la centaine d'entrées, des cartes pleines la rendaient illisible.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Leaf, AlertTriangle, Copy, ChevronRight, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { SubNav, RESSOURCES_TABS } from "@/components/SubNav";
import { Loading } from "@/components/Loading";
import { HelpNote, HelpWarn } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/hooks/use-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { filterSolutions, countByCategory } from "@/lib/solutions-filter";
import type { NaturalSolution } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

const CATEGORY_COLORS: Record<string, string> = {
  "Plante": "bg-emerald-50 border-emerald-200 text-emerald-800",
  "Huile essentielle": "bg-violet-50 border-violet-200 text-violet-800",
  "Complément": "bg-sky-50 border-sky-200 text-sky-800",
  "Fleur de Bach": "bg-rose-50 border-rose-200 text-rose-800",
};
const CATEGORIES = ["Plante", "Huile essentielle", "Complément", "Fleur de Bach"];
const CATEGORY_TABS: Record<string, string> = {
  "Plante": "Plantes",
  "Huile essentielle": "Huiles essentielles",
  "Complément": "Compléments",
  "Fleur de Bach": "Fleurs de Bach",
};
const PRECAUTIONS = ["grossesse", "allaitement", "enfant", "anticoagulant"];

type Draft = Pick<NaturalSolution, "name" | "category" | "properties" | "contraindications" | "usageNotes">;
/** id null = création (nouvelle fiche ou copie d'une fiche de base). */
type Editing = { id: number | null; init: Draft; title: string };

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className={`rounded-sm text-xs font-medium ${CATEGORY_COLORS[category] || ""}`}>
      {category}
    </Badge>
  );
}

function Solutions() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: solutions = [], isLoading } = useQuery<NaturalSolution[]>({ queryKey: ["/api/solutions"] });
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [precaution, setPrecaution] = useState<string | null>(null);
  const [viewing, setViewing] = useState<NaturalSolution | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  // La recherche couvre aussi précautions et usage, sans accents ; catégorie et
  // précaution se cumulent avec le texte tapé sans l'écraser.
  const filtered = useMemo(
    () => filterSolutions(solutions, { search, category: catFilter, precaution }),
    [solutions, search, catFilter, precaution],
  );
  // Compteurs des onglets : recherche et précaution appliquées, catégorie non.
  const counts = useMemo(
    () => countByCategory(filterSolutions(solutions, { search, precaution })),
    [solutions, search, precaution],
  );
  const totalInTabs = Object.values(counts).reduce((a, b) => a + b, 0);
  const hasFilters = !!search.trim() || catFilter !== "all" || !!precaution;

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

  const draftOf = (s: NaturalSolution): Draft => ({
    name: s.name, category: s.category, properties: s.properties, contraindications: s.contraindications, usageNotes: s.usageNotes,
  });

  async function remove(s: NaturalSolution) {
    if (!(await confirm({ title: "Supprimer cette solution ?", description: "Cette action est définitive.", confirmLabel: "Supprimer", cancelLabel: "Annuler", destructive: true }))) return;
    setViewing(null);
    delMut.mutate(s.id);
  }

  function resetFilters() {
    setSearch("");
    setCatFilter("all");
    setPrecaution(null);
  }

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <SubNav group="ressources" tabs={RESSOURCES_TABS} />
        <PageHeader
          title="Bibliothèque de référence"
          subtitle={solutions.length > 0
            ? `${solutions.length} fiches de solutions naturelles, prêtes à glisser dans vos programmes.`
            : "Votre catalogue de solutions naturelles."}
          icon={Leaf}
          actions={
            <Button
              onClick={() => setEditing({ id: null, title: "Nouvelle solution", init: { name: "", category: "Plante", properties: null, contraindications: null, usageNotes: null } })}
              className="font-bold"
              data-testid="button-new-solution"
            >
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
              <li><strong>Cherchez</strong> une solution par nom, propriété ou précaution, avec ou sans accents, ou choisissez une catégorie.</li>
              <li><strong>Cliquez sur une fiche</strong> pour la lire en entier.</li>
              <li><strong>Dupliquez une fiche de base</strong> pour l'adapter à votre pratique, ou ajoutez la vôtre de zéro.</li>
              <li>Depuis un <strong>programme</strong>, bouton « Piocher dans la base » pour insérer une solution dans une section.</li>
            </ul>
          </div>
          <HelpWarn>Information d'hygiène de vie à visée naturopathique : ne remplace pas un avis médical.
            Vérifiez toujours les précautions (grossesse, traitements, terrain) avant tout conseil.</HelpWarn>
        </HelpNote>

        {/* Recherche */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher (nom, propriété, précaution…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-solution"
          />
        </div>

        {/* Catégories en onglets, avec compteurs */}
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Catégories">
          {[["all", "Toutes", totalInTabs] as const, ...CATEGORIES.map((c) => [c, CATEGORY_TABS[c], counts[c] || 0] as const)].map(([value, label, n]) => {
            const active = catFilter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setCatFilter(value)}
                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-md border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-secondary"
                }`}
                data-testid={`tab-category-${value === "all" ? "all" : value.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {label}
                <span className={`text-xs tabular-nums ${active ? "opacity-80" : "text-muted-foreground"}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Précautions : filtre à part, ne touche pas au texte tapé */}
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
          <span className="font-bold text-muted-foreground uppercase tracking-wide">Précautions mentionnant :</span>
          {PRECAUTIONS.map((mot) => {
            const active = precaution === mot;
            return (
              <button
                key={mot}
                type="button"
                aria-pressed={active}
                onClick={() => setPrecaution(active ? null : mot)}
                className={`px-2.5 py-1 rounded-sm border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "bg-amber-100 text-amber-900 border-amber-300" : "border-input hover:bg-secondary"
                }`}
                data-testid={`chip-precaution-${mot}`}
              >
                {mot}
              </button>
            );
          })}
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="button-reset-filters"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Tout effacer
            </button>
          )}
        </div>

        {isLoading ? (
          <Loading variant="cards" count={4} label="Chargement des solutions…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Leaf}
            title="Aucune solution trouvée"
            description="Modifiez votre recherche ou ajoutez votre propre fiche."
            testid="empty-solutions"
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2" data-testid="text-solutions-count">
              {filtered.length} fiche{filtered.length > 1 ? "s" : ""}
            </p>
            <ul className="card-naturo p-0 divide-y divide-border overflow-hidden">
              {filtered.map((s) => (
                <li key={s.id} data-testid={`solution-${s.id}`}>
                  <button
                    type="button"
                    onClick={() => setViewing(s)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    data-testid={`button-open-solution-${s.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{s.name}</span>
                        <CategoryBadge category={s.category} />
                        {s.userId !== null && <Badge variant="secondary" className="rounded-sm text-xs font-medium">Ma fiche</Badge>}
                      </div>
                      {s.properties && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{s.properties}</p>}
                    </div>
                    {s.contraindications && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5" title={s.contraindications}>
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Précautions</span>
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {viewing && (
        <Dialog open onOpenChange={(o) => { if (!o) setViewing(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-solution-detail">
            <DialogHeader>
              <DialogTitle>{viewing.name}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex items-center gap-2 pt-1">
                  <CategoryBadge category={viewing.category} />
                  <span className="text-xs">{viewing.userId !== null ? "Ma fiche" : "Fiche de base"}</span>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {viewing.properties && <div><h4 className="text-primary mb-0.5">Propriétés</h4><p>{viewing.properties}</p></div>}
              {viewing.usageNotes && <div><h4 className="mb-0.5">Conseils d'usage</h4><p className="text-muted-foreground">{viewing.usageNotes}</p></div>}
              {viewing.contraindications && (
                <div className="flex gap-2 text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div><h4 className="mb-0.5">Précautions</h4><p>{viewing.contraindications}</p></div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {viewing.userId !== null ? (
                <>
                  <Button variant="outline" className="text-destructive" onClick={() => remove(viewing)} data-testid={`button-delete-solution-${viewing.id}`}>
                    <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                  </Button>
                  <Button onClick={() => { setEditing({ id: viewing.id, title: "Modifier la solution", init: draftOf(viewing) }); setViewing(null); }} data-testid={`button-edit-solution-${viewing.id}`}>
                    <Pencil className="h-4 w-4 mr-1" /> Modifier
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => { setEditing({ id: null, title: "Dupliquer la fiche", init: { ...draftOf(viewing), name: `${viewing.name} (ma version)` } }); setViewing(null); }}
                  data-testid={`button-duplicate-solution-${viewing.id}`}
                >
                  <Copy className="h-4 w-4 mr-1" /> Dupliquer pour l'adapter
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editing !== null && (
        <SolutionEditor editing={editing} onClose={() => setEditing(null)} />
      )}
    </AppLayout>
  );
}

function SolutionEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { toast } = useToast();
  const { init } = editing;
  const [name, setName] = useState(init.name);
  const [category, setCategory] = useState(init.category);
  const [properties, setProperties] = useState(init.properties ?? "");
  const [contraindications, setContraindications] = useState(init.contraindications ?? "");
  const [usageNotes, setUsageNotes] = useState(init.usageNotes ?? "");

  const mut = useMutation({
    mutationFn: async () => {
      const body = { name, category, properties: properties || null, contraindications: contraindications || null, usageNotes: usageNotes || null };
      if (editing.id === null) await apiRequest("POST", "/api/solutions", body);
      else await apiRequest("PATCH", `/api/solutions/${editing.id}`, body);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/solutions"] }); toast({ title: "Solution enregistrée", variant: "success" }); onClose(); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing.title}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-solution-name" /></div>
          <div>
            <Label>Catégorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-solution-category"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Propriétés / indications</Label><Textarea rows={3} value={properties} onChange={(e) => setProperties(e.target.value)} /></div>
          <div><Label>Conseils d'usage</Label><Textarea rows={3} value={usageNotes} onChange={(e) => setUsageNotes(e.target.value)} /></div>
          <div><Label>Précautions / contre-indications</Label><Textarea rows={3} value={contraindications} onChange={(e) => setContraindications(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending} className="font-bold" data-testid="button-save-solution">
            {mut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function SolutionsGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="La bibliothèque de référence" description="La bibliothèque complète de solutions naturelles est réservée à l'abonnement Naturo Pro." />;
  }
  return <Solutions />;
}
