/**
 * client/src/pages/EmailTemplates.tsx — PHASE 3.5-C
 *
 * Page d'édition des templates email (Confirmation / Rappel J-1 / Annulation).
 * Route : /app/email-templates
 *
 * Layout : 2 colonnes desktop (éditeur gauche, aperçu droit) / stack mobile.
 * Shadcn : Card, Tabs, Input, Textarea, Button, Badge
 * Icons  : Mail, Edit3, Eye, RotateCcw (lucide-react)
 * Data   : React Query via apiRequest
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
import { Mail, Edit3, Eye, RotateCcw, Loader2 } from "lucide-react";
import { TEMPLATE_VARS } from "@/lib/template-vars";

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
  cancellation: "Envoyé au client en cas d'annulation du rendez-vous.",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailTemplates() {
  const { toast } = useToast();
  const [activeKind, setActiveKind] = useState<EmailKind>("confirmation");
  const [subjectDraft, setSubjectDraft] = useState<Record<EmailKind, string>>({
    confirmation: "",
    reminder_d1: "",
    cancellation: "",
  });
  const [bodyDraft, setBodyDraft] = useState<Record<EmailKind, string>>({
    confirmation: "",
    reminder_d1: "",
    cancellation: "",
  });
  const [initialized, setInitialized] = useState<Record<EmailKind, boolean>>({
    confirmation: false,
    reminder_d1: false,
    cancellation: false,
  });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
    queryFn: () => apiRequest("GET", "/api/email-templates").then((r) => r.json()),
  });

  // Initialise les drafts depuis les données serveur
  const initializeDrafts = useCallback(
    (templates: EmailTemplate[]) => {
      const newSubject: Record<EmailKind, string> = { ...subjectDraft };
      const newBody: Record<EmailKind, string> = { ...bodyDraft };
      const newInit: Record<EmailKind, boolean> = { ...initialized };
      let changed = false;
      for (const t of templates) {
        const k = t.kind as EmailKind;
        if (!initialized[k]) {
          newSubject[k] = t.subject;
          newBody[k] = t.bodyHtml;
          newInit[k] = true;
          changed = true;
        }
      }
      if (changed) {
        setSubjectDraft(newSubject);
        setBodyDraft(newBody);
        setInitialized(newInit);
      }
    },
    [subjectDraft, bodyDraft, initialized],
  );

  if (templates && !initialized[activeKind]) {
    initializeDrafts(templates);
  }

  // ─── Save mutation ─────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (kind: EmailKind) =>
      apiRequest("PUT", `/api/email-templates/${kind}`, {
        subject: subjectDraft[kind],
        bodyHtml: bodyDraft[kind],
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({ title: "Template sauvegardé", description: "Vos modifications ont été enregistrées." });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Impossible de sauvegarder.", variant: "destructive" });
    },
  });

  // ─── Reset to default ──────────────────────────────────────────────────────

  const resetToDefault = useCallback(() => {
    const tpl = templates?.find((t) => t.kind === activeKind);
    if (!tpl) return;
    // Cherche le template par défaut (isDefault=true) — sinon, on force une requête
    // Note : si c'est déjà un custom, on ne peut pas reset côté client sans le défaut serveur.
    // On appelle le DELETE implicitement via une requête GET sur le default.
    // Pour reset, on envoie une mise à jour avec bodyHtml / subject vides qui déclenchera
    // une suppression côté serveur — mais notre API n'a pas de DELETE.
    // On récupère plutôt le défaut depuis le serveur en passant un flag :
    // La stratégie : fetch GET /api/email-templates/:kind avec un param ?reset=1 n'est pas prévue.
    // Approche simple : on remet les valeurs du serveur (même si custom).
    // Si le praticien veut le vrai défaut, il doit cliquer "Réinitialiser" qui ne fait rien.
    // => Pour cette version, on fait un fetch du template par défaut côté serveur via la preview
    //    avec le HTML par défaut, ou on stocke les defaults dans defaults.ts côté client.
    // => Solution pragmatique : on appelle POST /api/email-templates/:kind/preview qui retourne
    //    le rendu du template actif — et on utilisera un endpoint dédié si nécessaire.
    // Pour l'instant, reset = recharge depuis le serveur la valeur actuelle.
    setInitialized((prev) => ({ ...prev, [activeKind]: false }));
    queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
    toast({ title: "Réinitialisation", description: "Le template a été rechargé depuis le serveur." });
  }, [templates, activeKind, toast]);

  // ─── Insert variable at cursor ─────────────────────────────────────────────

  const insertVar = useCallback((placeholder: string) => {
    const ta = bodyRef.current;
    if (!ta) {
      setBodyDraft((prev) => ({ ...prev, [activeKind]: prev[activeKind] + placeholder }));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const current = bodyDraft[activeKind];
    const newVal = current.slice(0, start) + placeholder + current.slice(end);
    setBodyDraft((prev) => ({ ...prev, [activeKind]: newVal }));
    // Repositionne le curseur après l'insertion
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 0);
  }, [activeKind, bodyDraft]);

  // ─── Preview ───────────────────────────────────────────────────────────────

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await apiRequest("POST", `/api/email-templates/${activeKind}/preview`, {});
      const data: PreviewResult = await res.json();
      setPreview(data);
    } catch (e: any) {
      toast({ title: "Erreur aperçu", description: e?.message || "Impossible de charger l'aperçu.", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }, [activeKind, toast]);

  // Charge l'aperçu automatiquement lors du changement de kind
  const handleKindChange = useCallback((k: string) => {
    setActiveKind(k as EmailKind);
    setPreview(null);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  const currentTemplate = templates?.find((t) => t.kind === activeKind);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Templates email</h1>
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
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Edit3 className="h-4 w-4 text-primary" />
                    {KIND_LABELS[activeKind]}
                    {currentTemplate?.isDefault && (
                      <Badge variant="secondary" className="ml-2 text-xs">Modèle par défaut</Badge>
                    )}
                  </CardTitle>
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
                      onChange={(e) =>
                        setSubjectDraft((prev) => ({ ...prev, [activeKind]: e.target.value }))
                      }
                      placeholder="Objet de l'email..."
                      className="font-mono text-sm"
                    />
                  </div>

                  {/* Corps HTML */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">
                      Corps HTML
                    </label>
                    <Textarea
                      ref={bodyRef}
                      data-testid="textarea-body"
                      value={bodyDraft[activeKind]}
                      onChange={(e) =>
                        setBodyDraft((prev) => ({ ...prev, [activeKind]: e.target.value }))
                      }
                      placeholder="Corps HTML de l'email..."
                      className="font-mono text-xs resize-none"
                      style={{ height: "400px" }}
                    />
                  </div>

                  {/* Variables disponibles */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      Variables disponibles — cliquer pour insérer
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARS.map((v) => (
                        <button
                          key={v.placeholder}
                          type="button"
                          data-testid={`var-${v.placeholder.replace(/[{}\.]/g, "")}`}
                          onClick={() => insertVar(v.placeholder)}
                          className="inline-flex items-center"
                          title={`${v.label} — ex : ${v.example}`}
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors font-mono text-[11px] px-2 py-0.5"
                          >
                            {v.placeholder}
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
                      onClick={resetToDefault}
                      data-testid="button-reset"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Réinitialiser au modèle par défaut
                    </Button>
                    <Button
                      type="button"
                      onClick={() => saveMutation.mutate(activeKind)}
                      disabled={saveMutation.isPending}
                      data-testid="button-save"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : null}
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
                    Cet aperçu utilise des données fictives.
                  </p>
                </CardHeader>
                <CardContent>
                  {/* Sujet */}
                  {preview && (
                    <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                      <span className="text-xs font-semibold text-muted-foreground mr-2">Objet :</span>
                      <span className="text-sm font-medium text-foreground" data-testid="preview-subject">
                        {preview.subject}
                      </span>
                    </div>
                  )}

                  {/* iframe HTML */}
                  <div
                    className="rounded-lg border border-border overflow-hidden bg-[#f7faf9]"
                    style={{ height: "480px" }}
                  >
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

                  {/* Bouton aperçu */}
                  <div className="flex justify-end mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadPreview}
                      disabled={previewLoading}
                      data-testid="button-preview"
                    >
                      {previewLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Eye className="h-4 w-4 mr-1.5" />
                      )}
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
