/**
 * client/src/pages/EmailTemplates.tsx — PHASE 3.5-C / refonte éditeur visuel
 *
 * Page d'édition des templates email (Confirmation / Rappel J-1 / Annulation).
 * Route : /app/email-templates
 *
 * Objectif refonte : rendre l'édition accessible aux praticiennes peu à l'aise
 * avec l'informatique. Plus de HTML brut par défaut → éditeur visuel (WYSIWYG,
 * type traitement de texte). Le HTML reste accessible via un mode « Avancé ».
 *
 * Architecture (option C) :
 * - Le bodyHtml par défaut / sauvé depuis l'éditeur visuel est un FRAGMENT
 *   (contenu central). L'ossature (styles, carte, pied de page) est ajoutée à
 *   l'envoi côté serveur (render.ts → emailShell).
 * - Les anciens templates custom au format « document HTML complet » sont
 *   détectés (isFullDoc) et basculés automatiquement en mode « Avancé (HTML) »,
 *   avec invitation à réinitialiser pour profiter de l'éditeur visuel.
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, Edit3, Eye, RotateCcw, Loader2, Code2, Type } from "lucide-react";
import { TEMPLATE_VARS } from "@/lib/template-vars";
import {
  EditorProvider, Editor, Toolbar,
  BtnBold, BtnItalic, BtnUnderline, BtnStrikeThrough,
  BtnBulletList, BtnNumberedList, BtnLink, BtnClearFormatting,
  BtnUndo, BtnRedo, Separator,
} from "react-simple-wysiwyg";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailKind = "confirmation" | "reminder_d1" | "cancellation";

interface EmailTemplate {
  id: number | null;
  userId: number;
  kind: EmailKind;
  subject: string;
  bodyHtml: string;
  updatedAt: number | null;
  isDefault?: boolean;
}

interface PreviewResult {
  subject: string;
  html: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<EmailKind, string> = {
  confirmation: "Confirmation",
  reminder_d1: "Rappel J-1",
  cancellation: "Annulation",
};

const KIND_DESCRIPTIONS: Record<EmailKind, string> = {
  confirmation: "Envoyé au client après la prise de rendez-vous.",
  reminder_d1: "Envoyé la veille du rendez-vous pour rappeler et demander confirmation.",
  cancellation: "Envoyé au client pour confirmer l'annulation de son rendez-vous. Vous recevez aussi une notification de votre côté.",
};

/** Un bodyHtml est « ancien format » s'il contient un document HTML complet. */
function isFullDoc(html: string): boolean {
  return /<html[\s>]/i.test(html) || /<!doctype/i.test(html);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailTemplates() {
  const { toast } = useToast();
  const [activeKind, setActiveKind] = useState<EmailKind>("confirmation");
  const emptyByKind = { confirmation: "", reminder_d1: "", cancellation: "" };
  const [subjectDraft, setSubjectDraft] = useState<Record<EmailKind, string>>({ ...emptyByKind });
  const [bodyDraft, setBodyDraft] = useState<Record<EmailKind, string>>({ ...emptyByKind });
  const [initialized, setInitialized] = useState<Record<EmailKind, boolean>>({
    confirmation: false, reminder_d1: false, cancellation: false,
  });
  // Mode « Avancé (HTML) » par kind. Forcé à true pour les anciens full-HTML.
  const [advanced, setAdvanced] = useState<Record<EmailKind, boolean>>({
    confirmation: false, reminder_d1: false, cancellation: false,
  });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
    queryFn: () => apiRequest("GET", "/api/email-templates").then((r) => r.json()),
  });

  const initializeDrafts = useCallback(
    (tpls: EmailTemplate[]) => {
      const newSubject = { ...subjectDraft };
      const newBody = { ...bodyDraft };
      const newInit = { ...initialized };
      const newAdvanced = { ...advanced };
      let changed = false;
      for (const t of tpls) {
        const k = t.kind as EmailKind;
        if (!initialized[k]) {
          newSubject[k] = t.subject;
          newBody[k] = t.bodyHtml;
          newInit[k] = true;
          // Ancien format → on ouvre directement en mode Avancé (HTML).
          newAdvanced[k] = isFullDoc(t.bodyHtml);
          changed = true;
        }
      }
      if (changed) {
        setSubjectDraft(newSubject);
        setBodyDraft(newBody);
        setInitialized(newInit);
        setAdvanced(newAdvanced);
      }
    },
    [subjectDraft, bodyDraft, initialized, advanced],
  );

  if (templates && !initialized[activeKind]) {
    initializeDrafts(templates);
  }

  // ─── Save ────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (kind: EmailKind) =>
      apiRequest("PUT", `/api/email-templates/${kind}`, {
        subject: subjectDraft[kind],
        bodyHtml: bodyDraft[kind],
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({ title: "Modèle enregistré", description: "Vos modifications ont été enregistrées." });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Impossible de sauvegarder.", variant: "destructive" });
    },
  });

  // ─── Reset to default (récupère le vrai défaut côté serveur) ────────────────

  const resetMutation = useMutation({
    mutationFn: (kind: EmailKind) =>
      apiRequest("GET", `/api/email-templates/${kind}/default`).then((r) => r.json()),
    onSuccess: (def: { subject: string; bodyHtml: string }) => {
      setSubjectDraft((p) => ({ ...p, [activeKind]: def.subject }));
      setBodyDraft((p) => ({ ...p, [activeKind]: def.bodyHtml }));
      setAdvanced((p) => ({ ...p, [activeKind]: isFullDoc(def.bodyHtml) }));
      setPreview(null);
      toast({ title: "Modèle réinitialisé", description: "Le modèle par défaut a été restauré. Cliquez sur Enregistrer pour le conserver." });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Impossible de réinitialiser.", variant: "destructive" });
    },
  });

  // ─── Insert variable ────────────────────────────────────────────────────────

  // Mode Avancé (textarea) : insertion à la position du curseur.
  const insertVarTextarea = useCallback((placeholder: string) => {
    const ta = bodyRef.current;
    if (!ta) {
      setBodyDraft((p) => ({ ...p, [activeKind]: p[activeKind] + placeholder }));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const cur = bodyDraft[activeKind];
    const next = cur.slice(0, start) + placeholder + cur.slice(end);
    setBodyDraft((p) => ({ ...p, [activeKind]: next }));
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 0);
  }, [activeKind, bodyDraft]);

  // Mode visuel (contentEditable) : insertion via execCommand au curseur.
  // onMouseDown + preventDefault pour ne pas voler le focus de l'éditeur.
  const insertVarVisual = useCallback((placeholder: string) => {
    const ok = document.execCommand("insertText", false, placeholder);
    if (!ok) {
      // Fallback : append en fin de contenu.
      setBodyDraft((p) => ({ ...p, [activeKind]: p[activeKind] + " " + placeholder }));
    }
  }, [activeKind]);

  // ─── Preview ─────────────────────────────────────────────────────────────────

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      // On envoie le brouillon courant pour prévisualiser les modifications non
      // encore enregistrées. Le serveur emballe les fragments dans l'ossature.
      const res = await apiRequest("POST", `/api/email-templates/${activeKind}/preview`, {
        subject: subjectDraft[activeKind],
        bodyHtml: bodyDraft[activeKind],
      });
      const data: PreviewResult = await res.json();
      setPreview(data);
    } catch (e: any) {
      toast({ title: "Erreur aperçu", description: e?.message || "Impossible de charger l'aperçu.", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }, [activeKind, subjectDraft, bodyDraft, toast]);

  const handleKindChange = useCallback((k: string) => {
    setActiveKind(k as EmailKind);
    setPreview(null);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  const currentTemplate = templates?.find((t) => t.kind === activeKind);
  const isAdvanced = advanced[activeKind];
  const bodyIsOldFormat = isFullDoc(bodyDraft[activeKind] || "");

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Modèles d'emails</h1>
            <p className="text-sm text-muted-foreground">
              Personnalisez les emails envoyés automatiquement à vos clients.
            </p>
          </div>
        </div>

        {/* Kind selector */}
        <Tabs value={activeKind} onValueChange={handleKindChange} className="mb-6">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            {(["confirmation", "reminder_d1", "cancellation"] as EmailKind[]).map((kind) => (
              <TabsTrigger key={kind} value={kind} data-testid={`tab-${kind}`}>
                {KIND_LABELS[kind]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Colonne gauche : éditeur ────────────────────────────────── */}
            <div className="space-y-4">
              <Card className="card-naturo rounded-[15px]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Edit3 className="h-4 w-4 text-primary" />
                      {KIND_LABELS[activeKind]}
                      {currentTemplate?.isDefault && (
                        <Badge variant="secondary" className="ml-1 text-xs">Modèle par défaut</Badge>
                      )}
                    </CardTitle>
                    {/* Toggle visuel / HTML avancé */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setAdvanced((p) => ({ ...p, [activeKind]: !p[activeKind] }))}
                      data-testid="button-toggle-advanced"
                    >
                      {isAdvanced ? <Type className="h-3.5 w-3.5 mr-1.5" /> : <Code2 className="h-3.5 w-3.5 mr-1.5" />}
                      {isAdvanced ? "Éditeur simple" : "Avancé (HTML)"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{KIND_DESCRIPTIONS[activeKind]}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Sujet */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">
                      Objet de l'email
                    </label>
                    <Input
                      data-testid="input-subject"
                      value={subjectDraft[activeKind]}
                      onChange={(e) => setSubjectDraft((p) => ({ ...p, [activeKind]: e.target.value }))}
                      placeholder="Objet de l'email..."
                    />
                  </div>

                  {/* Avertissement ancien format */}
                  {bodyIsOldFormat && (
                    <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                      Ce modèle utilise l'ancien format (code HTML complet). Cliquez sur
                      « Réinitialiser au modèle par défaut » pour profiter de l'éditeur simple.
                    </div>
                  )}

                  {/* Corps : éditeur visuel OU HTML avancé */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">
                      Contenu du message
                    </label>
                    {isAdvanced ? (
                      <Textarea
                        ref={bodyRef}
                        data-testid="textarea-body"
                        value={bodyDraft[activeKind]}
                        onChange={(e) => setBodyDraft((p) => ({ ...p, [activeKind]: e.target.value }))}
                        placeholder="Contenu HTML de l'email..."
                        className="font-mono text-xs resize-none"
                        style={{ height: "360px" }}
                      />
                    ) : (
                      <div className="email-wysiwyg rounded-lg border border-input overflow-hidden" data-testid="wysiwyg-body">
                        <EditorProvider>
                          <Editor
                            value={bodyDraft[activeKind]}
                            onChange={(e: any) => setBodyDraft((p) => ({ ...p, [activeKind]: e.target.value }))}
                            style={{ minHeight: "300px" }}
                          >
                            <Toolbar>
                              <BtnUndo />
                              <BtnRedo />
                              <Separator />
                              <BtnBold />
                              <BtnItalic />
                              <BtnUnderline />
                              <BtnStrikeThrough />
                              <Separator />
                              <BtnBulletList />
                              <BtnNumberedList />
                              <Separator />
                              <BtnLink />
                              <BtnClearFormatting />
                            </Toolbar>
                          </Editor>
                        </EditorProvider>
                      </div>
                    )}
                  </div>

                  {/* Variables disponibles */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      Insérer une information personnalisée — cliquez pour ajouter à l'endroit du curseur :
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARS.map((v) => (
                        <button
                          key={v.placeholder}
                          type="button"
                          data-testid={`var-${v.placeholder.replace(/[{}\.]/g, "")}`}
                          // En mode visuel : onMouseDown + preventDefault pour garder
                          // le focus/curseur dans l'éditeur. En mode avancé : onClick classique.
                          onMouseDown={isAdvanced ? undefined : (e) => { e.preventDefault(); insertVarVisual(v.placeholder); }}
                          onClick={isAdvanced ? () => insertVarTextarea(v.placeholder) : undefined}
                          title={`Exemple : ${v.example}`}
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors text-[11px] px-2 py-0.5"
                          >
                            + {v.label}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => resetMutation.mutate(activeKind)}
                      disabled={resetMutation.isPending}
                      data-testid="button-reset"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {resetMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-1.5" />
                      )}
                      Réinitialiser au modèle par défaut
                    </Button>
                    <Button
                      type="button"
                      onClick={() => saveMutation.mutate(activeKind)}
                      disabled={saveMutation.isPending}
                      data-testid="button-save"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                      Enregistrer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Colonne droite : aperçu ─────────────────────────────────── */}
            <div className="space-y-4">
              <Card className="card-naturo rounded-[15px]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Eye className="h-4 w-4 text-primary" />
                    Aperçu
                  </CardTitle>
                  <p className="text-xs text-muted-foreground italic">
                    Aperçu avec des données fictives, mis en forme comme l'email reçu.
                  </p>
                </CardHeader>
                <CardContent>
                  {preview && (
                    <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                      <span className="text-xs font-semibold text-muted-foreground mr-2">Objet :</span>
                      <span className="text-sm font-medium text-foreground" data-testid="preview-subject">
                        {preview.subject}
                      </span>
                    </div>
                  )}

                  <div className="rounded-lg border border-border overflow-hidden bg-[#f7faf9]" style={{ height: "440px" }}>
                    {preview ? (
                      <iframe
                        data-testid="preview-iframe"
                        title="Aperçu email"
                        sandbox="allow-same-origin"
                        srcDoc={preview.html}
                        style={{ width: "100%", height: "100%", border: "none" }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <Eye className="h-10 w-10 opacity-20" />
                        <p className="text-sm">Cliquez sur « Actualiser l'aperçu » pour visualiser l'email.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadPreview}
                      disabled={previewLoading}
                      data-testid="button-preview"
                    >
                      {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
                      Actualiser l'aperçu
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
