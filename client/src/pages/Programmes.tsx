/**
 * client/src/pages/Programmes.tsx — Programmes d'hygiène de vie
 *
 * Liste des programmes avec builder : titre, sections (ex. Alimentation, Phytothérapie,
 * Activité physique…) contenant des items texte libres, lien client optionnel, statut
 * brouillon/envoyé, et téléchargement PDF.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, FileText, Download, X, Leaf } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Client, NaturalSolution } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProgramSection {
  section: string;
  items: string[];
}

interface Program {
  id: number;
  userId: number;
  clientId: number | null;
  appointmentId: number | null;
  title: string;
  content: string; // JSON stringifié
  status: "draft" | "sent";
  createdAt: number;
  updatedAt: number;
}

function parseSections(raw: string): ProgramSection[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return parsed as ProgramSection[];
  } catch { /* ignore */ }
  return [];
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Éditeur de programme ──────────────────────────────────────────────────────

interface ProgramEditorProps {
  initial?: Program | null;
  clients: Client[];
  onClose: () => void;
}

// Palette de pastels (classes Tailwind complètes pour la détection au build).
// On cycle dessus pour distinguer visuellement sections et conseils.
const PASTELS = [
  "bg-rose-50 border-rose-200",
  "bg-amber-50 border-amber-200",
  "bg-sky-50 border-sky-200",
  "bg-violet-50 border-violet-200",
  "bg-emerald-50 border-emerald-200",
  "bg-orange-50 border-orange-200",
];
// 4 sections pré-remplies avec des exemples de conseils (modifiables/supprimables)
// pour ne pas partir d'une feuille blanche. Conseils succincts (≤ 3 phrases),
// inspirés des programmes d'hygiène de vie naturopathiques courants.
function defaultSections(): ProgramSection[] {
  return [
    { section: "Alimentation", items: [
      "Privilégiez une assiette riche en légumes (crus et cuits) à chaque repas et réduisez les sucres raffinés et les produits ultra-transformés.",
      "Intégrez de bonnes graisses, notamment des oméga-3 (poissons gras, huiles de colza et de lin, noix).",
      "Mangez dans le calme, en mâchant lentement et à horaires réguliers, pour soutenir la digestion.",
    ] },
    { section: "Phytothérapie", items: [
      "En soirée, une infusion de camomille ou de mélisse aide à apaiser le système nerveux et à faciliter la digestion.",
      "Les plantes de soutien s'utilisent en cure progressive de 2 à 3 semaines.",
      "À adapter au terrain : demandez conseil en cas de grossesse, d'allaitement ou de traitement médicamenteux.",
    ] },
    { section: "Activité physique", items: [
      "Visez 20 à 30 minutes de marche par jour, idéalement à l'extérieur et à la lumière naturelle.",
      "Ajoutez 1 à 2 séances douces par semaine (yoga, étirements, renforcement léger) selon vos capacités.",
      "Bougez régulièrement dans la journée plutôt que de façon intense et ponctuelle.",
    ] },
    { section: "Gestion du stress", items: [
      "Accordez-vous 10 à 20 minutes par jour de pratique apaisante : cohérence cardiaque, respiration, méditation ou sophrologie.",
      "Préservez votre sommeil : couchez-vous avant 23h et éteignez les écrans au moins 1h avant.",
      "Identifiez les sources de stress évitables et limitez-les progressivement.",
    ] },
  ];
}

function ProgramEditor({ initial, clients, onClose }: ProgramEditorProps) {
  const { toast } = useToast();
  const isNew = !initial;

  const [title, setTitle] = useState(initial?.title ?? "Programme d'hygiène de vie");
  const [clientId, setClientId] = useState<string>(initial?.clientId ? String(initial.clientId) : "none");
  const [status, setStatus] = useState<"draft" | "sent">(initial?.status ?? "draft");
  const [sections, setSections] = useState<ProgramSection[]>(
    initial ? parseSections(initial.content) : defaultSections(),
  );
  // Picker « base de solutions »
  const { data: solutions = [] } = useQuery<NaturalSolution[]>({ queryKey: ["/api/solutions"] });
  const [pickerSection, setPickerSection] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  function insertSolution(sectionIdx: number, sol: NaturalSolution) {
    const text = sol.usageNotes ? `${sol.name} : ${sol.usageNotes}` : sol.name;
    setSections(s => s.map((sec, i) =>
      i === sectionIdx ? { ...sec, items: [...sec.items.filter(it => it.trim()), text] } : sec,
    ));
    setPickerSection(null);
    setPickerSearch("");
  }

  // Gestionnaire de sections
  function addSection() {
    setSections(s => [...s, { section: "", items: [""] }]);
  }
  function removeSection(idx: number) {
    setSections(s => s.filter((_, i) => i !== idx));
  }
  function updateSectionTitle(idx: number, value: string) {
    setSections(s => s.map((sec, i) => i === idx ? { ...sec, section: value } : sec));
  }
  function addItem(sectionIdx: number) {
    setSections(s => s.map((sec, i) =>
      i === sectionIdx ? { ...sec, items: [...sec.items, ""] } : sec,
    ));
  }
  function removeItem(sectionIdx: number, itemIdx: number) {
    setSections(s => s.map((sec, i) =>
      i === sectionIdx ? { ...sec, items: sec.items.filter((_, j) => j !== itemIdx) } : sec,
    ));
  }
  function updateItem(sectionIdx: number, itemIdx: number, value: string) {
    setSections(s => s.map((sec, i) =>
      i === sectionIdx
        ? { ...sec, items: sec.items.map((it, j) => j === itemIdx ? value : it) }
        : sec,
    ));
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim(),
        clientId: clientId !== "none" ? Number(clientId) : null,
        status,
        content: sections.filter(s => s.section.trim()),
      };
      if (isNew) {
        return apiRequest("POST", "/api/programmes", body);
      }
      return apiRequest("PATCH", `/api/programmes/${initial!.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      toast({ title: isNew ? "Programme créé" : "Programme mis à jour", variant: "success" });
      onClose();
    },
    onError: () => toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" }),
  });

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto space-y-5 px-6 py-4">
      {/* Titre */}
      <div className="space-y-1.5">
        <Label htmlFor="prog-title">Titre du programme</Label>
        <Input
          id="prog-title"
          placeholder="ex. Programme personnalisé Alimentation & Phytothérapie"
          value={title}
          onChange={e => setTitle(e.target.value)}
          data-testid="input-title-programme"
        />
      </div>

      {/* Client */}
      <div className="space-y-1.5">
        <Label>Cliente (optionnel)</Label>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger data-testid="select-client-programme">
            <SelectValue placeholder="Aucune cliente sélectionnée" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Aucune cliente —</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.firstName} {c.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Statut */}
      <div className="space-y-1.5">
        <Label>Statut</Label>
        <Select value={status} onValueChange={v => setStatus(v as "draft" | "sent")}>
          <SelectTrigger data-testid="select-status-programme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="sent">Envoyé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Sections du programme</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSection}
            data-testid="button-add-section"
            className="rounded-[12px]"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une section
          </Button>
        </div>

        {sections.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucune section. Cliquez sur « Ajouter une section » pour commencer.
          </p>
        )}

        {sections.map((sec, sIdx) => (
          <div key={sIdx} className={`border rounded-[12px] p-4 space-y-3 ${PASTELS[sIdx % PASTELS.length]}`}>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nom de la section (ex. Alimentation, Phytothérapie…)"
                value={sec.section}
                onChange={e => updateSectionTitle(sIdx, e.target.value)}
                className="font-semibold"
                data-testid={`input-section-title-${sIdx}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSection(sIdx)}
                data-testid={`button-remove-section-${sIdx}`}
                aria-label="Supprimer la section"
                className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2 pl-2">
              {sec.items.map((item, iIdx) => (
                <div key={iIdx} className="flex items-start gap-2">
                  <Textarea
                    placeholder="Conseil ou recommandation…"
                    value={item}
                    onChange={e => updateItem(sIdx, iIdx, e.target.value)}
                    rows={2}
                    className={`resize-none text-sm border ${PASTELS[iIdx % PASTELS.length]}`}
                    data-testid={`input-item-${sIdx}-${iIdx}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(sIdx, iIdx)}
                    data-testid={`button-remove-item-${sIdx}-${iIdx}`}
                    aria-label="Supprimer le conseil"
                    className="h-10 w-10 shrink-0 mt-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addItem(sIdx)}
                  data-testid={`button-add-item-${sIdx}`}
                  className="text-primary hover:text-primary/80 px-2"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un conseil
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPickerSection(sIdx); setPickerSearch(""); }}
                  data-testid={`button-pick-solution-${sIdx}`}
                  className="text-primary hover:text-primary/80 px-2"
                >
                  <Leaf className="h-3.5 w-3.5 mr-1" /> Piocher dans la base
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      </div>

      {/* Actions — pied de page collant, toujours visible */}
      <div className="shrink-0 flex justify-end gap-2 border-t px-6 py-3 bg-background">
        <Button type="button" variant="outline" onClick={onClose} className="rounded-[12px]">
          Annuler
        </Button>
        <Button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={!title.trim() || saveMut.isPending}
          className="rounded-[15px] font-bold"
          data-testid="button-save-programme"
        >
          {saveMut.isPending ? "Enregistrement…" : isNew ? "Créer le programme" : "Enregistrer"}
        </Button>
      </div>

      {/* Picker : base de solutions naturelles */}
      <Dialog open={pickerSection !== null} onOpenChange={(o) => { if (!o) setPickerSection(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle>Piocher dans la base de solutions</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-3 shrink-0">
            <Input
              placeholder="Rechercher (nom, propriété, catégorie)…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              data-testid="input-picker-search"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-2">
            {solutions
              .filter((s) => {
                const q = pickerSearch.trim().toLowerCase();
                return !q || s.name.toLowerCase().includes(q) || (s.properties || "").toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
              })
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickerSection !== null && insertSolution(pickerSection, s)}
                  className="w-full text-left border rounded-[10px] p-3 hover:border-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  data-testid={`picker-solution-${s.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground border rounded px-1 py-0.5">{s.category}</span>
                  </div>
                  {s.properties && <p className="text-xs text-muted-foreground mt-1">{s.properties}</p>}
                </button>
              ))}
            {solutions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune solution dans la base pour le moment.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ProgrammesPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Program | "new" | null>(null);

  const { data: programmes = [], isLoading } = useQuery<Program[]>({
    queryKey: ["/api/programmes"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/programmes/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/programmes"] });
      const prev = queryClient.getQueryData(["/api/programmes"]);
      queryClient.setQueryData(["/api/programmes"], (old: any) =>
        (old ?? []).filter((it: any) => it.id !== id),
      );
      return { prev };
    },
    onSuccess: () => {
      toast({ title: "Programme supprimé", variant: "success" });
    },
    onError: (_e, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/programmes"], ctx.prev);
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/programmes"] }),
  });

  function clientName(clientId: number | null): string {
    if (!clientId) return "";
    const c = clients.find(cl => cl.id === clientId);
    return c ? `${c.firstName} ${c.lastName}` : "";
  }

  function downloadPdf(prog: Program) {
    const a = document.createElement("a");
    a.href = `/api/programmes/${prog.id}/pdf`;
    a.download = `${prog.title.replace(/[^a-zA-Z0-9_\- ]/g, "_").slice(0, 60)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <PageHeader
          title="Programmes"
          subtitle="Vos programmes d'hygiène de vie personnalisés."
          icon={FileText}
          actions={
            <Button
              onClick={() => setEditing("new")}
              className="rounded-[15px] font-bold"
              data-testid="button-new-programme"
            >
              <Plus className="h-4 w-4 mr-1" /> Nouveau programme
            </Button>
          }
        />

        <HelpNote>
          <p>
            Un <strong>programme d'hygiène de vie</strong> est un protocole personnalisé que vous
            construisez pour une cliente à l'issue d'une consultation. Il regroupe vos conseils
            sous forme de <strong>sections thématiques</strong> (ex. Alimentation, Phytothérapie,
            Activité physique, Gestion du stress…), chaque section contenant les recommandations
            précises que vous souhaitez lui transmettre.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-1">Comment ça marche ?</p>
            <ol>
              <li>Cliquez sur <strong>« Nouveau programme »</strong> et saisissez le titre.</li>
              <li>Ajoutez autant de <strong>sections</strong> que nécessaire (Alimentation, Phytothérapie, etc.).</li>
              <li>Dans chaque section, ajoutez vos <strong>conseils</strong> ligne par ligne.</li>
              <li>Liez le programme à une cliente (optionnel) et passez-le en <strong>« Envoyé »</strong> une fois remis.</li>
              <li>Cliquez sur <strong>Télécharger le PDF</strong> pour obtenir un document professionnel à remettre à votre cliente.</li>
            </ol>
          </div>
        </HelpNote>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : programmes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun programme"
            description="Créez votre premier programme d'hygiène de vie."
            action={
              <Button
                onClick={() => setEditing("new")}
                className="rounded-[15px] font-bold"
                data-testid="button-new-programme-empty"
              >
                <Plus className="h-4 w-4 mr-1" /> Créer un programme
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {programmes.map(prog => {
              const sections = parseSections(prog.content);
              const cn = clientName(prog.clientId);
              return (
                <div key={prog.id} className="card-naturo p-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-bold text-base truncate text-heading"
                        data-testid={`text-title-${prog.id}`}
                      >
                        {prog.title}
                      </span>
                      <StatusBadge domain="program" status={prog.status} />
                    </div>
                    {cn && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Cliente : <strong className="text-foreground">{cn}</strong>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {sections.length} section{sections.length !== 1 ? "s" : ""} · Créé le {formatDate(prog.createdAt)}
                    </p>
                    {sections.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sections.map((s, i) => (
                          <span key={i} className="text-xs bg-primary/10 text-primary rounded-full px-2.5 py-0.5 font-medium">
                            {s.section}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPdf(prog)}
                      className="rounded-[12px] gap-1"
                      data-testid={`button-pdf-${prog.id}`}
                      title="Télécharger le PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">PDF</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(prog)}
                      className="rounded-[12px]"
                      data-testid={`button-edit-${prog.id}`}
                      title="Modifier"
                      aria-label="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!(await confirm({
                          title: "Supprimer ce programme ?",
                          description: "Cette action est définitive et le programme ne pourra pas être récupéré.",
                          confirmLabel: "Supprimer",
                          cancelLabel: "Annuler",
                          destructive: true,
                        }))) return;
                        deleteMut.mutate(prog.id);
                      }}
                      className="rounded-[12px] text-destructive hover:text-destructive"
                      data-testid={`button-delete-${prog.id}`}
                      title="Supprimer"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog éditeur */}
      <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle>
              {editing === "new" ? "Nouveau programme" : "Modifier le programme"}
            </DialogTitle>
          </DialogHeader>
          {editing !== null && (
            <ProgramEditor
              initial={editing === "new" ? null : editing}
              clients={clients}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
