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
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, ClipboardList, Link2, ChevronDown, ChevronUp,
  Eye, Check, GripVertical, Sparkles, Loader2, Copy, Send, UserPlus,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { SubNav, SUIVI_TABS } from "@/components/SubNav";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
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
import type { AnamnesisTemplate, AnamnesisResponse, Client } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

// ─── Types locaux ─────────────────────────────────────────────────────────────

type QuestionType = "text" | "textarea" | "choice" | "multi" | "scale";

interface Question {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  /** Lot 3a — bilan noté : échelle comptée à rebours (10 = défavorable). */
  reverse?: boolean;
}

/** Lot 3a — bilan noté : score 0-100 tiré des questions « échelle », interprété par paliers. */
interface Scoring {
  higherIsBetter: boolean;
  bands: Array<{ upTo: number; label: string }>;
}

function parseScoringJson(raw: string | null | undefined): Scoring | null {
  try {
    const v = JSON.parse(raw || "null");
    return v && Array.isArray(v.bands) ? v : null;
  } catch { return null; }
}

function parseQuestions(raw: string | null | undefined): Question[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function parseAnswers(raw: string | null | undefined): Record<string, string | string[] | number> {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

function clientName(clients: Client[], clientId: number | null): string | null {
  if (clientId === null) return null;
  const c = clients.find(cl => cl.id === clientId);
  return c ? `${c.firstName} ${c.lastName}` : `#${clientId}`;
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

// Lot 4 (actions C6+C7) — modèles thématiques prêts à l'emploi. Le contenu
// métier est volontairement générique (pas de diagnostic, pas de prescription).
function q(label: string, type: QuestionType = "textarea", required = false): Question {
  return { id: crypto.randomUUID(), label, type, required };
}
/** Question « échelle » obligatoire d'un bilan noté ; `reverse` : 10 = défavorable. */
function sc(label: string, reverse = false): Question {
  return { id: crypto.randomUUID(), label, type: "scale", required: true, ...(reverse ? { reverse: true } : {}) };
}

const STARTER_TEMPLATES: Array<{ key: string; name: string; description: string; questions: () => Question[]; scoring?: () => Scoring }> = [
  {
    key: "premiere",
    name: "Anamnèse — première consultation",
    description: "Questionnaire à remplir avant le premier rendez-vous.",
    questions: defaultQuestions,
  },
  {
    key: "emonctoires",
    name: "Bilan des émonctoires",
    description: "État des portes de sortie de l'organisme : foie, intestins, reins, peau, poumons.",
    questions: () => [
      q("Comment se passe votre digestion après les repas (lourdeurs, ballonnements, somnolence) ?", "textarea", true),
      q("Votre transit est-il régulier ? À quelle fréquence allez-vous à la selle ?"),
      q("Comment est votre peau en ce moment (boutons, eczéma, sécheresse, transpiration) ?"),
      q("Buvez-vous suffisamment d'eau ? Décrivez vos urines (couleur, fréquence).", "textarea"),
      q("Êtes-vous sujet(te) aux troubles respiratoires (encombrement, mucosités, sinusite) ?"),
      q("Sur une échelle de 1 à 10, comment évaluez-vous votre niveau d'énergie général ?", "scale"),
    ],
  },
  {
    key: "sommeil-stress",
    name: "Bilan sommeil & stress",
    description: "Qualité du sommeil, charge mentale et gestion du stress au quotidien.",
    questions: () => [
      q("Décrivez votre sommeil : heure de coucher, endormissement, réveils nocturnes, forme au réveil.", "textarea", true),
      q("Sur une échelle de 1 à 10, quel est votre niveau de stress moyen ces dernières semaines ?", "scale"),
      q("Quelles sont vos principales sources de stress ou de préoccupation actuellement ?"),
      q("Que faites-vous aujourd'hui pour décompresser (sport, méditation, écrans, autre) ?"),
      q("Consommez-vous des excitants (café, thé, alcool, tabac) ? En quelle quantité et à quels moments ?"),
      q("Ressentez-vous des tensions physiques liées au stress (mâchoires, épaules, ventre) ?"),
    ],
  },
  {
    key: "alimentation",
    name: "Bilan alimentation & digestion",
    description: "Journée alimentaire type, habitudes et confort digestif.",
    questions: () => [
      q("Décrivez précisément une journée alimentaire type (repas, boissons, grignotages, horaires).", "textarea", true),
      q("Y a-t-il des aliments que vous ne digérez pas ou que vous évitez ? Pourquoi ?"),
      q("Comment évaluez-vous votre confort digestif (ballonnements, acidité, lourdeurs, transit) ?"),
      q("Cuisinez-vous maison ? Quelle place ont les produits transformés dans votre alimentation ?"),
      q("Avez-vous des envies ou compulsions particulières (sucre, sel, fromage…) ? À quels moments ?"),
      q("Sur une échelle de 1 à 10, quelle est votre satisfaction globale vis-à-vis de votre alimentation ?", "scale"),
    ],
  },
  {
    key: "cycle-hormonal",
    name: "Bilan cycle & équilibre hormonal",
    description: "Cycle féminin, symptômes associés et hygiène de vie hormonale.",
    questions: () => [
      q("Décrivez votre cycle : régularité, durée, abondance, douleurs éventuelles.", "textarea", true),
      q("Ressentez-vous des symptômes prémenstruels (irritabilité, seins tendus, fringales, migraines) ?"),
      q("Où en êtes-vous dans votre vie hormonale (contraception, grossesse, allaitement, périménopause) ?"),
      q("Comment sont votre énergie et votre moral au fil du cycle ?"),
      q("Suivez-vous un traitement hormonal ou avez-vous des antécédents hormonaux ou thyroïdiens connus ?"),
      q("Sur une échelle de 1 à 10, à quel point ces symptômes impactent-ils votre quotidien ?", "scale"),
    ],
  },
  // Lot 3a — bilans notés : à refaire à chaque rendez-vous pour suivre l'évolution.
  {
    key: "note-vitalite",
    name: "Bilan noté — vitalité",
    description: "Score de vitalité sur 100, à refaire régulièrement pour mesurer les progrès.",
    questions: () => [
      sc("De 1 à 10, quelle est votre énergie au réveil ?"),
      sc("De 1 à 10, quelle est votre énergie en fin de journée ?"),
      sc("De 1 à 10, comment évaluez-vous la qualité de votre sommeil ?"),
      sc("De 1 à 10, comment évaluez-vous votre confort digestif ?"),
      sc("De 1 à 10, comment va votre moral ?"),
      sc("De 1 à 10, comment évaluez-vous votre concentration ?"),
      sc("De 1 à 10, à quel point avez-vous envie de bouger ?"),
      sc("De 1 à 10, à quelle fréquence avez-vous des coups de fatigue ? (10 = très souvent)", true),
    ],
    scoring: () => ({ higherIsBetter: true, bands: [{ upTo: 39, label: "Vitalité basse" }, { upTo: 69, label: "Vitalité moyenne" }, { upTo: 100, label: "Bonne vitalité" }] }),
  },
  {
    key: "note-stress",
    name: "Bilan noté — stress",
    description: "Niveau de stress perçu sur 100 (plus le score est bas, mieux c'est).",
    questions: () => [
      sc("De 1 à 10, à quel point vous sentez-vous tendu(e) ou nerveux(se) ?"),
      sc("De 1 à 10, à quel point avez-vous du mal à vous détendre ?"),
      sc("De 1 à 10, à quel point vos pensées tournent-elles en boucle le soir ?"),
      sc("De 1 à 10, à quel point vous sentez-vous débordé(e) ?"),
      sc("De 1 à 10, à quel point êtes-vous irritable en ce moment ?"),
      sc("De 1 à 10, à quel point ressentez-vous des tensions physiques (mâchoires, épaules, ventre) ?"),
      sc("De 1 à 10, à quel point vous sentez-vous reposé(e) au réveil ? (10 = très reposé)", true),
    ],
    scoring: () => ({ higherIsBetter: false, bands: [{ upTo: 33, label: "Stress faible" }, { upTo: 66, label: "Stress modéré" }, { upTo: 100, label: "Stress élevé" }] }),
  },
  {
    key: "note-digestion",
    name: "Bilan noté — confort digestif",
    description: "Inconfort digestif sur 100 (plus le score est bas, mieux c'est).",
    questions: () => [
      sc("De 1 à 10, à quel point êtes-vous gêné(e) par des ballonnements ?"),
      sc("De 1 à 10, à quel point ressentez-vous des lourdeurs après les repas ?"),
      sc("De 1 à 10, à quel point souffrez-vous de remontées acides ou de brûlures ?"),
      sc("De 1 à 10, à quel point votre transit est-il irrégulier ?"),
      sc("De 1 à 10, à quel point êtes-vous fatigué(e) après les repas ?"),
      sc("De 1 à 10, quel plaisir avez-vous à manger ? (10 = beaucoup)", true),
    ],
    scoring: () => ({ higherIsBetter: false, bands: [{ upTo: 33, label: "Bon confort digestif" }, { upTo: 66, label: "Inconfort modéré" }, { upTo: 100, label: "Inconfort marqué" }] }),
  },
];

/** Lot 3a — réglage d'un bilan noté dans l'éditeur de modèle. */
function ScoringEditor({ scoring, onChange }: { scoring: Scoring | null; onChange: (s: Scoring | null) => void }) {
  const on = !!scoring;
  const setBand = (i: number, patch: Partial<{ upTo: number; label: string }>) =>
    scoring && onChange({ ...scoring, bands: scoring.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <div className="rounded-lg border p-3 space-y-3" data-testid="scoring-editor">
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="accent-primary mt-1" checked={on} data-testid="checkbox-scored"
          onChange={(e) => onChange(e.target.checked ? { higherIsBetter: true, bands: [{ upTo: 39, label: "Faible" }, { upTo: 69, label: "Moyen" }, { upTo: 100, label: "Bon" }] } : null)} />
        <span>
          <span className="font-semibold">Bilan noté</span>
          <span className="block text-xs text-muted-foreground">Les réponses « échelle » donnent un score sur 100, interprété par les paliers ci-dessous et suivi dans la fiche de la cliente.</span>
        </span>
      </label>
      {scoring && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Un score élevé est</span>
            <Select value={scoring.higherIsBetter ? "bon" : "mauvais"} onValueChange={(v) => onChange({ ...scoring, higherIsBetter: v === "bon" })}>
              <SelectTrigger className="w-40" data-testid="select-score-direction"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bon">favorable</SelectItem>
                <SelectItem value="mauvais">défavorable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {scoring.bands.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">Jusqu'à</span>
                <Input type="number" min={0} max={100} value={b.upTo} onChange={(e) => setBand(i, { upTo: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20" aria-label="Score maximal du palier" />
                <Input value={b.label} onChange={(e) => setBand(i, { label: e.target.value })} placeholder="Interprétation" aria-label="Interprétation du palier" />
                <button type="button" onClick={() => onChange({ ...scoring, bands: scoring.bands.filter((_, j) => j !== i) })} disabled={scoring.bands.length <= 1}
                  className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-30" aria-label="Retirer le palier">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {scoring.bands.length < 6 && (
              <Button type="button" size="sm" variant="outline" className="rounded-md" onClick={() => onChange({ ...scoring, bands: [...scoring.bands, { upTo: 100, label: "" }] })}>
                <Plus className="h-4 w-4 mr-1" /> Ajouter un palier
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

function AnamnesePage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editingTpl, setEditingTpl] = useState<AnamnesisTemplate | "new" | null>(null);
  const [viewingResp, setViewingResp] = useState<AnamnesisResponse | null>(null);
  const [shareTplId, setShareTplId] = useState<number | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<AnamnesisTemplate[]>({
    queryKey: ["/api/anamnesis-templates"],
    queryFn: () => apiRequest("GET", "/api/anamnesis-templates").then(r => r.json()),
  });

  const { data: responses = [], isLoading: responsesLoading } = useQuery<AnamnesisResponse[]>({
    queryKey: ["/api/anamnesis-responses"],
    queryFn: () => apiRequest("GET", "/api/anamnesis-responses").then(r => r.json()),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: () => apiRequest("GET", "/api/clients").then(r => r.json()),
  });

  // Lot 2 (action 15) — génération IA d'un programme (brouillon) depuis une
  // anamnèse soumise. La praticienne relit et ajuste avant tout envoi.
  const [, navigate] = useLocation();
  const genProgMut = useMutation({
    mutationFn: (respId: number) =>
      apiRequest("POST", `/api/anamnesis-responses/${respId}/generate-programme`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      toast({ title: "Programme généré (brouillon)", description: "Relisez-le et ajustez-le avant de l'envoyer." });
      navigate("/app/programmes");
    },
    onError: (e: any) => toast({ title: "Génération impossible", description: e?.message || "Réessaie dans un instant.", variant: "destructive" }),
  });

  // Lot 5 (QC Anamnèse) — activer/désactiver un modèle (l'alternative propre à la
  // suppression quand des réponses ont déjà été reçues).
  const toggleActiveMut = useMutation({
    mutationFn: (tpl: AnamnesisTemplate) =>
      apiRequest("PATCH", `/api/anamnesis-templates/${tpl.id}`, { isActive: !tpl.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/anamnesis-templates"] }),
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Lot 5 (action P19) — report des réponses vers la fiche client.
  const applyMut = useMutation({
    mutationFn: (respId: number) =>
      apiRequest("POST", `/api/anamnesis-responses/${respId}/apply-to-client`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      const champs = [
        data.applied?.allergies ? "Allergies" : null,
        data.applied?.antecedents ? "Antécédents" : null,
        data.applied?.lifestyleNotes ? "Hygiène de vie" : null,
      ].filter(Boolean).join(", ");
      toast({ title: "Fiche cliente mise à jour", description: `Réponses ajoutées dans : ${champs}.`, variant: "success" });
    },
    onError: (e: any) => toast({ title: "Report impossible", description: e.message, variant: "destructive" }),
  });

  // Lot 4 (action C6) — duplication d'un modèle en un clic.
  const dupMut = useMutation({
    mutationFn: (tpl: AnamnesisTemplate) =>
      apiRequest("POST", "/api/anamnesis-templates", {
        name: `${tpl.name} (copie)`,
        description: tpl.description ?? null,
        questions: parseQuestions(tpl.questions),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis-templates"] });
      toast({ title: "Modèle dupliqué", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/anamnesis-templates/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/anamnesis-templates"] });
      const prev = queryClient.getQueryData<AnamnesisTemplate[]>(["/api/anamnesis-templates"]);
      queryClient.setQueryData(["/api/anamnesis-templates"], (old: any) =>
        (old ?? []).filter((it: any) => it.id !== id));
      return { prev };
    },
    onError: (e: any, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/anamnesis-templates"], ctx.prev);
      // Lot 5 — le serveur explique désormais POURQUOI (réponses reçues → désactiver).
      toast({ title: "Suppression impossible", description: e?.message || "Réessayez.", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Modèle supprimé", variant: "success" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/anamnesis-templates"] }),
  });

  // ── Templates list ──────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-4xl">
        <SubNav group="suivi" tabs={SUIVI_TABS} />
        <PageHeader
          title="Anamnèses"
          subtitle="Vos questionnaires de bilan à envoyer aux clients."
          icon={ClipboardList}
          actions={
            <Button
              onClick={() => setEditingTpl("new")}
              className="rounded-lg font-bold"
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
        {templatesLoading ? (
          <Loading variant="list" label="Chargement des modèles…" />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Aucun modèle de questionnaire"
            description="Créez votre premier modèle pour commencer à envoyer des anamnèses à vos clientes."
            testid="empty-anamnese-templates"
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
                        <h3 className="font-bold truncate">{tpl.name}</h3>
                        <button
                          onClick={() => toggleActiveMut.mutate(tpl)}
                          title={tpl.isActive ? "Cliquer pour désactiver (archive le modèle sans le supprimer)" : "Cliquer pour réactiver"}
                          data-testid={`button-toggle-active-${tpl.id}`}
                        >
                          {tpl.isActive
                            ? <Badge className="bg-accent/30 text-primary border-0 text-xs cursor-pointer">Actif</Badge>
                            : <Badge variant="secondary" className="text-xs cursor-pointer">Inactif</Badge>}
                        </button>
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
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => setShareTplId(tpl.id)}
                        title="Créer un lien de partage"
                        aria-label="Créer un lien de partage"
                        data-testid={`button-share-${tpl.id}`}
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      <button
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                        onClick={() => dupMut.mutate(tpl)}
                        disabled={dupMut.isPending}
                        title="Dupliquer ce modèle"
                        aria-label="Dupliquer ce modèle"
                        data-testid={`button-duplicate-${tpl.id}`}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => setEditingTpl(tpl)}
                        aria-label="Modifier le modèle"
                        data-testid={`button-edit-${tpl.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label="Supprimer le modèle"
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
          <h2 className="text-xl font-bold mb-4 text-heading">Réponses reçues</h2>
          {responsesLoading ? (
            <Loading variant="list" label="Chargement des réponses…" />
          ) : responses.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Aucune réponse pour l'instant"
              description="Envoyez un lien à une cliente pour commencer à recevoir des réponses."
              testid="empty-anamnese-responses"
            />
          ) : (
            <ul className="space-y-3">
              {responses.map(resp => {
                const tpl = templates.find(t => t.id === resp.templateId);
                return (
                  <li key={resp.id} className="card-naturo flex items-center justify-between gap-3" data-testid={`response-${resp.id}`}>
                    <div>
                      <p className="font-semibold text-sm">
                        {clientName(clients, resp.clientId) ?? tpl?.name ?? "Questionnaire"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {clientName(clients, resp.clientId) && `${tpl?.name ?? "Questionnaire"} — `}
                        {resp.submittedAt
                          ? `Soumis le ${new Date(resp.submittedAt).toLocaleDateString("fr-FR")}`
                          : "En attente de réponse"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(resp as any).score != null && (
                        <Badge className="bg-sky-100 text-sky-800 border-0 text-xs" data-testid={`badge-score-${resp.id}`}>
                          {(resp as any).score}/100{(resp as any).scoreLabel ? ` · ${(resp as any).scoreLabel}` : ""}
                        </Badge>
                      )}
                      {resp.submittedAt
                        ? <Badge className="bg-accent/30 text-primary border-0 text-xs"><Check className="h-3 w-3 mr-1" />Reçu</Badge>
                        : <Badge variant="secondary" className="text-xs">En attente</Badge>}
                      {resp.submittedAt && (
                        <button
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => setViewingResp(resp)}
                          aria-label="Voir les réponses"
                          data-testid={`button-view-${resp.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      {/* Lot 5 (P19) — reporter les réponses vers la fiche cliente liée */}
                      {resp.submittedAt && resp.clientId && (
                        <button
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                          onClick={async () => {
                            if (!(await confirm({
                              title: "Reporter vers la fiche cliente ?",
                              description: "Les réponses pertinentes seront AJOUTÉES (sans rien écraser) dans les champs Allergies, Antécédents et Hygiène de vie de la fiche, avec la mention de leur origine. Vous pourrez les modifier ensuite.",
                              confirmLabel: "Reporter",
                              cancelLabel: "Annuler",
                            }))) return;
                            applyMut.mutate(resp.id);
                          }}
                          disabled={applyMut.isPending}
                          aria-label="Reporter vers la fiche cliente"
                          title="Reporter les réponses vers la fiche cliente (Allergies / Antécédents / Hygiène de vie)"
                          data-testid={`button-apply-client-${resp.id}`}
                        >
                          {applyMut.isPending && applyMut.variables === resp.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <UserPlus className="h-4 w-4" />}
                        </button>
                      )}
                      {resp.submittedAt && (
                        <button
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                          onClick={() => genProgMut.mutate(resp.id)}
                          disabled={genProgMut.isPending}
                          aria-label="Générer un programme (IA)"
                          title="Générer un programme (IA) · ~1 appel IA"
                          data-testid={`button-generate-programme-${resp.id}`}
                        >
                          {genProgMut.isPending && genProgMut.variables === resp.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Sparkles className="h-4 w-4" />}
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
        clients={clients}
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
  const [starterKey, setStarterKey] = useState(STARTER_TEMPLATES[0].key);
  const [scoring, setScoring] = useState<Scoring | null>(null);

  // Lot 4 (actions C6+C7) — choisir un modèle de départ thématique remplace
  // nom/description/questions d'un coup (avant toute personnalisation).
  function applyStarter(key: string) {
    const s = STARTER_TEMPLATES.find(t => t.key === key);
    if (!s) return;
    setStarterKey(key);
    setName(s.name);
    setDescription(s.description);
    setQuestions(s.questions());
    setScoring(s.scoring ? s.scoring() : null);
  }

  if (open && !initialized) {
    if (editing === "new") {
      setStarterKey(STARTER_TEMPLATES[0].key);
      setName("Anamnèse — première consultation");
      setDescription("Questionnaire à remplir avant le premier rendez-vous.");
      setQuestions(defaultQuestions());
      setScoring(null);
    } else if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setQuestions(parseQuestions(editing.questions));
      setScoring(parseScoringJson((editing as any).scoring));
    }
    setInitialized(true);
  }
  if (!open && initialized) setInitialized(false);

  const mut = useMutation({
    mutationFn: async () => {
      const body = { name, description: description || null, questions, scoring: scoring && scoring.bands.every((b) => b.label.trim()) ? scoring : null };
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
          {editing === "new" && (
            <div>
              <Label>Partir d'un modèle thématique</Label>
              <Select value={starterKey} onValueChange={applyStarter}>
                <SelectTrigger data-testid="select-starter-template"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STARTER_TEMPLATES.map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Les questions se pré-remplissent : modifiez, ajoutez ou supprimez librement ensuite.
              </p>
            </div>
          )}
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

          <ScoringEditor scoring={scoring} onChange={setScoring} />

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">Questions ({questions.length})</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addQuestion}
                className="rounded-lg font-semibold"
                data-testid="button-add-question"
              >
                <Plus className="h-4 w-4 mr-1" /> Ajouter une question
              </Button>
            </div>

            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
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
                  scored={!!scoring}
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
            className="w-full rounded-lg py-5 font-bold"
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

function QuestionEditor({ question, index, total, scored, onChange, onRemove, onMove }: {
  question: Question;
  index: number;
  total: number;
  scored?: boolean;
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
    <div className={`border rounded-lg p-4 space-y-3 ${PASTELS[index % PASTELS.length]}`} data-testid={`question-${index}`}>
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1 mt-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="h-9 w-9 inline-flex items-center justify-center rounded-sm hover:bg-secondary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Déplacer la question vers le haut"
            data-testid={`button-move-up-${index}`}
          >
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="h-9 w-9 inline-flex items-center justify-center rounded-sm hover:bg-secondary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Déplacer la question vers le bas"
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
                      aria-label="Retirer l'option"
                      className="text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                <Button type="button" size="sm" variant="outline" onClick={addOption} aria-label="Ajouter l'option">
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
            {scored && question.type === "scale" && (
              <>
                <input
                  type="checkbox"
                  id={`rev-${question.id}`}
                  checked={!!question.reverse}
                  onChange={e => onChange({ reverse: e.target.checked })}
                  className="accent-primary ml-3"
                  data-testid={`checkbox-reverse-${index}`}
                />
                <label htmlFor={`rev-${question.id}`} className="text-xs text-muted-foreground">Échelle inversée (10 = défavorable)</label>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Supprimer la question"
          data-testid={`button-remove-question-${index}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Dialog : partage d'un lien ───────────────────────────────────────────────

function ShareDialog({ open, templateId, clients, onClose }: {
  open: boolean;
  templateId: number | null;
  clients: Client[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [respId, setRespId] = useState<number | null>(null);
  const [generated, setGenerated] = useState(false);
  const [clientId, setClientId] = useState<string>("");

  if (!open && generated) { setGenerated(false); setLink(null); setRespId(null); setClientId(""); }

  const genMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/anamnesis-responses", {
        templateId,
        clientId: clientId ? Number(clientId) : undefined,
      });
      return r.json();
    },
    onSuccess: (data: any) => {
      setLink(data.link);
      setRespId(data.id ?? null);
      setGenerated(true);
      queryClient.invalidateQueries({ queryKey: ["/api/anamnesis-responses"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Lot 4 (action P7) — envoi direct par email : l'adresse vient de la fiche cliente.
  const selectedClient = clientId ? clients.find(c => c.id === Number(clientId)) : null;
  const sendMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/anamnesis-responses/${respId}/send-email`, {})).json(),
    onSuccess: (data: any) => toast({ title: "Email envoyé", description: `Le lien du questionnaire est parti à ${data.to}.`, variant: "success" }),
    onError: (e: any) => toast({ title: "Envoi impossible", description: e.message, variant: "destructive" }),
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
              <div>
                <Label className="text-xs mb-1.5 block">Associer à une cliente (optionnel)</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger data-testid="select-share-client">
                    <SelectValue placeholder="Aucune — lien générique" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.filter(c => !c.archivedAt || String(c.id) === clientId).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.firstName} {c.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Les réponses seront rattachées à cette fiche cliente dans la liste ci-dessous.
                </p>
              </div>
              <Button
                onClick={() => genMut.mutate()}
                disabled={genMut.isPending}
                className="w-full rounded-lg py-5 font-bold"
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
              {/* Lot 4 (action P7) — envoi direct sans copier-coller */}
              {respId != null && selectedClient?.email && (
                <Button
                  onClick={() => sendMut.mutate()}
                  disabled={sendMut.isPending}
                  className="w-full rounded-lg py-5 font-bold"
                  data-testid="button-send-anamnese-email"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendMut.isPending ? "Envoi…" : `Envoyer par email à ${selectedClient.firstName} (${selectedClient.email})`}
                </Button>
              )}
              {respId != null && clientId && !selectedClient?.email && (
                <p className="text-xs text-muted-foreground">
                  Cette cliente n'a pas d'adresse email dans sa fiche : copiez le lien et envoyez-le par un autre canal.
                </p>
              )}
              <Button
                variant="outline"
                onClick={() => { setLink(null); setGenerated(false); }}
                className="w-full rounded-lg font-semibold"
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
          {(response as any).score != null && (
            <p className="text-sm font-semibold text-heading" data-testid="text-response-score">
              Score : {(response as any).score}/100{(response as any).scoreLabel ? ` — ${(response as any).scoreLabel}` : ""}
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

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function AnamnesePageGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="Les anamnèses" description="Les questionnaires d'anamnèse et leurs réponses sont des données de santé : elles font partie de l'abonnement Naturo Pro." />;
  }
  return <AnamnesePage />;
}
