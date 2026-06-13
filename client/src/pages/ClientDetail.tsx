import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, FileText, Save, Trash2, Upload, Download, File, Users, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/hooks/use-confirm";
import type { Client, Appointment, ConsultationNote, AiDiscussion } from "@shared/schema";
import { formatDate, formatDay, formatTime, durationLabel } from "@/lib/format";

// Type métadonnées document (sans dataBase64)
interface ClientDocumentMeta {
  id: number;
  userId: number;
  clientId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ClientDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: client, isLoading } = useQuery<Client>({ queryKey: ["/api/clients", cid] });
  const { data: appts = [] } = useQuery<Appointment[]>({ queryKey: ["/api/clients", cid, "appointments"] });
  const { data: notes = [] } = useQuery<ConsultationNote[]>({ queryKey: ["/api/clients", cid, "notes"] });
  const { data: documents = [] } = useQuery<ClientDocumentMeta[]>({ queryKey: ["/api/clients", cid, "documents"] });
  const { data: allDiscussions = [] } = useQuery<AiDiscussion[]>({ queryKey: ["/api/discussions"] });
  const clientDiscussions = allDiscussions.filter((d) => d.clientId === Number(cid));

  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (client) setDraft(client); }, [client]);

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/clients/${cid}`, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", cid] });
      toast({ title: "Fiche enregistrée", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/clients/${cid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client supprimé", variant: "success" });
      window.location.hash = "#/app/clients";
    },
  });

  const delDocMut = useMutation({
    mutationFn: async (docId: number) => apiRequest("DELETE", `/api/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", cid, "documents"] });
      toast({ title: "Document supprimé", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const askMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/discussions", { clientId: Number(cid) }),
    onSuccess: async (res) => {
      const d = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] });
      navigate(`/app/chat/${d.id}`);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset pour permettre la re-sélection du même fichier
    e.target.value = "";

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "La taille maximale est 5 Mo.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = reader.result as string;
        // Retirer le préfixe "data:<mime>;base64,"
        const base64 = result.split(",")[1];
        await apiRequest("POST", `/api/clients/${cid}/documents`, {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64: base64,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/clients", cid, "documents"] });
        toast({ title: "Document enregistré", description: file.name, variant: "success" });
      } catch (err: any) {
        toast({ title: "Erreur lors de l'envoi", description: err.message, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      toast({ title: "Impossible de lire le fichier", variant: "destructive" });
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  if (isLoading || !client) {
    return <AppLayout><div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-72" /><Skeleton className="h-64" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <PageHeader
          icon={Users}
          title={`${client.firstName} ${client.lastName}`}
          subtitle={client.dateOfBirth ? `Né(e) le ${new Date(client.dateOfBirth).toLocaleDateString("fr-FR")}` : undefined}
          backTo={{ href: "/app/clients", label: "Clients" }}
          actions={
            <Button variant="outline" size="sm" className="rounded-[12px] text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={async () => {
                if (!(await confirm({ title: "Supprimer cette fiche client ?", description: "Cette action est définitive et supprimera toutes les données associées à ce client.", confirmLabel: "Supprimer", cancelLabel: "Annuler", destructive: true }))) return;
                delMut.mutate();
              }} data-testid="button-delete-client">
              <Trash2 className="h-4 w-4 mr-1" /> Supprimer
            </Button>
          }
        />

        <Tabs defaultValue="info">
          <TabsList className="rounded-[12px]">
            <TabsTrigger value="info" data-testid="tab-info">Informations</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Historique ({notes.length})</TabsTrigger>
            <TabsTrigger value="appts" data-testid="tab-appts">Rendez-vous ({appts.length})</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">Documents ({documents.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <div className="card-naturo space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Prénom</Label><Input value={draft.firstName || ""} onChange={e => setDraft({ ...draft, firstName: e.target.value })} data-testid="input-firstName" /></div>
                <div><Label>Nom</Label><Input value={draft.lastName || ""} onChange={e => setDraft({ ...draft, lastName: e.target.value })} data-testid="input-lastName" /></div>
                <div><Label>Email</Label><Input type="email" value={draft.email || ""} onChange={e => setDraft({ ...draft, email: e.target.value })} data-testid="input-email" /></div>
                <div><Label>Téléphone</Label><Input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} data-testid="input-phone" /></div>
                <div><Label>Date de naissance</Label><Input type="date" value={draft.dateOfBirth || ""} onChange={e => setDraft({ ...draft, dateOfBirth: e.target.value })} data-testid="input-dob" /></div>
                <div><Label>Adresse</Label><Input value={draft.address || ""} onChange={e => setDraft({ ...draft, address: e.target.value })} data-testid="input-address" /></div>
              </div>
              <div><Label>Allergies</Label><Textarea rows={2} value={draft.allergies || ""} onChange={e => setDraft({ ...draft, allergies: e.target.value })} data-testid="input-allergies" /></div>
              <div><Label>Antécédents</Label><Textarea rows={3} value={draft.antecedents || ""} onChange={e => setDraft({ ...draft, antecedents: e.target.value })} data-testid="input-antecedents" /></div>
              <div><Label>Hygiène de vie</Label><Textarea rows={3} value={draft.lifestyleNotes || ""} onChange={e => setDraft({ ...draft, lifestyleNotes: e.target.value })} data-testid="input-lifestyle" /></div>
              <div><Label>Pense-bête (privé)</Label><Textarea rows={2} value={draft.penseBete || ""} onChange={e => setDraft({ ...draft, penseBete: e.target.value })} data-testid="input-pensebete" /></div>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="rounded-[15px] font-bold" data-testid="button-save-client">
                <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>

            <div className="card-naturo mt-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-heading">Discussions avec l'assistant</h2>
                <Button size="sm" onClick={() => askMut.mutate()} disabled={askMut.isPending} className="rounded-[12px]" data-testid="button-ask-assistant">
                  <Sparkles className="h-4 w-4 mr-1" /> Demander à l'assistant
                </Button>
              </div>
              {clientDiscussions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune discussion pour cette cliente.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {clientDiscussions.map((d) => (
                    <li key={d.id}>
                      <Link href={`/app/chat/${d.id}`} className="flex items-center justify-between py-2 hover:text-primary" data-testid={`client-discussion-${d.id}`}>
                        <span className="text-sm font-medium truncate">{d.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{new Date(d.updatedAt).toLocaleDateString("fr-FR")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history">
            {notes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucune note pour ce client"
                description="Les notes des consultations apparaîtront ici."
              />
            ) : (
              <div className="space-y-3">
                {notes.map(n => (
                  <Link key={n.id} href={`/app/notes/${n.appointmentId}`} className="card-naturo block hover:-translate-y-0.5 transition" data-testid={`note-${n.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{formatDay(n.createdAt)}</p>
                        {n.motif && <p className="text-sm text-muted-foreground mt-1">Motif : {n.motif}</p>}
                      </div>
                      <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="appts">
            {appts.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Aucun rendez-vous"
              />
            ) : (
              <ul className="space-y-3">
                {appts.map(a => (
                  <li key={a.id} className="card-naturo flex items-center justify-between" data-testid={`appt-${a.id}`}>
                    <div>
                      <p className="font-bold">{formatDay(a.startAt)} • {formatTime(a.startAt)}</p>
                      <p className="text-sm text-muted-foreground">Durée : {durationLabel(Math.round((a.endAt - a.startAt) / 60000))} • Statut : {a.status}</p>
                    </div>
                    <Link href={`/app/notes/${a.id}`} className="text-sm font-bold text-primary hover:underline">Note →</Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="documents">
            <HelpNote title="Documents client" defaultOpen={false}>
              <p>
                Stockez ici les <strong>analyses, bilans, ordonnances ou tout fichier</strong> lié à ce client.
                Les fichiers sont conservés dans votre base de données (chiffrement côté serveur).
              </p>
              <ul>
                <li><strong>Taille maximale :</strong> 5 Mo par fichier.</li>
                <li><strong>Télécharger :</strong> cliquez sur le bouton flèche à droite de chaque fichier.</li>
                <li><strong>Supprimer :</strong> cliquez sur la corbeille (irréversible).</li>
              </ul>
            </HelpNote>

            <div className="space-y-3">
              {/* Bouton d'upload */}
              <div className="card-naturo flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {documents.length === 0 ? "Aucun document joint pour l'instant." : `${documents.length} document${documents.length > 1 ? "s" : ""} joint${documents.length > 1 ? "s" : ""}.`}
                </p>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-file-upload"
                    accept="*/*"
                  />
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-[15px] font-bold"
                    data-testid="button-upload-document"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? "Envoi en cours…" : "Ajouter un fichier"}
                  </Button>
                </div>
              </div>

              {/* Liste des documents */}
              {documents.map(doc => (
                <div
                  key={doc.id}
                  className="card-naturo flex items-center justify-between gap-3"
                  data-testid={`document-${doc.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <File className="h-5 w-5 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate" data-testid={`text-doc-name-${doc.id}`}>{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={`/api/documents/${doc.id}/download`}
                      download={doc.filename}
                      className="inline-flex items-center justify-center h-10 w-10 rounded-[10px] border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      data-testid={`button-download-document-${doc.id}`}
                      title="Télécharger"
                      aria-label="Télécharger le document"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={async () => {
                        if (!(await confirm({ title: "Supprimer ce document ?", description: `Le fichier « ${doc.filename} » sera supprimé définitivement.`, confirmLabel: "Supprimer", cancelLabel: "Annuler", destructive: true }))) return;
                        delDocMut.mutate(doc.id);
                      }}
                      data-testid={`button-delete-document-${doc.id}`}
                      title="Supprimer"
                      aria-label="Supprimer le document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
