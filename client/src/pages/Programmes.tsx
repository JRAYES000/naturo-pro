/**
 * client/src/pages/Programmes.tsx — Programmes d'hygiène de vie
 *
 * Liste filtrable (recherche, statut, cliente, tri) et builder : modèle de départ,
 * sections réordonnables contenant des conseils, étapes datées, lien client
 * optionnel, statut brouillon/envoyé, aperçu et téléchargement PDF.
 * Logique pure (filtres, nettoyage, calendrier, modèles) : `@/lib/programmes`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, FileText, Download, X, Leaf, Copy as CopyIcon, AlertTriangle, Search,
  ChevronUp, ChevronDown, Eye, Send, CalendarDays, ArrowLeft,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { SubNav, SUIVI_TABS } from "@/components/SubNav";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
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
import { filterSolutions } from "@/lib/solutions-filter";
import { detectClientRisks, safetyAlerts, parseSafety, solutionsMentioned, SAFETY_LABELS, type SafetyAlert } from "@shared/solutions";
import {
  type ProgramSection, type ProgramListItem, type StatusFilter, type SortKey, type ProgramTemplate,
  parseSections, filterPrograms, countByStatus, cleanSections, untitledSectionsWithContent,
  stageSchedule, programEndDate, formatDayFR, moveItem, PROGRAM_TEMPLATES,
} from "@/lib/programmes";
import type { Client, NaturalSolution } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Program extends ProgramListItem {
  userId: number;
  appointmentId: number | null;
  startDate?: string | null;
}

interface ObservanceData {
  today: string;
  current: number | null;
  stages: Array<{ index: number; section: string; start: string | null; end: string | null }>;
  checkins: Array<{ day: string; adherence: number; energy: number | null; note: string | null }>;
  stats: { rate: number | null; energyAvg: number | null; streak: number; checkinDays: number; windowDays: number };
  stats30: { rate: number | null; checkinDays: number };
}

const ADHERENCE_LABEL = ["Non suivi", "En partie", "Suivi"];
const ADHERENCE_CLASS = ["bg-red-100 text-red-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800"];

/** Lot 3a — observance saisie par la cliente dans son espace (relevé quotidien). */
function ObservancePanel({ programId }: { programId: number }) {
  const { data } = useQuery<ObservanceData>({ queryKey: ["/api/programmes", programId, "checkins"] });
  if (!data) return null;
  const etape = data.current != null ? data.stages.find((st) => st.index === data.current) : null;
  return (
    <div className="rounded-lg border p-4 space-y-2" data-testid="panel-observance">
      <p className="font-semibold text-sm">Observance (relevés de la cliente)</p>
      {etape && <p className="text-sm">Étape en cours : <strong>{etape.section}</strong></p>}
      {data.checkins.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun relevé pour l'instant. La cliente le remplit chaque jour depuis son espace.</p>
      ) : (
        <>
          <p className="text-sm">
            {data.stats.rate != null ? <>Suivi à <strong>{data.stats.rate} %</strong> sur 14 jours</> : "Aucun relevé ces 14 derniers jours"}
            {data.stats30.rate != null ? ` · ${data.stats30.rate} % sur 30 jours` : ""}
            {data.stats.energyAvg != null ? ` · énergie moyenne ${String(data.stats.energyAvg).replace(".", ",")}/5` : ""}
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {data.checkins.slice(0, 14).map((c) => (
              <li key={c.day} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 text-muted-foreground">{new Date(`${c.day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className={`rounded-sm px-1.5 py-0.5 text-xs font-bold ${ADHERENCE_CLASS[c.adherence] ?? ""}`}>{ADHERENCE_LABEL[c.adherence] ?? "?"}</span>
                {c.energy != null && <span className="text-xs text-muted-foreground">énergie {c.energy}/5</span>}
                {c.note && <span className="text-xs italic text-muted-foreground">« {c.note} »</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
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

// ── Choix du modèle de départ (nouveau programme) ─────────────────────────────

function TemplatePicker({ onPick }: { onPick: (t: ProgramTemplate) => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Partez d'un modèle : tous les conseils restent modifiables avant l'envoi.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROGRAM_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="text-left border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid={`button-template-${t.id}`}
          >
            <span className="font-semibold block">{t.label}</span>
            <span className="text-xs text-muted-foreground block mt-1">{t.description}</span>
            <span className="text-xs text-primary block mt-2">
              {t.id === "vierge" ? "Commencer vide" : `${t.sections().length} sections`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** « Contre-indiqué : Anticoagulants · Prudence : Thyroïde ». */
function AlertLabels({ alerts }: { alerts: SafetyAlert[] }) {
  const ci = alerts.filter(a => a.level === "ci").map(a => SAFETY_LABELS[a.key]);
  const pr = alerts.filter(a => a.level === "prudence").map(a => SAFETY_LABELS[a.key]);
  return (
    <>
      {ci.length > 0 && <span className="text-red-700">Contre-indiqué : {ci.join(", ")}</span>}
      {ci.length > 0 && pr.length > 0 && " · "}
      {pr.length > 0 && <span>Prudence : {pr.join(", ")}</span>}
    </>
  );
}

// ── Éditeur de programme ──────────────────────────────────────────────────────

interface ProgramEditorProps {
  initial?: Program | null;
  template?: ProgramTemplate | null;
  clients: Client[];
  /** Fermeture effective (après éventuelle confirmation). */
  onClose: () => void;
  /** Le parent appelle la fonction enregistrée pour demander la fermeture (Échap, clic dehors). */
  registerRequestClose: (fn: () => void) => void;
}

function ProgramEditor({ initial, template, clients, onClose, registerRequestClose }: ProgramEditorProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const isNew = !initial;

  const [title, setTitle] = useState(initial?.title ?? template?.title ?? "Programme d'hygiène de vie");
  const [clientId, setClientId] = useState<string>(initial?.clientId ? String(initial.clientId) : "none");
  const [status, setStatus] = useState<"draft" | "sent">(initial?.status ?? "draft");
  const [startDate, setStartDate] = useState<string>(initial?.startDate ?? "");
  const [sections, setSections] = useState<ProgramSection[]>(() =>
    initial ? parseSections(initial.content) : (template ?? PROGRAM_TEMPLATES[0]).sections(),
  );

  // Modifications non enregistrées : comparaison à l'état d'ouverture.
  const currentSnapshot = JSON.stringify([title, clientId, status, startDate, sections]);
  const [initialSnapshot] = useState(currentSnapshot);
  const dirty = currentSnapshot !== initialSnapshot;

  async function requestClose() {
    if (dirty && !(await confirm({
      title: "Quitter sans enregistrer ?",
      description: "Vos modifications sur ce programme seront perdues.",
      confirmLabel: "Quitter sans enregistrer",
      cancelLabel: "Continuer l'édition",
      destructive: true,
    }))) return;
    onClose();
  }
  registerRequestClose(requestClose);

  // Picker « base de solutions »
  const { data: solutions = [] } = useQuery<NaturalSolution[]>({ queryKey: ["/api/solutions"] });
  const [pickerSection, setPickerSection] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const pickerResults = useMemo(() => filterSolutions(solutions, { search: pickerSearch }), [solutions, pickerSearch]);

  // Profil de la cliente liée (traitements repérés, âge) croisé avec les précautions
  // des fiches citées dans le programme et de celles du picker.
  const client = clientId !== "none" ? clients.find(c => String(c.id) === clientId) : undefined;
  const clientRisks = useMemo(() => (client ? detectClientRisks(client) : []), [client]);
  const riskKeys = useMemo(() => clientRisks.map(r => r.key), [clientRisks]);
  const programAlerts = useMemo(() => {
    if (!riskKeys.length) return [];
    return solutionsMentioned(sections.flatMap(s => s.items), solutions)
      .map(sol => ({ sol, alerts: safetyAlerts(parseSafety(sol.safety), riskKeys) }))
      .filter(x => x.alerts.length > 0);
  }, [riskKeys, sections, solutions]);

  function insertSolution(sectionIdx: number, sol: NaturalSolution) {
    const text = sol.usageNotes ? `${sol.name} : ${sol.usageNotes}` : sol.name;
    setSections(s => s.map((sec, i) =>
      i === sectionIdx ? { ...sec, items: [...sec.items.filter(it => it.trim()), text] } : sec,
    ));
    setPickerSection(null);
    setPickerSearch("");
    toast({ title: `« ${sol.name} » ajouté`, variant: "success" });
  }

  // Focus sur le champ qui vient d'être ajouté (section ou conseil).
  const focusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusRef.current) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="${focusRef.current}"]`);
    focusRef.current = null;
    el?.focus();
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sections]);

  // Gestionnaire de sections
  function addSection() {
    focusRef.current = `input-section-title-${sections.length}`;
    setSections(s => [...s, { section: "", items: [""] }]);
  }
  async function removeSection(idx: number) {
    const sec = sections[idx];
    if (sec.items.some(it => it.trim()) && !(await confirm({
      title: `Supprimer la section « ${sec.section.trim() || "sans nom"} » ?`,
      description: "Ses conseils seront retirés du programme.",
      confirmLabel: "Supprimer",
      cancelLabel: "Annuler",
      destructive: true,
    }))) return;
    setSections(s => s.filter((_, i) => i !== idx));
  }
  function moveSection(idx: number, dir: -1 | 1) {
    setSections(s => moveItem(s, idx, dir));
  }
  function updateSectionTitle(idx: number, value: string) {
    setSections(s => s.map((sec, i) => i === idx ? { ...sec, section: value } : sec));
  }
  function updateSectionDuration(idx: number, value: string) {
    const n = Math.floor(Number(value));
    setSections(s => s.map((sec, i) => i === idx ? { ...sec, durationDays: value && n > 0 ? Math.min(365, n) : null } : sec));
  }
  function addItem(sectionIdx: number) {
    focusRef.current = `input-item-${sectionIdx}-${sections[sectionIdx].items.length}`;
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

  const schedule = useMemo(() => stageSchedule(sections, startDate), [sections, startDate]);
  const endDate = useMemo(() => programEndDate(sections, startDate), [sections, startDate]);
  const hasStages = sections.some(s => s.durationDays);
  const untitled = untitledSectionsWithContent(sections);
  const itemCount = sections.reduce((n, s) => n + s.items.filter(it => it.trim()).length, 0);
  const canSave = !!title.trim() && untitled === 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim(),
        clientId: clientId !== "none" ? Number(clientId) : null,
        status,
        startDate: startDate || null,
        // Conseils vides retirés : le serveur refuse une chaîne vide (400 avant ce correctif).
        content: cleanSections(sections),
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
    // Lot 5 (QC Programme) — remonter le détail plutôt qu'un toast muet.
    onError: (e: any) => toast({ title: "Erreur lors de la sauvegarde", description: e?.message || "Vérifiez le contenu du programme.", variant: "destructive" }),
  });

  function save() {
    if (canSave && !saveMut.isPending) saveMut.mutate();
  }

  return (
    <div
      className="flex flex-col min-h-0 flex-1"
      onKeyDown={(e) => {
        // Ctrl+S / Cmd+S : enregistrer sans lâcher le clavier.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      }}
    >
      <div className="flex-1 overflow-y-auto space-y-5 px-6 py-4">
      {/* Titre */}
      <div className="space-y-1.5">
        <Label htmlFor="prog-title">Titre du programme</Label>
        <Input
          id="prog-title"
          placeholder="ex. Programme personnalisé Alimentation & Phytothérapie"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={500}
          data-testid="input-title-programme"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Client */}
        <div className="space-y-1.5">
          <Label>Cliente (optionnel)</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger data-testid="select-client-programme">
              <SelectValue placeholder="Aucune cliente sélectionnée" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Aucune cliente —</SelectItem>
              {clients
                .filter(c => !c.archivedAt || String(c.id) === clientId)
                .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "fr"))
                .map(c => (
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
              <SelectItem value="draft">Brouillon (visible par vous seule)</SelectItem>
              <SelectItem value="sent">Envoyé (visible dans l'espace de la cliente)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {status === "sent" && clientId === "none" && (
        <p className="text-xs text-amber-700 flex items-start gap-1.5 -mt-3" data-testid="text-warning-no-client">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          Sans cliente liée, ce programme n'apparaît dans aucun espace cliente : choisissez-en une ou remettez le PDF.
        </p>
      )}

      {client && clientRisks.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-1.5 -mt-1" data-testid="panel-client-risks">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>À surveiller pour {client.firstName} :</strong>{" "}
              {clientRisks.map(r => `${SAFETY_LABELS[r.key]} (${r.reasons.join(", ")})`).join(" · ")}
            </span>
          </p>
          {programAlerts.length > 0 ? (
            <ul className="pl-6 space-y-0.5" data-testid="list-program-alerts">
              {programAlerts.map(({ sol, alerts }) => (
                <li key={sol.id}>
                  <strong>{sol.name}</strong> : <AlertLabels alerts={alerts} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="pl-6 text-xs">Aucune solution de la bibliothèque citée dans ce programme n'est signalée pour ce profil.</p>
          )}
          <p className="pl-6 text-xs opacity-80">Repérage automatique dans les traitements et la fiche cliente, non exhaustif : il ne remplace pas votre vérification.</p>
        </div>
      )}

      {/* Lot 3a — programme par étapes */}
      <div className="space-y-1.5">
        <Label htmlFor="prog-start">Date de début (programme par étapes)</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="prog-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-48" data-testid="input-start-programme" />
          {startDate && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStartDate("")} data-testid="button-clear-start-programme">
              Effacer
            </Button>
          )}
          {endDate && (
            <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-end-programme">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Fin prévue le {formatDayFR(endDate)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Donnez une durée en jours aux sections qui forment des étapes (ex. détox 7 jours, puis reminéralisation 21 jours) :
          votre cliente voit l'étape du jour dans son espace et y note son suivi.
          {hasStages && !startDate && <strong className="text-amber-700"> Ajoutez une date de début pour dater les étapes.</strong>}
        </p>
      </div>

      {!isNew && initial?.clientId && status === "sent" && <ObservancePanel programId={initial.id} />}

      {/* Sections */}
      <div className="space-y-3">
        <Label className="block">
          Sections du programme
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {sections.length} section{sections.length !== 1 ? "s" : ""} · {itemCount} conseil{itemCount !== 1 ? "s" : ""}
          </span>
        </Label>

        {sections.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucune section. Cliquez sur « Ajouter une section » pour commencer.
          </p>
        )}

        {sections.map((sec, sIdx) => {
          const stage = schedule[sIdx];
          const missingTitle = !sec.section.trim() && sec.items.some(it => it.trim());
          return (
          <div key={sIdx} className={`border rounded-lg p-4 space-y-3 ${PASTELS[sIdx % PASTELS.length]}`} data-testid={`card-section-${sIdx}`}>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nom de la section (ex. Alimentation, Phytothérapie…)"
                value={sec.section}
                onChange={e => updateSectionTitle(sIdx, e.target.value)}
                className={`font-semibold ${missingTitle ? "border-destructive" : ""}`}
                aria-invalid={missingTitle}
                data-testid={`input-section-title-${sIdx}`}
              />
              <Input
                type="number"
                min={1}
                max={365}
                value={sec.durationDays ?? ""}
                onChange={e => updateSectionDuration(sIdx, e.target.value)}
                placeholder="Jours"
                aria-label="Durée de l'étape en jours"
                title="Durée de l'étape en jours (vide = tout du long)"
                className="w-20 shrink-0"
                data-testid={`input-section-days-${sIdx}`}
              />
              <div className="flex shrink-0">
                <Button
                  type="button" variant="ghost" size="icon"
                  onClick={() => moveSection(sIdx, -1)}
                  disabled={sIdx === 0}
                  aria-label="Monter la section" title="Monter la section"
                  className="h-10 w-8"
                  data-testid={`button-up-section-${sIdx}`}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon"
                  onClick={() => moveSection(sIdx, 1)}
                  disabled={sIdx === sections.length - 1}
                  aria-label="Descendre la section" title="Descendre la section"
                  className="h-10 w-8"
                  data-testid={`button-down-section-${sIdx}`}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSection(sIdx)}
                data-testid={`button-remove-section-${sIdx}`}
                aria-label="Supprimer la section"
                title="Supprimer la section"
                className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {missingTitle && (
              <p className="text-xs text-destructive">Donnez un nom à cette section pour pouvoir enregistrer.</p>
            )}
            {stage && (
              <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-stage-dates-${sIdx}`}>
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Étape du {formatDayFR(stage.start)} au {formatDayFR(stage.end)}
              </p>
            )}

            <div className="space-y-2 pl-2">
              {sec.items.map((item, iIdx) => (
                <div key={iIdx} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Textarea
                      placeholder="Conseil ou recommandation…"
                      value={item}
                      onChange={e => updateItem(sIdx, iIdx, e.target.value)}
                      rows={2}
                      maxLength={2000}
                      className={`resize-y text-sm border w-full ${PASTELS[iIdx % PASTELS.length]}`}
                      data-testid={`input-item-${sIdx}-${iIdx}`}
                    />
                    {/* Lot 5 (QC Programme) — la limite de 2000 caractères est visible avant l'échec */}
                    {item.length > 1800 && (
                      <p className="text-xs text-amber-600 mt-0.5">{item.length}/2000 caractères</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(sIdx, iIdx)}
                    data-testid={`button-remove-item-${sIdx}-${iIdx}`}
                    aria-label="Supprimer le conseil"
                    title="Supprimer le conseil"
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
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={addSection}
          data-testid="button-add-section"
          className="w-full rounded-lg border-dashed"
        >
          <Plus className="h-4 w-4 mr-1" /> Ajouter une section
        </Button>
      </div>

      </div>

      {/* Actions — pied de page collant, toujours visible */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-t px-6 py-3 bg-background">
        <span className="text-xs text-muted-foreground hidden sm:block" data-testid="text-editor-state">
          {untitled > 0
            ? <span className="text-destructive">{untitled} section{untitled > 1 ? "s" : ""} sans nom</span>
            : dirty ? "Modifications non enregistrées · Ctrl+S pour enregistrer" : "Aucune modification"}
        </span>
        <div className="flex gap-2 ml-auto">
          <Button type="button" variant="outline" onClick={requestClose} className="rounded-lg">
            Annuler
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!canSave || saveMut.isPending}
            className="rounded-lg font-bold"
            data-testid="button-save-programme"
          >
            {saveMut.isPending ? "Enregistrement…" : isNew ? "Créer le programme" : "Enregistrer"}
          </Button>
        </div>
      </div>

      {/* Picker : base de solutions naturelles */}
      <Dialog open={pickerSection !== null} onOpenChange={(o) => { if (!o) setPickerSection(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle>Piocher dans la base de solutions</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-3 shrink-0 space-y-2">
            {client && clientRisks.length > 0 && (
              <p className="text-xs text-amber-900 flex items-start gap-1.5" data-testid="text-picker-risks">
                <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
                Précautions croisées avec le profil de {client.firstName} : {riskKeys.map(k => SAFETY_LABELS[k]).join(", ")}.
              </p>
            )}
            <Input
              placeholder="Rechercher (nom, propriété, catégorie)…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              autoFocus
              data-testid="input-picker-search"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-2">
            {pickerResults.map((s) => {
              const alerts = safetyAlerts(parseSafety(s.safety), riskKeys);
              return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickerSection !== null && insertSolution(pickerSection, s)}
                className="w-full text-left border rounded-md p-3 hover:border-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid={`picker-solution-${s.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs text-muted-foreground border rounded-sm px-1 py-0.5">{s.category}</span>
                </div>
                {alerts.length > 0 && (
                  <p className={`text-xs font-semibold mt-1 ${alerts[0].level === "ci" ? "text-red-700" : "text-amber-800"}`} data-testid={`picker-alert-${s.id}`}>
                    <AlertLabels alerts={alerts} />
                  </p>
                )}
                {s.properties && <p className="text-xs text-muted-foreground mt-1">{s.properties}</p>}
                {s.contraindications && (
                  <p className="flex gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1 mt-2" data-testid={`picker-precautions-${s.id}`}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                    <span><span className="font-semibold">Précautions :</span> {s.contraindications}</span>
                  </p>
                )}
              </button>
              );
            })}
            {solutions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune solution dans la base pour le moment.</p>
            ) : pickerResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune solution ne correspond à « {pickerSearch.trim()} ».</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

const STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "draft", label: "Brouillons" },
  { value: "sent", label: "Envoyés" },
];

/** "pick" = choix du modèle ; sinon programme édité (null = nouveau, depuis `template`). */
type EditingState = { program: Program | null; template: ProgramTemplate | null } | "pick" | null;

function ProgrammesPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<EditingState>(null);
  const requestCloseRef = useRef<(() => void) | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const { data: programmes = [], isLoading } = useQuery<Program[]>({
    queryKey: ["/api/programmes"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const clientNames = useMemo(
    () => new Map(clients.map(c => [c.id, `${c.firstName} ${c.lastName}`.trim()])),
    [clients],
  );
  const clientName = (id: number | null) => (id ? clientNames.get(id) ?? "" : "");

  const counts = useMemo(() => countByStatus(programmes), [programmes]);
  // Seules les clientes qui ont au moins un programme alimentent le filtre.
  const clientsWithPrograms = useMemo(() => {
    const ids = new Set(programmes.map(p => p.clientId).filter((id): id is number => id != null));
    return Array.from(ids)
      .map(id => ({ id, name: clientNames.get(id) ?? "" }))
      .filter(c => c.name)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [programmes, clientNames]);

  const visible = useMemo(
    () => filterPrograms(programmes, {
      query, status: statusFilter, sort,
      clientId: clientFilter === "all" ? null : Number(clientFilter),
    }, (id) => (id ? clientNames.get(id) ?? "" : "")),
    [programmes, query, statusFilter, clientFilter, sort, clientNames],
  );
  const filtersActive = !!query.trim() || statusFilter !== "all" || clientFilter !== "all";
  function resetFilters() {
    setQuery(""); setStatusFilter("all"); setClientFilter("all");
  }

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

  // Lot 5 (action P22) — duplication : copie brouillon sans cliente, ouverte
  // aussitôt dans l'éditeur pour la rattacher et l'adapter.
  const dupMut = useMutation({
    mutationFn: async (prog: Program): Promise<Program> => {
      const res = await apiRequest("POST", "/api/programmes", {
        title: `${prog.title} (copie)`.slice(0, 500),
        clientId: null,
        content: cleanSections(parseSections(prog.content)),
        status: "draft",
      });
      return res.json();
    },
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      toast({ title: "Programme dupliqué", description: "La copie est en brouillon, sans cliente : rattachez-la et adaptez-la.", variant: "success" });
      if (copy?.id) setEditing({ program: copy, template: null });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  // Brouillon → envoyé en un clic : le programme apparaît dans l'espace cliente.
  const sendMut = useMutation({
    mutationFn: (prog: Program) => apiRequest("PATCH", `/api/programmes/${prog.id}`, { status: "sent" }),
    onSuccess: (_r, prog) => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      toast({ title: "Programme marqué envoyé", description: `Visible dans l'espace de ${clientName(prog.clientId)}.`, variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  function downloadPdf(prog: Program) {
    const a = document.createElement("a");
    a.href = `/api/programmes/${prog.id}/pdf`;
    a.download = `${prog.title.replace(/[^a-zA-Z0-9_\- ]/g, "_").slice(0, 60)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function closeEditor() {
    requestCloseRef.current = null;
    setEditing(null);
  }

  const editorTitle = editing === "pick"
    ? "Nouveau programme : choisir un modèle"
    : editing?.program ? "Modifier le programme" : "Nouveau programme";

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <SubNav group="suivi" tabs={SUIVI_TABS} />
        <PageHeader
          title="Programmes"
          subtitle="Vos programmes d'hygiène de vie personnalisés."
          icon={FileText}
          actions={
            <Button
              onClick={() => setEditing("pick")}
              className="rounded-lg font-bold"
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
              <li>Cliquez sur <strong>« Nouveau programme »</strong> et choisissez un <strong>modèle</strong> (ou une page blanche).</li>
              <li>Adaptez les <strong>sections</strong> et les <strong>conseils</strong>, réordonnez-les, piochez dans votre base de solutions.</li>
              <li>Pour une cure par étapes, indiquez une <strong>date de début</strong> et la durée de chaque étape.</li>
              <li>Liez le programme à une cliente puis cliquez sur <strong>« Marquer envoyé »</strong> : il apparaît dans son espace.</li>
              <li>L'<strong>aperçu</strong> et le <strong>PDF</strong> donnent un document professionnel à remettre en main propre.</li>
            </ol>
          </div>
        </HelpNote>

        {isLoading ? (
          <Loading variant="list" label="Chargement des programmes…" />
        ) : programmes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun programme"
            description="Créez votre premier programme d'hygiène de vie à partir d'un modèle prêt à adapter."
            testid="empty-programmes"
            action={
              <Button
                onClick={() => setEditing("pick")}
                className="rounded-lg font-bold"
                data-testid="button-new-programme-empty"
              >
                <Plus className="h-4 w-4 mr-1" /> Créer un programme
              </Button>
            }
          />
        ) : (
          <>
            {/* Barre de filtres */}
            <div className="space-y-3 mb-4" data-testid="toolbar-programmes">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <Input
                    type="search"
                    placeholder="Rechercher un titre, une cliente, une section…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="pl-9"
                    aria-label="Rechercher un programme"
                    data-testid="input-search-programmes"
                  />
                </div>
                {clientsWithPrograms.length > 1 && (
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="sm:w-48" data-testid="select-filter-client" aria-label="Filtrer par cliente">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les clientes</SelectItem>
                      {clientsWithPrograms.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
                  <SelectTrigger className="sm:w-48" data-testid="select-sort-programmes" aria-label="Trier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Modifiés récemment</SelectItem>
                    <SelectItem value="title">Titre (A → Z)</SelectItem>
                    <SelectItem value="client">Cliente (A → Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par statut">
                {STATUS_CHIPS.map(chip => {
                  const active = statusFilter === chip.value;
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => setStatusFilter(chip.value)}
                      aria-pressed={active}
                      className={`rounded-sm border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                      data-testid={`button-filter-${chip.value}`}
                    >
                      {chip.label} <span className={active ? "opacity-80" : "text-muted-foreground"}>({counts[chip.value]})</span>
                    </button>
                  );
                })}
                {filtersActive && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-reset-filters">
                    <X className="h-3.5 w-3.5 mr-1" /> Réinitialiser
                  </Button>
                )}
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Aucun programme ne correspond"
                description="Modifiez la recherche ou les filtres."
                testid="empty-programmes-filtered"
                action={<Button variant="outline" onClick={resetFilters} className="rounded-lg">Réinitialiser les filtres</Button>}
              />
            ) : (
              <div className="space-y-3">
                {visible.map(prog => {
                  const sections = parseSections(prog.content);
                  const cn = clientName(prog.clientId);
                  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);
                  const end = prog.startDate ? programEndDate(sections, prog.startDate) : null;
                  return (
                    <div key={prog.id} className="card-naturo p-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-testid={`card-programme-${prog.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setEditing({ program: prog, template: null })}
                            className="font-bold text-base truncate max-w-full text-heading text-left hover:underline focus-visible:outline-none focus-visible:underline"
                            title="Ouvrir le programme"
                            data-testid={`text-title-${prog.id}`}
                          >
                            {prog.title}
                          </button>
                          <StatusBadge domain="program" status={prog.status} />
                        </div>
                        {cn && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Cliente : <strong className="text-foreground">{cn}</strong>
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {sections.length} section{sections.length !== 1 ? "s" : ""} · {itemCount} conseil{itemCount !== 1 ? "s" : ""}
                          {" · "}Modifié le {formatDate(prog.updatedAt || prog.createdAt)}
                          {prog.startDate && end && <> · Du {formatDayFR(prog.startDate)} au {formatDayFR(end)}</>}
                        </p>
                        {sections.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {sections.map((s, i) => (
                              <span key={i} className="text-xs bg-primary/10 text-primary rounded-sm px-2.5 py-0.5 font-medium">
                                {s.section}{s.durationDays ? ` · ${s.durationDays} j` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {prog.status === "draft" && cn && (
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!(await confirm({
                                title: "Marquer ce programme comme envoyé ?",
                                description: `Il devient visible dans l'espace de ${cn}.`,
                                confirmLabel: "Marquer envoyé",
                                cancelLabel: "Annuler",
                              }))) return;
                              sendMut.mutate(prog);
                            }}
                            disabled={sendMut.isPending}
                            className="rounded-lg gap-1"
                            data-testid={`button-send-${prog.id}`}
                            title="Rendre visible dans l'espace de la cliente"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Marquer envoyé</span>
                          </Button>
                        )}
                        <Button variant="outline" size="sm" asChild className="rounded-lg">
                          <a
                            href={`/api/programmes/${prog.id}/pdf`}
                            target="_blank"
                            rel="noopener"
                            data-testid={`button-preview-${prog.id}`}
                            title="Aperçu du PDF dans un nouvel onglet"
                            aria-label="Aperçu du PDF"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadPdf(prog)}
                          className="rounded-lg gap-1"
                          data-testid={`button-pdf-${prog.id}`}
                          title="Télécharger le PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">PDF</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => dupMut.mutate(prog)}
                          disabled={dupMut.isPending}
                          className="rounded-lg"
                          data-testid={`button-duplicate-${prog.id}`}
                          title="Dupliquer ce programme"
                          aria-label="Dupliquer ce programme"
                        >
                          <CopyIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing({ program: prog, template: null })}
                          className="rounded-lg"
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
                          className="rounded-lg text-destructive hover:text-destructive"
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
                {filtersActive && (
                  <p className="text-xs text-muted-foreground text-center" data-testid="text-count-programmes">
                    {visible.length} programme{visible.length !== 1 ? "s" : ""} sur {programmes.length}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialog : choix du modèle puis éditeur */}
      <Dialog
        open={editing !== null}
        onOpenChange={open => {
          if (open) return;
          if (requestCloseRef.current) requestCloseRef.current();
          else closeEditor();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {editing !== null && editing !== "pick" && !editing.program && (
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8 -ml-2"
                  onClick={() => { requestCloseRef.current = null; setEditing("pick"); }}
                  aria-label="Revenir au choix du modèle" title="Revenir au choix du modèle"
                  data-testid="button-back-templates"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {editorTitle}
            </DialogTitle>
          </DialogHeader>
          {editing === "pick" && (
            <TemplatePicker onPick={(t) => setEditing({ program: null, template: t })} />
          )}
          {editing !== null && editing !== "pick" && (
            <ProgramEditor
              key={editing.program?.id ?? `new-${editing.template?.id}`}
              initial={editing.program}
              template={editing.template}
              clients={clients}
              onClose={closeEditor}
              registerRequestClose={(fn) => { requestCloseRef.current = fn; }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function ProgrammesPageGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="Les programmes d'hygiène de vie" description="La création de programmes personnalisés et leur export PDF sont réservés à l'abonnement Naturo Pro." />;
  }
  return <ProgrammesPage />;
}
