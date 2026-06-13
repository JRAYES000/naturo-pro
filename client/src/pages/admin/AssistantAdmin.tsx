/**
 * client/src/pages/admin/AssistantAdmin.tsx — Admin de l'assistant IA
 *
 * Instructions globales (cadrage du system prompt) + base de connaissances RAG
 * (supports de cours : PDF / .txt / .md ou texte collé). Réservé à l'admin.
 */

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, Trash2, FileText, AlertCircle, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface KbDoc {
  id: number;
  title: string;
  filename: string | null;
  charCount: number;
  status: string;
  error: string | null;
  createdAt: number;
}

export default function AssistantAdmin() {
  const { toast } = useToast();
  const confirm = useConfirm();

  // ── Instructions globales ──────────────────────────────────────────────────
  const { data: instrData, isLoading: instrLoading } = useQuery<{ instructions: string }>({
    queryKey: ["/api/admin/assistant/instructions"],
  });
  const [instructions, setInstructions] = useState("");
  useEffect(() => {
    if (instrData) setInstructions(instrData.instructions || "");
  }, [instrData]);
  const saveInstr = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/assistant/instructions", { instructions }),
    onSuccess: () => toast({ title: "Instructions enregistrées", variant: "success" }),
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  // ── Supports de cours ───────────────────────────────────────────────────────
  const { data: docs = [], isLoading: docsLoading } = useQuery<KbDoc[]>({
    queryKey: ["/api/admin/assistant/documents"],
  });
  const [title, setTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/assistant/documents", body),
    onSuccess: async () => {
      setTitle("");
      setPasteText("");
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/assistant/documents"] });
      toast({ title: "Support ajouté et indexé", variant: "success" });
    },
    onError: (e: any) =>
      toast({ title: "Échec", description: e?.message || "Impossible d'ajouter le support.", variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/assistant/documents/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/assistant/documents"] });
      toast({ title: "Support supprimé", variant: "success" });
    },
    onError: () => toast({ title: "Erreur", description: "Suppression impossible.", variant: "destructive" }),
  });

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      uploadMut.mutate({ title: title.trim() || file.name, filename: file.name, mimeType: file.type || null, dataBase64: base64 });
    };
    reader.readAsDataURL(file);
  }

  function submitText() {
    if (!pasteText.trim() || !title.trim()) {
      toast({ title: "Titre et texte requis", variant: "destructive" });
      return;
    }
    uploadMut.mutate({ title: title.trim(), text: pasteText });
  }

  async function del(d: KbDoc) {
    const ok = await confirm({
      title: "Supprimer ce support ?",
      description: `« ${d.title} » sera retiré de la base de connaissances de l'assistant.`,
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (ok) delMut.mutate(d.id);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Assistant — Base de connaissances"
        subtitle="Instructions et supports de cours utilisés par l'assistant IA (réservé à l'admin)."
        icon={Sparkles}
      />

      <div className="card-naturo mb-6">
        <h2 className="font-bold text-heading mb-2">Instructions globales</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Cadrage appliqué à toutes les réponses (ton, approche, ce qu'il faut privilégier ou éviter).
        </p>
        {instrLoading ? (
          <Loading />
        ) : (
          <>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Ex. : Privilégie une approche douce et progressive ; mentionne toujours les contre-indications ; reste fidèle à la méthode enseignée à l'École Naturo."
              data-testid="input-instructions"
            />
            <div className="mt-3 flex justify-end">
              <Button onClick={() => saveInstr.mutate()} disabled={saveInstr.isPending} className="rounded-[12px]" data-testid="button-save-instructions">
                Enregistrer
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="card-naturo mb-6">
        <h2 className="font-bold text-heading mb-2">Ajouter un support de cours</h2>
        <div className="space-y-3">
          <div>
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Module 3 — Le foie en naturopathie" data-testid="input-doc-title" />
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain"
              onChange={onFile}
              className="text-sm"
              data-testid="input-doc-file"
            />
            <span className="text-xs text-muted-foreground">PDF, .txt ou .md (max 20 Mo)</span>
          </div>
          <div>
            <Label>… ou coller du texte</Label>
            <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder="Colle ici le contenu d'un cours." data-testid="input-doc-text" />
            <div className="mt-2 flex justify-end">
              <Button variant="secondary" onClick={submitText} disabled={uploadMut.isPending} data-testid="button-add-text">
                Ajouter le texte
              </Button>
            </div>
          </div>
          {uploadMut.isPending && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Extraction et indexation en cours…
            </p>
          )}
        </div>
      </div>

      <div className="card-naturo">
        <h2 className="font-bold text-heading mb-3">Supports indexés</h2>
        {docsLoading ? (
          <Loading />
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun support pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2" data-testid={`doc-${d.id}`}>
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-heading">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(d.charCount || 0).toLocaleString("fr-FR")} caractères{d.filename ? ` · ${d.filename}` : ""}
                  </p>
                  {d.status === "error" && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {d.error || "Erreur d'indexation"}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => del(d)}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`button-delete-doc-${d.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
