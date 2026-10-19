/**
 * client/src/pages/Solutions.tsx — Base de solutions naturelles
 *
 * Catalogue de référence (plantes, HE, compléments, fleurs de Bach, bourgeons,
 * hydrolats, oligo-éléments) consultable et cherchable. Entrées globales (lecture
 * seule, duplicables) + entrées perso du praticien (modifiables/supprimables).
 * Sert d'aide à la construction des programmes.
 *
 * Liste compacte (une ligne par fiche) qui se déplie sur place au clic.
 * Précautions structurées par critère (shared/solutions.ts) : le filtre « Cliente
 * concernée » masque les fiches contre-indiquées et signale celles à prudence.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Leaf, AlertTriangle, Copy, ChevronDown, X, Sparkles, Loader2, Ban } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { filterSolutions, countByCategory } from "@/lib/solutions-filter";
import {
  SOLUTION_CATEGORIES, SOLUTION_CATEGORY_PLURALS, SAFETY_CRITERIA, SAFETY_KEYS, SAFETY_LABELS,
  parseSafety, parseList, safetyAlerts, type Safety, type SafetyKey, type SafetyLevel,
} from "@shared/solutions";
import type { NaturalSolution } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

const CATEGORY_COLORS: Record<string, string> = {
  "Plante": "bg-emerald-50 border-emerald-200 text-emerald-800",
  "Huile essentielle": "bg-violet-50 border-violet-200 text-violet-800",
  "Complément": "bg-sky-50 border-sky-200 text-sky-800",
  "Fleur de Bach": "bg-rose-50 border-rose-200 text-rose-800",
  "Bourgeon": "bg-lime-50 border-lime-200 text-lime-800",
  "Hydrolat": "bg-cyan-50 border-cyan-200 text-cyan-800",
  "Oligo-élément": "bg-stone-100 border-stone-300 text-stone-800",
};

const LEVEL_STYLES: Record<SafetyLevel, string> = {
  ci: "bg-red-50 border-red-200 text-red-800",
  prudence: "bg-amber-50 border-amber-200 text-amber-800",
};

type Draft = {
  name: string;
  category: string;
  properties: string;
  usageNotes: string;
  contraindications: string;
  form: string;
  cureDuration: string;
  synergies: string; // saisie : noms séparés par des virgules
  sources: string;
  safety: Safety;
};
/** id null = création (nouvelle fiche ou copie d'une fiche de base). */
type Editing = { id: number | null; init: Draft; title: string };

const EMPTY_DRAFT: Draft = {
  name: "", category: "Plante", properties: "", usageNotes: "", contraindications: "",
  form: "", cureDuration: "", synergies: "", sources: "", safety: {},
};

function draftOf(s: NaturalSolution): Draft {
  return {
    name: s.name,
    category: s.category,
    properties: s.properties ?? "",
    usageNotes: s.usageNotes ?? "",
    contraindications: s.contraindications ?? "",
    form: s.form ?? "",
    cureDuration: s.cureDuration ?? "",
    synergies: parseList(s.synergies).join(", "),
    sources: s.sources ?? "",
    safety: parseSafety(s.safety),
  };
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className={`rounded-sm text-xs font-medium ${CATEGORY_COLORS[category] || ""}`}>
      {category}
    </Badge>
  );
}

function SafetyChips({ safety }: { safety: Safety }) {
  const levels: SafetyLevel[] = ["ci", "prudence"];
  const groups = levels.map((lvl) => ({ lvl, keys: SAFETY_KEYS.filter((k) => safety[k] === lvl) })).filter((g) => g.keys.length);
  if (!groups.length) return null;
  return (
    <div className="space-y-1.5">
      {groups.map(({ lvl, keys }) => (
        <div key={lvl} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0">{lvl === "ci" ? "Contre-indiqué :" : "Prudence :"}</span>
          {keys.map((k) => (
            <span key={k} className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-sm px-1.5 py-0.5 ${LEVEL_STYLES[lvl]}`}>
              {lvl === "ci" ? <Ban className="h-3 w-3" aria-hidden="true" /> : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
              {SAFETY_LABELS[k]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Solutions() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: rawSolutions = [], isLoading } = useQuery<NaturalSolution[]>({ queryKey: ["/api/solutions"] });
  // Ordre des onglets (Plantes d'abord), puis alphabétique.
  const solutions = useMemo(() => {
    const rank = (c: string) => { const i = (SOLUTION_CATEGORIES as readonly string[]).indexOf(c); return i < 0 ? 99 : i; };
    return [...rawSolutions].sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name, "fr"));
  }, [rawSolutions]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [profile, setProfile] = useState<SafetyKey[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);

  // La recherche couvre aussi précautions, usage et forme, sans accents ; catégorie
  // et profil se cumulent avec le texte tapé sans l'écraser.
  const filtered = useMemo(
    () => filterSolutions(solutions, { search, category: catFilter, profile }),
    [solutions, search, catFilter, profile],
  );
  // Compteurs des onglets : recherche et profil appliqués, catégorie non.
  const counts = useMemo(
    () => countByCategory(filterSolutions(solutions, { search, profile })),
    [solutions, search, profile],
  );
  const hiddenByProfile = useMemo(
    () => (profile.length ? filterSolutions(solutions, { search, category: catFilter }).length - filtered.length : 0),
    [solutions, search, catFilter, profile, filtered],
  );
  const totalInTabs = Object.values(counts).reduce((a, b) => a + b, 0);
  const categories = SOLUTION_CATEGORIES.filter((c) => solutions.some((s) => s.category === c));
  const hasFilters = !!search.trim() || catFilter !== "all" || profile.length > 0;
  const byName = useMemo(() => new Map(solutions.map((s) => [s.name, s])), [solutions]);

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

  async function remove(s: NaturalSolution) {
    if (!(await confirm({ title: "Supprimer cette solution ?", description: "Cette action est définitive.", confirmLabel: "Supprimer", cancelLabel: "Annuler", destructive: true }))) return;
    delMut.mutate(s.id);
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleProfile(k: SafetyKey) {
    setProfile((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  // Synergie cliquée : on affiche cette fiche, dépliée.
  function showSolution(name: string) {
    const target = byName.get(name);
    setSearch(name);
    setCatFilter("all");
    if (target) setExpanded((prev) => new Set(prev).add(target.id));
  }

  function resetFilters() {
    setSearch("");
    setCatFilter("all");
    setProfile([]);
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
              onClick={() => setEditing({ id: null, title: "Nouvelle solution", init: EMPTY_DRAFT })}
              className="font-bold"
              data-testid="button-new-solution"
            >
              <Plus className="h-4 w-4 mr-1" /> Ajouter une solution
            </Button>
          }
        />

        <HelpNote defaultOpen>
          <p>
            Cette page est une <strong>bibliothèque de référence</strong> : plantes, huiles essentielles,
            compléments, fleurs de Bach, bourgeons, hydrolats et oligo-éléments, avec leurs propriétés, leurs
            précautions et des conseils d'usage. Elle vous évite de partir de zéro quand vous construisez un{" "}
            <strong>programme d'hygiène de vie</strong>.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Comment ça marche ?</p>
            <ul>
              <li><strong>Cherchez</strong> une solution par nom, propriété ou précaution, avec ou sans accents, ou choisissez une catégorie.</li>
              <li><strong>Cliquez sur une ligne</strong> pour déplier la fiche complète.</li>
              <li><strong>Cliente concernée</strong> : cochez grossesse, anticoagulants… pour masquer les fiches contre-indiquées.</li>
              <li><strong>Dupliquez une fiche de base</strong> pour l'adapter, ou ajoutez la vôtre (l'IA peut la pré-remplir).</li>
              <li>Depuis un <strong>programme</strong>, bouton « Piocher dans la base » : les traitements de la cliente sont croisés avec les précautions.</li>
            </ul>
          </div>
          <HelpWarn>Information d'hygiène de vie à visée naturopathique : ne remplace pas un avis médical.
            Une fiche sans précaution signalée n'est pas pour autant sans risque : vérifiez toujours le terrain
            et les traitements avant tout conseil.</HelpWarn>
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
          {[["all", "Toutes", totalInTabs] as const, ...categories.map((c) => [c, SOLUTION_CATEGORY_PLURALS[c] || c, counts[c] || 0] as const)].map(([value, label, n]) => {
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

        {/* Cliente concernée : masque les fiches contre-indiquées */}
        <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
          <span className="font-bold text-muted-foreground uppercase tracking-wide">Cliente concernée :</span>
          {SAFETY_CRITERIA.map(({ key, label }) => {
            const active = profile.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleProfile(key)}
                className={`px-2.5 py-1 rounded-sm border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "bg-amber-100 text-amber-900 border-amber-300" : "border-input hover:bg-secondary"
                }`}
                data-testid={`chip-profile-${key}`}
              >
                {label}
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
        {profile.length > 0 && (
          <p className="text-xs text-muted-foreground mb-4" data-testid="text-profile-note">
            {hiddenByProfile > 0
              ? `${hiddenByProfile} fiche${hiddenByProfile > 1 ? "s" : ""} contre-indiquée${hiddenByProfile > 1 ? "s" : ""} masquée${hiddenByProfile > 1 ? "s" : ""}. `
              : "Aucune fiche contre-indiquée dans cette sélection. "}
            Les fiches à prudence restent visibles et sont signalées.
          </p>
        )}
        {profile.length === 0 && <div className="mb-4" />}

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
              {filtered.map((s) => {
                const open = expanded.has(s.id);
                const safety = parseSafety(s.safety);
                const alerts = safetyAlerts(safety, profile);
                const synergies = parseList(s.synergies);
                const hasPrecautions = !!s.contraindications || Object.keys(safety).length > 0;
                return (
                  <li key={s.id} data-testid={`solution-${s.id}`}>
                    <button
                      type="button"
                      onClick={() => toggle(s.id)}
                      aria-expanded={open}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${open ? "bg-secondary/60" : "hover:bg-secondary/60"}`}
                      data-testid={`button-open-solution-${s.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{s.name}</span>
                          <CategoryBadge category={s.category} />
                          {s.userId !== null && <Badge variant="secondary" className="rounded-sm text-xs font-medium">Ma fiche</Badge>}
                        </div>
                        {!open && s.properties && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{s.properties}</p>}
                      </div>
                      {alerts.length > 0 ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5" data-testid={`badge-prudence-${s.id}`}>
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Prudence : {alerts.map((a) => SAFETY_LABELS[a.key]).join(", ")}</span>
                        </span>
                      ) : hasPrecautions && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Précautions</span>
                        </span>
                      )}
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>

                    {open && (
                      <div className="px-4 pb-4 pt-1 space-y-3 text-sm bg-secondary/30" data-testid={`detail-solution-${s.id}`}>
                        {s.properties && <div><h4 className="text-primary mb-0.5">Propriétés</h4><p>{s.properties}</p></div>}
                        {s.usageNotes && <div><h4 className="mb-0.5">Conseils d'usage</h4><p className="text-muted-foreground">{s.usageNotes}</p></div>}
                        {(s.form || s.cureDuration) && (
                          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                            {s.form && <div><dt className="text-xs font-semibold text-muted-foreground">Forme</dt><dd>{s.form}</dd></div>}
                            {s.cureDuration && <div><dt className="text-xs font-semibold text-muted-foreground">Durée de cure</dt><dd>{s.cureDuration}</dd></div>}
                          </dl>
                        )}
                        {synergies.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-muted-foreground">Synergies :</span>
                            {synergies.map((n) => byName.has(n) ? (
                              <button key={n} type="button" onClick={() => showSolution(n)} className="text-xs font-semibold text-primary border border-primary/30 rounded-sm px-1.5 py-0.5 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {n}
                              </button>
                            ) : (
                              <span key={n} className="text-xs border rounded-sm px-1.5 py-0.5">{n}</span>
                            ))}
                          </div>
                        )}
                        {hasPrecautions && (
                          <div className="space-y-2 border border-amber-200 bg-amber-50/60 rounded-md px-3 py-2">
                            <h4 className="flex items-center gap-1.5 text-amber-900"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Précautions</h4>
                            <SafetyChips safety={safety} />
                            {s.contraindications && <p className="text-amber-900">{s.contraindications}</p>}
                          </div>
                        )}
                        {s.sources && <p className="text-xs text-muted-foreground"><span className="font-semibold">Sources :</span> {s.sources}</p>}
                        <div className="flex flex-wrap justify-end gap-2 pt-1">
                          {s.userId !== null ? (
                            <>
                              <Button variant="outline" size="sm" className="text-destructive" onClick={() => remove(s)} data-testid={`button-delete-solution-${s.id}`}>
                                <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                              </Button>
                              <Button size="sm" onClick={() => setEditing({ id: s.id, title: "Modifier la solution", init: draftOf(s) })} data-testid={`button-edit-solution-${s.id}`}>
                                <Pencil className="h-4 w-4 mr-1" /> Modifier
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing({ id: null, title: "Dupliquer la fiche", init: { ...draftOf(s), name: `${s.name} (ma version)` } })}
                              data-testid={`button-duplicate-solution-${s.id}`}
                            >
                              <Copy className="h-4 w-4 mr-1" /> Dupliquer pour l'adapter
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {editing !== null && (
        <SolutionEditor editing={editing} onClose={() => setEditing(null)} />
      )}
    </AppLayout>
  );
}

function SolutionEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(editing.init);
  const [aiFilled, setAiFilled] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setLevel = (k: SafetyKey, v: string) =>
    setD((p) => {
      const safety = { ...p.safety };
      if (v === "ci" || v === "prudence") safety[k] = v; else delete safety[k];
      return { ...p, safety };
    });

  const aiMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/solutions/ai-draft", { name: d.name, category: d.category })).json(),
    onSuccess: (r: { properties: string; usageNotes: string; contraindications: string; form: string; cureDuration: string; safety: Safety }) => {
      setD((p) => ({
        ...p,
        properties: r.properties || p.properties,
        usageNotes: r.usageNotes || p.usageNotes,
        contraindications: r.contraindications || p.contraindications,
        form: r.form || p.form,
        cureDuration: r.cureDuration || p.cureDuration,
        safety: { ...p.safety, ...r.safety },
      }));
      setAiFilled(true);
    },
    onError: (e: any) => toast({ title: "Pré-remplissage impossible", description: e.message, variant: "destructive" }),
  });

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        name: d.name.trim(),
        category: d.category,
        properties: d.properties || null,
        contraindications: d.contraindications || null,
        usageNotes: d.usageNotes || null,
        form: d.form || null,
        cureDuration: d.cureDuration || null,
        sources: d.sources || null,
        synergies: d.synergies.split(",").map((x) => x.trim()).filter(Boolean),
        safety: d.safety,
      };
      if (editing.id === null) await apiRequest("POST", "/api/solutions", body);
      else await apiRequest("PATCH", `/api/solutions/${editing.id}`, body);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/solutions"] }); toast({ title: "Solution enregistrée", variant: "success" }); onClose(); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing.title}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid sm:grid-cols-[1fr_14rem] gap-3">
            <div><Label>Nom</Label><Input value={d.name} onChange={(e) => set("name", e.target.value)} data-testid="input-solution-name" /></div>
            <div>
              <Label>Catégorie</Label>
              <Select value={d.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger data-testid="select-solution-category"><SelectValue /></SelectTrigger>
                <SelectContent>{SOLUTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => aiMut.mutate()}
              disabled={d.name.trim().length < 2 || aiMut.isPending}
              data-testid="button-ai-draft-solution"
            >
              {aiMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {aiMut.isPending ? "Proposition en cours…" : "Pré-remplir avec l'IA"}
            </Button>
            <span className="text-xs text-muted-foreground">À partir du nom et de la catégorie.</span>
          </div>
          {aiFilled && (
            <p className="flex gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5" data-testid="text-ai-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
              Proposition générée par IA : relisez et corrigez chaque champ, précautions comprises, avant d'enregistrer.
            </p>
          )}

          <div><Label>Propriétés / indications</Label><Textarea rows={3} value={d.properties} onChange={(e) => set("properties", e.target.value)} /></div>
          <div><Label>Conseils d'usage et posologie</Label><Textarea rows={3} value={d.usageNotes} onChange={(e) => set("usageNotes", e.target.value)} /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Forme</Label><Input value={d.form} onChange={(e) => set("form", e.target.value)} placeholder="Infusion, gélule…" /></div>
            <div><Label>Durée de cure</Label><Input value={d.cureDuration} onChange={(e) => set("cureDuration", e.target.value)} placeholder="Cure de 3 semaines" /></div>
          </div>
          <div><Label>Précautions / contre-indications</Label><Textarea rows={3} value={d.contraindications} onChange={(e) => set("contraindications", e.target.value)} /></div>

          <fieldset className="border rounded-md p-3">
            <legend className="px-1 text-sm font-semibold">Précautions par profil</legend>
            <p className="text-xs text-muted-foreground mb-2">Servent au filtre « Cliente concernée » et aux alertes des programmes.</p>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              {SAFETY_CRITERIA.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{label}</span>
                  <Select value={d.safety[key] ?? "none"} onValueChange={(v) => setLevel(key, v)}>
                    <SelectTrigger className="w-40 h-8" data-testid={`select-safety-${key}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Rien de signalé</SelectItem>
                      <SelectItem value="prudence">Prudence</SelectItem>
                      <SelectItem value="ci">Contre-indiqué</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </fieldset>

          <div><Label>Synergies (noms de fiches, séparés par des virgules)</Label><Input value={d.synergies} onChange={(e) => set("synergies", e.target.value)} /></div>
          <div><Label>Sources</Label><Textarea rows={2} value={d.sources} onChange={(e) => set("sources", e.target.value)} placeholder="Ouvrage, monographie, formation…" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={!d.name.trim() || mut.isPending} className="font-bold" data-testid="button-save-solution">
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
