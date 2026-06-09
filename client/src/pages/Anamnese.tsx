/**
 * Anamnese.tsx — Gestion des questionnaires d'intake (anamnèse)
 * Route : /#/app/anamnese (ProtectedRoute)
 *
 * Fonctionnalités :
 * - Liste des modèles de questionnaires
 * - Builder : ajouter / modifier / supprimer des questions (choix du type, options)
 * - Génération d'un lien de partage à envoyer à une cliente
 * - Liste des réponses reçues avec affichage
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, ClipboardList, Link2, ChevronDown, ChevronUp,
  Eye, Check, GripVertical,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AnamnesisTemplate, AnamnesisResponse } from "@shared/schema";

// ─── Types locaux ─────────────────────────────────────────────────────────────

type QuestionType = "text" | "textarea" | "choice" | "multi" | "scale";

interface Question {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
}

function parseQuestions(raw: string | null | undefined): Question[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function parseAnswers(raw: string | null | undefined): Record<string, string | string[] | number> {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// Palette de pastels (classes Tailwind complètes pour la détection au build).
// Cyclée pour distinguer visuellement chaque question et chaque réponse possible.
const PASTELS = [
  "bg-rose-50 border-rose-200",
  "bg-amber-50 border-amber-200",
  "bg-sky-50 border-sky-200",
  "bg-violet-50 border-violet-200",
  "bg-emerald-50 border-emerald-200",
  "bg-orange-50 border-orange-200",
];

function newQuestion(): Question {
  return { id: crypto.randomUUID(), label: "", type: "text", required: false };
}

// 5 questions d'anamnèse pré-remplies (modifiables/supprimables) pour ne pas
// partir d'une feuille blanche. Couvre les piliers d'un bilan de vitalité :
// motif, antécédents, alimentation/digestion, sommeil/énergie, stress/hygiène de vie.
function defaultQuestions(): Question[] {
  const labels = [
    "Quel est le motif principal de votre consultation et quels sont vos objectifs de santé ?",
    "Quels sont vos antécédents médicaux personnels et familiaux ? Suivez-vous un traitement ou prenez-vous des compléments actuellement ?",
    "Décrivez une journée alimentaire type (repas, boissons, grignotages). Comment se passent votre digestion et votre transit (ballonnements, lourdeurs, régularité) ?",
    "Comment qualifieriez-vous votre sommeil (durée, endormissement, réveils nocturnes) et votre niveau d'énergie au cours de la journée ?",
    "Comment évaluez-vous votre niveau de stress et votre gestion des émotions ? Quelle est votre activité physique, et votre consommation de tabac, d'alcool ou d'excitants ?",
  ];
  return labels.map((label, i) => ({
    id: crypto.randomUUID(),
    label,
    type: "textarea" as QuestionType,
    required: i === 0,
  }));
}

const TYPE_LABELS: Record<QuestionType, string> = {
  text: "Texte court",
  textarea: "Texte long",
  choice: "Choix unique",
  multi: "Choix multiple",
  scale: "Échelle (1–10)",
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AnamnesePage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editingTpl, setEditingTpl] = useState<AnamnesisTemplate | "new" | null>(null);
  const [viewingResp, setViewingResp] = useState<AnamnesisResponse | null>(null);
  const [shareTplId, setShareTplId] = useState<number | null>(null);

  const { data: templates = [] } = useQuery<AnamnesisTemplate[]>({
    queryKey: ["/api/anamnesis-templates"],
    queryFn: () => apiRequest("GET", "/api/anamnesis-templates").then(r => r.json()),
  });

  const { data: responses = [] } = useQuery<AnamnesisResponse[]>({
    queryKey: ["/api/anamnesis-responses"],
    queryFn: () => apiRequest("GET", "/api/anamnesis-responses").then(r => r.json()),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/anamnesis-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis-templates"] });
      toast({ title: "Modèle supprimé", variant: "success" });
    },
  });

  // ── Templates list ──────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-4xl">
        <PageHeader
          title="Anamnèses"
          subtitle="Vos questionnaires de bilan à envoyer aux clients."
          icon={ClipboardList}
          actions={
            <Button
              onClick={() => setEditingTpl("new")}
              className="rounded-[15px] font-bold"
              data-testid="button-new-template"
            >
              <Plus className="h-4 w-4 mr-1" /> Nouveau modèle
            </Button>
          }
        />

        <HelpNote>
          <p>
            L'anamnèse est le <strong>questionnaire de santé initial</strong> que vous faites remplir
            à votre cliente <strong>avant la première consultation</strong>. Elle vous permet de mieux
            préparer la séance et de gagner du temps sur place.
          </p>
          <p>
            Avec Naturo Pro, vous créez un <strong>modèle de questionnaire</strong> une fois, puis
            vous générez un <strong>lien personnalisé</strong> à envoyer à chaque cliente par email ou SMS.
            La cliente remplit le formulaire depuis son téléphone ou ordinateur, et vous retrouvez ses
            réponses ici.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Comment ça marche ?</p>
            <ol>
              <li>Créez un <strong>modèle</strong> avec vos questions habituelles.</li>
              <li>Cliquez sur <strong>« Créer un lien »</strong> pour générer un lien unique.</li>
              <li>Copiez et envoyez ce lien à votre cliente (email, SMS…).</li>
              <li>Consultez ses réponses dans la section <strong>« Réponses reçues »</strong> ci-dessous.</li>
            </ol>
          </div>
        </HelpNote>

        {/* Liste des modèles */}
        {templates.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Aucun modèle de questionnaire"
            description="Créez votre premier modèle pour commencer à envoyer des anamnèses à vos clientes."
          />
        ) : (
          <ul className="space-y-3 mb-10">
            {templates.map(tpl => {
              const questions = parseQuestions(tpl.questions);
              return (
                <li key={tpl.id} className="card-naturo" data-testid={`template-${tpl.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-extrabold truncate">{tpl.name}</h3>
                        {tpl.isActive
                          ? <Badge className="bg-accent/30 text-primary border-0 text-xs">Actif</Badge>
                          : <Badge variant="secondary" className="text-xs">Inactif</Badge>}
                      </div>
                      {tpl.description && (
                        <p className="text-sm text-muted-foreground mb-2">{tpl.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {questions.length} question{questions.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                        onClick={() => setShareTplId(tpl.id)}
                        title="Créer un lien de partage"
                        data-testid={`button-share-${tpl.id}`}
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                        onClick={() => setEditingTpl(tpl)}
                        data-testid={`button-edit-${tpl.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                        onClick={async () => {
                          if (!(await confirm({
                            title: "Supprimer ce modèle ?",
                            description: "Le questionnaire et sa configuration seront définitivement supprimés. Cette action est irréversible.",
                            confirmLabel: "Supprimer",
                            cancelLabel: "Annuler",
                            destructive: true,
                          }))) return;
                          delMut.mutate(tpl.id);
                        }}
                        data-testid={`button-delete-${tpl.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Réponses reçues */}
        <div className="mt-8">
          <h2 className="text-xl font-extrabold mb-4" style={{ color: "#1b4332" }}>Réponses reçues</h2>
          {responses.length === 0 ? (
            <div className="card-naturo text-center py-10">
              <p className="text-sm text-muted-foreground">
                Aucune réponse pour l'instant. Envoyez un lien à une cliente pour commencer.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {responses.map(resp => {
                const tpl = templates.find(t => t.id === resp.templateId);
                return (
                  <li key={resp.id} className="card-naturo flex items-center justify-between gap-3" data-testid={`response-${resp.id}`}>
                    <div>
                      <p className="font-semibold text-sm">{tpl?.name ?? "Questionnaire"}</p>
                      <p className="text-xs text-muted-foreground">
                        {resp.submittedAt
                          ? `Soumis le ${new Date(resp.submittedAt).toLocaleDateString("fr-FR")}`
                          : "En attente de réponse"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {resp.submittedAt
                        ? <Badge className="bg-accent/30 text-primary border-0 text-xs"><Check className="h-3 w-3 mr-1" />Reçu</Badge>
                        : <Badge variant="secondary" className="text-xs">En attente</Badge>}
                      {resp.submittedAt && (
                        <button
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                          onClick={() => setViewingResp(resp)}
                          data-testid={`button-view-${resp.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <TemplateDialog
        open={!!editingTpl}
        editing={editingTpl}
        onClose={() => setEditingTpl(null)}
      />
      <ShareDialog
        open={shareTplId !== null}
        templateId={shareTplId}
        onClose={() => setShareTplId(null)}
      />
      <ResponseViewDialog
        open={!!viewingResp}
        response={viewingResp}
        templates={templates}
        onClose={() => setViewingResp(null)}
      />
    </AppLayout>
  );
}

// ─── Dialog : builder de questionnaire ───────────────────────────────────────

function TemplateDialog({ open, editing, onClose }: {
  open: boolean;
  editing: AnamnesisTemplate | "new" | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (open && !initialized) {
    if (editing === "new") {
      setName("Anamnèse — première consultation");
      setDescription("Questionnaire à remplir avant le premier rendez-vous.");
      setQuestions(defaultQuestions());
    } else if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setQuestions(parseQuestions(editing.questions));
    }
    setInitialized(true);
  }
  if (!open && initialized) setInitialized(false);

  const mut = useMutation({
    mutationFn: async () => {
      const body = { name, description: description || null, questions };
      if (editing === "new") {
        await apiRequest("POST", "/api/anamnesis-templates", body);
      } else if (editing) {
        await apiRequest("PATCH", `/api/anamnesis-templates/${editing.id}`, body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis-templates"] });
      toast({ title: "Modèle enregistré", variant: "success" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function addQuestion() {
    setQuestions(qs => [...qs, newQuestion()]);
  }

  function updateQuestion(idx: number, patch: Partial<Question>) {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  }

  function removeQuestion(idx: number) {
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    setQuestions(qs => {
      const next = [...qs];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return qs;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Nouveau modèle de questionnaire" : "Modifier le questionnaire"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Nom du modèle</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex : Anamnèse initiale naturopathie"
              data-testid="input-template-name"
            />
          </div>
          <div>
            <Label>Description (optionnelle)</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex : Questionnaire envoyé avant la première consultation"
              data-testid="input-template-description"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">Questions ({questions.length})</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addQuestion}
                className="rounded-[12px] font-semibold"
                data-testid="button-add-question"
              >
                <Plus className="h-4 w-4 mr-1" /> Ajouter une question
              </Button>
            </div>

            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-[12px]">
                Aucune question pour l'instant. Cliquez sur « Ajouter une question » pour commencer.
              </p>
            )}

            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionEditor
                  key={q.id}
                  question={q}
                  index={idx}
                  total={questions.length}
                  onChange={patch => updateQuestion(idx, patch)}
                  onRemove={() => removeQuestion(idx)}
                  onMove={dir => moveQuestion(idx, dir)}
                />
              ))}
            </div>
          </div>

          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !name.trim()}
            className="w-full rounded-[15px] py-5 font-bold"
            data-testid="button-save-template"
          >
            {mut.isPending ? "Enregistrement…" : "Enregistrer le modèle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Éditeur d'une question ───────────────────────────────────────────────────

function QuestionEditor({ question, index, total, onChange, onRemove, onMove }: {
  question: Question;
  index: number;
  total: number;
  onChange: (patch: Partial<Question>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const needsOptions = question.type === "choice" || question.type === "multi";
  const [optionInput, setOptionInput] = useState("");

  function addOption() {
    const val = optionInput.trim();
    if (!val) return;
    onChange({ options: [...(question.options ?? []), val] });
    setOptionInput("");
  }

  function removeOption(i: number) {
    onChange({ options: (question.options ?? []).filter((_, idx) => idx !== i) });
  }

  return (
    <div className={`border rounded-[12px] p-4 space-y-3 ${PASTELS[index % PASTELS.length]}`} data-testid={`question-${index}`}>
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1 mt-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-0.5 rounded hover:bg-secondary disabled:opacity-30"
            data-testid={`button-move-up-${index}`}
          >
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-0.5 rounded hover:bg-secondary disabled:opacity-30"
            data-testid={`button-move-down-${index}`}
          >
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 space-y-2">
          <Textarea
            className="w-full resize-y min-h-[3.5rem]"
            rows={2}
            placeholder={`Question ${index + 1}`}
            value={question.label}
            onChange={e => onChange({ label: e.target.value })}
            data-testid={`input-question-label-${index}`}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Type de réponse :</span>
            <Select value={question.type} onValueChange={v => onChange({ type: v as QuestionType, options: undefined })}>
              <SelectTrigger className="w-44" data-testid={`select-question-type-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TYPE_LABELS) as [QuestionType, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsOptions && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {(question.options ?? []).map((opt, i) => (
                  <span key={i} className={`inline-flex items-center gap-1 border text-sm px-2 py-0.5 rounded-full ${PASTELS[i % PASTELS.length]}`}>
                    {opt}
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Ajouter une option…"
                  value={optionInput}
                  onChange={e => setOptionInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                  data-testid={`input-option-${index}`}
                />
                <Button type="button" size="sm" variant="outline" onClick={addOption}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`req-${question.id}`}
              checked={!!question.required}
              onChange={e => onChange({ required: e.target.checked })}
              className="accent-primary"
              data-testid={`checkbox-required-${index}`}
            />
            <label htmlFor={`req-${question.id}`} className="text-xs text-muted-foreground">Réponse obligatoire</label>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive shrink-0"
          data-testid={`button-remove-question-${index}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Dialog : partage d'un lien ───────────────────────────────────────────────

function ShareDialog({ open, templateId, onClose }: {
  open: boolean;
  templateId: number | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  if (!open && generated) { setGenerated(false); setLink(null); }

  const genMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/anamnesis-responses", { templateId });
      return r.json();
    },
    onSuccess: (data: any) => {
      setLink(data.link);
      setGenerated(true);
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis-responses"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast({ title: "Lien copié !" });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Générer un lien de questionnaire</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!link ? (
            <>
              <p className="text-sm text-muted-foreground">
                Cliquez sur le bouton ci-dessous pour générer un lien unique à envoyer à votre cliente.
                Elle pourra remplir le questionnaire depuis n'importe quel appareil.
              </p>
              <Button
                onClick={() => genMut.mutate()}
                disabled={genMut.isPending}
                className="w-full rounded-[15px] py-5 font-bold"
                data-testid="button-generate-link"
              >
                {genMut.isPending ? "Génération…" : "Générer le lien"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Voici le lien à envoyer à votre cliente (par email ou SMS). Ce lien est <strong>à usage unique</strong> :
                une fois le questionnaire soumis, il ne peut plus être modifié.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={link} className="text-xs font-mono" data-testid="input-generated-link" />
                <Button
                  variant="outline"
                  onClick={copyLink}
                  className="shrink-0"
                  data-testid="button-copy-link"
                >
                  Copier
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={() => { setLink(null); setGenerated(false); }}
                className="w-full rounded-[15px] font-semibold"
              >
                Générer un autre lien
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog : affichage des réponses ─────────────────────────────────────────

function ResponseViewDialog({ open, response, templates, onClose }: {
  open: boolean;
  response: AnamnesisResponse | null;
  templates: AnamnesisTemplate[];
  onClose: () => void;
}) {
  if (!response) return null;
  const tpl = templates.find(t => t.id === response.templateId);
  const questions = parseQuestions(tpl?.questions);
  const answers = parseAnswers(response.answers);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réponses — {tpl?.name ?? "Questionnaire"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {response.submittedAt && (
            <p className="text-xs text-muted-foreground">
              Soumis le {new Date(response.submittedAt).toLocaleDateString("fr-FR", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          )}
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune question dans ce modèle.</p>
          ) : (
            questions.map((q, i) => {
              const ans = answers[q.id];
              return (
                <div key={q.id} className="border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-semibold mb-1">
                    {i + 1}. {q.label}
                    {q.required && <span className="text-destructive ml-1">*</span>}
                  </p>
                  {ans === undefined || ans === "" || (Array.isArray(ans) && ans.length === 0) ? (
                    <p className="text-sm text-muted-foreground italic">Sans réponse</p>
                  ) : Array.isArray(ans) ? (
                    <ul className="text-sm space-y-0.5">
                      {ans.map((v, j) => <li key={j} className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-primary" />{v}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{String(ans)}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
