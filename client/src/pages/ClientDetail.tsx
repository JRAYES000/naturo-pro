import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, FileText, Save, Trash2, Upload, Download, File, Users, Sparkles, Mail, Phone, CalendarPlus, NotebookPen, ClipboardList, Check, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/Loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useConfirm } from "@/hooks/use-confirm";
import { useAuth } from "@/lib/auth";
import { FeatureGateInline } from "@/components/FeatureGate";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Client, Appointment, ConsultationNote, AiDiscussion, AppointmentCategory, AnamnesisResponse, Program, Package } from "@shared/schema";
import { formatDate, formatDay, formatTime, durationLabel, formatPrice } from "@/lib/format";
import { computeImc, imcLabel, ageFromDateOfBirth, poidsIdealCreff } from "@/lib/imc";

// Type métadonnées document (sans dataBase64)
interface ClientDocumentMeta {
  id: number;
  userId: number;
  clientId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: string | null;
  createdAt: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getInitials(firstName: string, lastName: string): string {
  const a = (firstName || "").trim().charAt(0);
  const b = (lastName || "").trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

interface ClientSummaryCardProps {
  client: Client;
  cid: number;
  apptsCount: number;
  notesCount: number;
  lastApptAt: number | null;
  anamnesesRecues: number;
}

/**
 * Bandeau résumé synthétique de la fiche client — toujours visible sous le PageHeader.
 * Identité, coordonnées, mini-KPIs et actions rapides pour une lecture en un coup d'œil
 * entre deux consultations.
 */
function ClientSummaryCard({ client, cid, apptsCount, notesCount, lastApptAt, anamnesesRecues }: ClientSummaryCardProps) {
  const initials = getInitials(client.firstName, client.lastName);
  return (
    <div className="card-naturo mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span
            className="flex items-center justify-center rounded-full bg-primary/10 text-primary font-bold shrink-0"
            style={{ width: 48, height: 48 }}
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-heading text-xl truncate flex items-center gap-2 flex-wrap" data-testid="text-client-summary-name">
              {client.firstName} {client.lastName}
              {/* Lot 4 (action P11) — badges de statut visibles en tête de fiche */}
              {(client as any).clientType === "entreprise" && (
                <Badge className="bg-sky-100 text-sky-700 border-0 text-xs font-semibold">Entreprise</Badge>
              )}
              {client.email ? (
                <Badge className="bg-accent/30 text-primary border-0 text-xs font-semibold" data-testid="badge-email-ok">
                  <Check className="h-3 w-3 mr-1" /> Email renseigné
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-700 border-0 text-xs font-semibold" data-testid="badge-email-missing" title="Sans email, cette cliente ne recevra ni confirmation ni rappel automatique.">
                  <X className="h-3 w-3 mr-1" /> Sans email
                </Badge>
              )}
              {anamnesesRecues > 0 ? (
                <Badge className="bg-accent/30 text-primary border-0 text-xs font-semibold" data-testid="badge-anamnese-ok">
                  <Check className="h-3 w-3 mr-1" /> Anamnèse reçue
                </Badge>
              ) : (
                <Link href="/app/anamnese">
                  <Badge className="bg-gray-100 text-gray-600 border-0 text-xs font-semibold cursor-pointer hover:bg-gray-200" data-testid="badge-anamnese-missing" title="Aucune anamnèse reçue — cliquez pour envoyer un questionnaire.">
                    Aucune anamnèse
                  </Badge>
                </Link>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
              {client.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {client.email}
                </span>
              )}
              {client.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {client.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 text-center sm:text-left">
          <div>
            <p className="text-xs text-muted-foreground">RDV</p>
            <p className="font-bold text-heading" data-testid="text-summary-appts-count">{apptsCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="font-bold text-heading" data-testid="text-summary-notes-count">{notesCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Dernier RDV</p>
            <p className="font-bold text-heading" data-testid="text-summary-last-appt">{lastApptAt ? formatDate(lastApptAt) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cliente depuis</p>
            <p className="font-bold text-heading" data-testid="text-summary-since">{formatDate(client.createdAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/app/agenda" data-testid="button-summary-new-appt">
            <Button size="sm" className="rounded-lg font-bold" style={{ minHeight: 44 }}>
              <CalendarPlus className="h-4 w-4 mr-1" /> Nouveau RDV
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg font-bold"
            style={{ minHeight: 44 }}
            data-testid="button-summary-new-note"
            title="Ouvre l'onglet Rendez-vous : chaque note de consultation est rattachée à un RDV"
            onClick={() => {
              // Pas de route de création de note « libre » : une note est toujours
              // rattachée à un rendez-vous (cf. POST /api/appointments/:id/note).
              // On amène la praticienne vers l'onglet Rendez-vous pour choisir le RDV concerné.
              const el = document.querySelector('[data-testid="tab-appts"]') as HTMLElement | null;
              el?.click();
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <NotebookPen className="h-4 w-4 mr-1" /> Note de consultation
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const { toast } = useToast();
  const { user } = useAuth();
  const fullAccess = !!user?.hasFullAccess;
  const confirm = useConfirm();
  const { data: client, isLoading } = useQuery<Client>({ queryKey: ["/api/clients", cid] });
  const { data: appts = [] } = useQuery<Appointment[]>({ queryKey: ["/api/clients", cid, "appointments"] });
  const { data: notes = [] } = useQuery<ConsultationNote[]>({ queryKey: ["/api/clients", cid, "notes"] });
  const { data: documents = [] } = useQuery<ClientDocumentMeta[]>({ queryKey: ["/api/clients", cid, "documents"] });
  const { data: allDiscussions = [] } = useQuery<AiDiscussion[]>({ queryKey: ["/api/discussions"] });
  const clientDiscussions = allDiscussions.filter((d) => d.clientId === Number(cid));
  const { data: categories = [] } = useQuery<AppointmentCategory[]>({ queryKey: ["/api/categories"] });
  // Lot 4 (action C4) — vues consolidées anamnèses / programmes de ce client.
  const { data: anamneses = [] } = useQuery<AnamnesisResponse[]>({
    queryKey: ["/api/anamnesis-responses", { clientId: cid }],
    queryFn: async () => (await apiRequest("GET", `/api/anamnesis-responses?clientId=${cid}`)).json(),
  });
  const { data: programmes = [] } = useQuery<Program[]>({
    queryKey: ["/api/programmes", { clientId: cid }],
    queryFn: async () => (await apiRequest("GET", `/api/programmes?clientId=${cid}`)).json(),
  });
  // Lot 5 (QC Forfait, vue 360°) — forfaits du client sur sa fiche.
  const { data: forfaits = [] } = useQuery<Package[]>({
    queryKey: ["/api/packages", { clientId: cid }],
    queryFn: async () => (await apiRequest("GET", `/api/packages?clientId=${cid}`)).json(),
  });
  const anamnesesRecues = anamneses.filter((a) => a.submittedAt).length;

  const lastApptAt = useMemo(() => (appts.length ? Math.max(...appts.map(a => a.startAt)) : null), [appts]);

  type TimelineItem =
    | { kind: "appt"; id: number; at: number; appt: Appointment }
    | { kind: "note"; id: number; at: number; note: ConsultationNote }
    | { kind: "discussion"; id: number; at: number; discussion: AiDiscussion };

  const timeline = useMemo<TimelineItem[]>(() => {
    const apptItems: TimelineItem[] = appts.map(a => ({ kind: "appt", id: a.id, at: a.startAt, appt: a }));
    const noteItems: TimelineItem[] = notes.map(n => ({ kind: "note", id: n.id, at: n.createdAt, note: n }));
    // Lot 5 (NaturoBot N5) — les échanges Naturobot liés au client remontent
    // dans la chronologie, au même titre qu'un RDV ou une note.
    const discItems: TimelineItem[] = clientDiscussions.map(d => ({ kind: "discussion", id: d.id, at: d.updatedAt, discussion: d }));
    return [...apptItems, ...noteItems, ...discItems].sort((a, b) => b.at - a.at);
  }, [appts, notes, clientDiscussions]);

  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lot 4 (action C8) — nature du prochain upload (null = document libre).
  const uploadKindRef = useRef<string | null>(null);
  useEffect(() => { if (client) setDraft(client); }, [client]);

  // Lot 1 — le PATCH n'envoie QUE les champs réellement éditables du formulaire
  // (le spread de l'entité complète renvoyait aussi id/userId/createdAt, rejetés
  // par le schéma .strict() côté serveur), et les champs santé uniquement en
  // accès complet — en gratuit le serveur les ignorerait silencieusement.
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Partial<Client> = {
        firstName: draft.firstName, lastName: draft.lastName,
        email: draft.email, phone: draft.phone,
        clientType: (draft as any).clientType || "particulier",
        companyName: (draft as any).clientType === "entreprise" ? ((draft as any).companyName || null) : null,
        companySiret: (draft as any).clientType === "entreprise" ? ((draft as any).companySiret || null) : null,
        ...(fullAccess ? {
          dateOfBirth: draft.dateOfBirth, address: draft.address,
          postalCode: (draft as any).postalCode || null,
          city: (draft as any).city || null,
          allergies: draft.allergies, antecedents: draft.antecedents,
          lifestyleNotes: draft.lifestyleNotes, penseBete: draft.penseBete,
          heightCm: (draft as any).heightCm || null,
          weightKg: (draft as any).weightKg || null,
        } : {}),
      } as Partial<Client>;
      return apiRequest("PATCH", `/api/clients/${cid}`, payload);
    },
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
          kind: uploadKindRef.current,
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
    return <AppLayout><Loading variant="cards" count={3} label="Chargement de la fiche client…" /></AppLayout>;
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
            <Button variant="outline" size="sm" className="rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={async () => {
                if (!(await confirm({ title: "Supprimer cette fiche client ?", description: "Notes, documents, anamnèses, programmes et forfaits de ce client seront définitivement supprimés. Ses rendez-vous passés sont conservés anonymisés dans l'agenda ; ses rendez-vous futurs sont annulés.", confirmLabel: "Supprimer", cancelLabel: "Annuler", destructive: true }))) return;
                delMut.mutate();
              }} data-testid="button-delete-client">
              <Trash2 className="h-4 w-4 mr-1" /> Supprimer
            </Button>
          }
        />

        <ClientSummaryCard client={client} cid={cid} apptsCount={appts.length} notesCount={notes.length} lastApptAt={lastApptAt} anamnesesRecues={anamnesesRecues} />

        <Tabs defaultValue="timeline">
          <TabsList
            className="rounded-lg flex-nowrap overflow-x-auto sm:overflow-visible max-w-full [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
            aria-label="Sections de la fiche client"
          >
            <TabsTrigger value="timeline" data-testid="tab-timeline">Chronologie</TabsTrigger>
            <TabsTrigger value="info" data-testid="tab-info">Informations</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Historique ({notes.length})</TabsTrigger>
            <TabsTrigger value="appts" data-testid="tab-appts">Rendez-vous ({appts.length})</TabsTrigger>
            <TabsTrigger value="anamneses" data-testid="tab-anamneses">Anamnèses ({anamneses.length})</TabsTrigger>
            <TabsTrigger value="programmes" data-testid="tab-programmes">Programmes ({programmes.length})</TabsTrigger>
            <TabsTrigger value="forfaits" data-testid="tab-forfaits">Forfaits ({forfaits.length})</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">Documents ({documents.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            {timeline.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Aucun événement pour cette cliente"
                description="Créez un rendez-vous pour commencer à suivre son parcours."
                action={
                  <Link href="/app/agenda">
                    <Button size="sm" className="rounded-lg font-bold" data-testid="button-timeline-new-appt">
                      <CalendarPlus className="h-4 w-4 mr-1" /> Nouveau RDV
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {timeline.map(item => {
                  if (item.kind === "appt") {
                    const a = item.appt;
                    const cat = categories.find(c => c.id === a.categoryId);
                    return (
                      <li key={`appt-${a.id}`} className="card-naturo flex items-start gap-3" data-testid={`timeline-appt-${a.id}`}>
                        <Calendar className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="font-bold">{formatDay(a.startAt)} • {formatTime(a.startAt)}</p>
                            <StatusBadge domain="appointment" status={a.status} />
                          </div>
                          <p className="text-sm font-semibold text-heading mt-0.5">{cat?.name || "Rendez-vous"}</p>
                          <p className="text-sm text-muted-foreground">
                            Durée : {durationLabel(Math.round((a.endAt - a.startAt) / 60000))}
                            {cat ? ` • ${formatPrice(cat.priceCents)}` : ""}
                          </p>
                        </div>
                      </li>
                    );
                  }
                  if (item.kind === "discussion") {
                    const d = item.discussion;
                    return (
                      <Link
                        key={`disc-${d.id}`}
                        href={`/app/chat/${d.id}`}
                        className="card-naturo flex items-start gap-3 hover:border-primary hover:bg-secondary/30 transition-colors"
                        data-testid={`timeline-discussion-${d.id}`}
                      >
                        <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold">{formatDay(d.updatedAt)}</p>
                          <p className="text-sm font-semibold text-heading mt-0.5">Échange Naturobot — {d.title}</p>
                        </div>
                      </Link>
                    );
                  }
                  const n = item.note;
                  const noteTitle = n.motif || "Note de consultation";
                  const noteBody = [n.anamnese, n.bilan, n.notesLibres].filter(Boolean).join(" ");
                  const noteSummary = noteBody.length > 140 ? `${noteBody.slice(0, 140)}…` : noteBody;
                  return (
                    <Link
                      key={`note-${n.id}`}
                      href={`/app/notes/${n.appointmentId}`}
                      className="card-naturo flex items-start gap-3 hover:border-primary hover:bg-secondary/30 transition-colors"
                      data-testid={`timeline-note-${n.id}`}
                    >
                      <FileText className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{formatDay(n.createdAt)}</p>
                        <p className="text-sm font-semibold text-heading mt-0.5">{noteTitle}</p>
                        {noteSummary && <p className="text-sm text-muted-foreground line-clamp-2">{noteSummary}</p>}
                      </div>
                    </Link>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="info">
            <div className="card-naturo space-y-4">
              {/* Lot 4 (action C5) — type Particulier / Entreprise pour la facturation B2B */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Type de client</Label>
                  <Select
                    value={(draft as any).clientType || "particulier"}
                    onValueChange={(v) => setDraft({ ...draft, clientType: v } as any)}
                  >
                    <SelectTrigger data-testid="select-client-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="particulier">Particulier</SelectItem>
                      <SelectItem value="entreprise">Entreprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(draft as any).clientType === "entreprise" && (
                  <>
                    <div><Label>Raison sociale</Label><Input value={(draft as any).companyName || ""} onChange={e => setDraft({ ...draft, companyName: e.target.value } as any)} data-testid="input-company-name" /></div>
                    <div><Label>SIRET</Label><Input value={(draft as any).companySiret || ""} onChange={e => setDraft({ ...draft, companySiret: e.target.value } as any)} data-testid="input-company-siret" /></div>
                  </>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Prénom</Label><Input value={draft.firstName || ""} onChange={e => setDraft({ ...draft, firstName: e.target.value })} data-testid="input-firstName" /></div>
                <div><Label>Nom</Label><Input value={draft.lastName || ""} onChange={e => setDraft({ ...draft, lastName: e.target.value })} data-testid="input-lastName" /></div>
                <div><Label>Email</Label><Input type="email" value={draft.email || ""} onChange={e => setDraft({ ...draft, email: e.target.value })} data-testid="input-email" /></div>
                <div><Label>Téléphone</Label><Input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} data-testid="input-phone" /></div>
                {fullAccess && (
                  <>
                    <div><Label>Date de naissance</Label><Input type="date" value={draft.dateOfBirth || ""} onChange={e => setDraft({ ...draft, dateOfBirth: e.target.value })} data-testid="input-dob" /></div>
                    <div><Label>Adresse</Label><Input value={draft.address || ""} onChange={e => setDraft({ ...draft, address: e.target.value })} data-testid="input-address" /></div>
                    {/* Lot 5 (QC Facture) — repris automatiquement sur les factures */}
                    <div><Label>Code postal</Label><Input value={(draft as any).postalCode || ""} onChange={e => setDraft({ ...draft, postalCode: e.target.value } as any)} data-testid="input-postal-code" /></div>
                    <div><Label>Ville</Label><Input value={(draft as any).city || ""} onChange={e => setDraft({ ...draft, city: e.target.value } as any)} data-testid="input-city" /></div>
                  </>
                )}
              </div>
              {fullAccess ? (
                <>
                  {/* Lot 4 (action P10) — morphologie : IMC + poids idéal (Creff) calculés en direct */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><Label>Taille (cm)</Label><Input type="number" min={0} max={300} value={(draft as any).heightCm ?? ""} onChange={e => setDraft({ ...draft, heightCm: e.target.value ? Number(e.target.value) : null } as any)} data-testid="input-height" /></div>
                    <div><Label>Poids (kg)</Label><Input type="number" min={0} max={500} value={(draft as any).weightKg ?? ""} onChange={e => setDraft({ ...draft, weightKg: e.target.value ? Number(e.target.value) : null } as any)} data-testid="input-weight" /></div>
                  </div>
                  {(() => {
                    const imc = computeImc(Number((draft as any).heightCm) || 0, Number((draft as any).weightKg) || 0);
                    const age = ageFromDateOfBirth(draft.dateOfBirth);
                    const pi = age != null ? poidsIdealCreff(Number((draft as any).heightCm) || 0, age) : null;
                    if (imc == null && pi == null) return null;
                    return (
                      <div className="rounded-xl bg-secondary p-3 text-sm flex flex-wrap gap-x-6 gap-y-1" data-testid="text-morphologie">
                        {imc != null && <span><strong>IMC :</strong> {imc.toLocaleString("fr-FR")} — {imcLabel(imc)}</span>}
                        {pi != null && <span><strong>Poids idéal (Creff) :</strong> ≈ {pi.toLocaleString("fr-FR")} kg</span>}
                        {pi == null && imc != null && !age && <span className="text-muted-foreground text-xs">Renseignez la date de naissance pour le poids idéal (formule de Creff).</span>}
                      </div>
                    );
                  })()}
                  <div><Label>Allergies</Label><Textarea rows={2} value={draft.allergies || ""} onChange={e => setDraft({ ...draft, allergies: e.target.value })} data-testid="input-allergies" /></div>
                  <div><Label>Antécédents</Label><Textarea rows={3} value={draft.antecedents || ""} onChange={e => setDraft({ ...draft, antecedents: e.target.value })} data-testid="input-antecedents" /></div>
                  <div><Label>Hygiène de vie</Label><Textarea rows={3} value={draft.lifestyleNotes || ""} onChange={e => setDraft({ ...draft, lifestyleNotes: e.target.value })} data-testid="input-lifestyle" /></div>
                  <div><Label>Pense-bête (privé)</Label><Textarea rows={2} value={draft.penseBete || ""} onChange={e => setDraft({ ...draft, penseBete: e.target.value })} data-testid="input-pensebete" /></div>
                </>
              ) : (
                // Lot 1 (décisions 5-6) — état bloqué explicite à la place des champs
                // santé (naissance, adresse, allergies, antécédents…), plutôt que des
                // champs vides qui perdraient la saisie à l'enregistrement.
                <FeatureGateInline
                  title="Dossier de santé — abonnement Naturo Pro"
                  description="Date de naissance, adresse, allergies, antécédents, hygiène de vie et pense-bête font partie de l'abonnement. Vos coordonnées client restent gratuites."
                  source="fiche-client-sante"
                />
              )}
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="rounded-lg font-bold" data-testid="button-save-client">
                <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>

            <div className="card-naturo mt-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-heading">Discussions avec l'assistant</h2>
                <Button size="sm" onClick={() => askMut.mutate()} disabled={askMut.isPending} className="rounded-lg" data-testid="button-ask-assistant">
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
                  <Link key={n.id} href={`/app/notes/${n.appointmentId}`} className="card-naturo block hover:border-primary hover:bg-secondary/30 transition-colors" data-testid={`note-${n.id}`}>
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

          {/* Lot 4 (action C4) — vue consolidée des anamnèses de ce client (données du module Anamnèses) */}
          <TabsContent value="anamneses">
            {anamneses.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Aucune anamnèse pour ce client"
                description="Envoyez un questionnaire depuis le module Anamnèses en l'associant à cette fiche."
                action={
                  <Link href="/app/anamnese">
                    <Button size="sm" className="rounded-lg font-bold" data-testid="button-go-anamnese">
                      <ClipboardList className="h-4 w-4 mr-1" /> Ouvrir les anamnèses
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {anamneses.map((a) => (
                  <li key={a.id} className="card-naturo flex items-center justify-between gap-3" data-testid={`client-anamnese-${a.id}`}>
                    <div>
                      <p className="font-bold">{a.submittedAt ? `Soumise le ${formatDay(a.submittedAt)}` : "En attente de réponse"}</p>
                      <p className="text-sm text-muted-foreground">Lien créé le {formatDay(a.createdAt)}</p>
                    </div>
                    {a.submittedAt
                      ? <Badge className="bg-accent/30 text-primary border-0 text-xs"><Check className="h-3 w-3 mr-1" />Reçue</Badge>
                      : <Badge variant="secondary" className="text-xs">En attente</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {anamneses.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Le détail des réponses se consulte dans <Link href="/app/anamnese" className="underline text-primary">Anamnèses</Link>.
              </p>
            )}
          </TabsContent>

          {/* Lot 4 (action C4) — vue consolidée des programmes de ce client */}
          <TabsContent value="programmes">
            {programmes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucun programme pour ce client"
                description="Créez un programme d'hygiène de vie depuis le module Programmes, ou générez-en un depuis une anamnèse reçue."
                action={
                  <Link href="/app/programmes">
                    <Button size="sm" className="rounded-lg font-bold" data-testid="button-go-programmes">
                      <FileText className="h-4 w-4 mr-1" /> Ouvrir les programmes
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {programmes.map((p) => (
                  <li key={p.id} className="card-naturo" data-testid={`client-programme-${p.id}`}>
                    <Link href="/app/programmes" className="flex items-center justify-between gap-3 hover:text-primary">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{p.title}</p>
                        <p className="text-sm text-muted-foreground">Mis à jour le {formatDay(p.updatedAt)}</p>
                      </div>
                      {p.status === "sent"
                        ? <Badge className="bg-accent/30 text-primary border-0 text-xs">Envoyé</Badge>
                        : <Badge variant="secondary" className="text-xs">Brouillon</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* Lot 5 (QC Forfait, vue 360°) — forfaits en cours du client */}
          <TabsContent value="forfaits">
            {forfaits.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucun forfait pour ce client"
                description="Créez un carnet de séances prépayées depuis le module Forfaits."
                action={
                  <Link href="/app/forfaits">
                    <Button size="sm" className="rounded-lg font-bold" data-testid="button-go-forfaits">
                      Ouvrir les forfaits
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {forfaits.map((p) => {
                  const epuise = p.usedSessions >= p.totalSessions;
                  return (
                    <li key={p.id} className="card-naturo" data-testid={`client-forfait-${p.id}`}>
                      <Link href="/app/forfaits" className="flex items-center justify-between gap-3 hover:text-primary">
                        <div className="min-w-0">
                          <p className="font-bold truncate">{p.name}</p>
                          <p className="text-sm text-muted-foreground">{p.usedSessions} / {p.totalSessions} séances utilisées</p>
                        </div>
                        {epuise
                          ? <Badge className="bg-red-100 text-red-700 border-0 text-xs">Épuisé</Badge>
                          : <Badge className="bg-accent/30 text-primary border-0 text-xs">En cours</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="documents">
            <HelpNote title="Documents client" defaultOpen={false}>
              <p>
                Stockez ici les <strong>analyses, bilans, ordonnances ou tout fichier</strong> lié à ce client.
                Les fichiers sont conservés dans votre base de données, accessibles uniquement depuis votre compte.
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
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-file-upload"
                    accept="*/*"
                  />
                  {/* Lot 4 (action C8) — import de questionnaire externe, taggé distinctement */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { uploadKindRef.current = "formulaire_externe"; fileInputRef.current?.click(); }}
                    disabled={uploading}
                    className="rounded-lg font-bold"
                    title="Rattacher un questionnaire rempli ailleurs (PDF, export Google Forms…)"
                    data-testid="button-upload-external-form"
                  >
                    <ClipboardList className="h-4 w-4 mr-2" /> Formulaire externe
                  </Button>
                  <Button
                    type="button"
                    onClick={() => { uploadKindRef.current = null; fileInputRef.current?.click(); }}
                    disabled={uploading}
                    className="rounded-lg font-bold"
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
                      <p className="font-semibold truncate flex items-center gap-2" data-testid={`text-doc-name-${doc.id}`}>
                        {doc.filename}
                        {doc.kind === "formulaire_externe" && (
                          <Badge className="bg-violet-100 text-violet-700 border-0 text-xs shrink-0">Formulaire externe</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={`/api/documents/${doc.id}/download`}
                      download={doc.filename}
                      className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      data-testid={`button-download-document-${doc.id}`}
                      title="Télécharger"
                      aria-label="Télécharger le document"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-md text-destructive border-destructive/30 hover:bg-destructive/10"
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
