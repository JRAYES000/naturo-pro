import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Calendar, FileText, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Client, Appointment, ConsultationNote } from "@shared/schema";
import { formatDate, formatDay, formatTime, durationLabel } from "@/lib/format";

export default function ClientDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const { toast } = useToast();
  const { data: client, isLoading } = useQuery<Client>({ queryKey: ["/api/clients", cid] });
  const { data: appts = [] } = useQuery<Appointment[]>({ queryKey: ["/api/clients", cid, "appointments"] });
  const { data: notes = [] } = useQuery<ConsultationNote[]>({ queryKey: ["/api/clients", cid, "notes"] });

  const [draft, setDraft] = useState<Partial<Client>>({});
  useEffect(() => { if (client) setDraft(client); }, [client]);

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/clients/${cid}`, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", cid] });
      toast({ title: "Fiche enregistrée" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/clients/${cid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client supprimé" });
      window.location.hash = "#/app/clients";
    },
  });

  if (isLoading || !client) {
    return <AppLayout><div className="space-y-3"><Skeleton className="h-8 w-72" /><Skeleton className="h-64" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <Link href="/app/clients" className="text-sm text-muted-foreground inline-flex items-center gap-2 mb-4 hover:text-primary" data-testid="link-back-clients">
          <ArrowLeft className="h-4 w-4" /> Tous les clients
        </Link>

        <div className="flex flex-wrap items-center gap-4 justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-secondary text-primary flex items-center justify-center text-2xl font-extrabold">
              {client.firstName[0]}{client.lastName[0]}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold" style={{ color: "#1b4332" }}>{client.firstName} {client.lastName}</h1>
              {client.dateOfBirth && <p className="text-sm text-muted-foreground">Né(e) le {new Date(client.dateOfBirth).toLocaleDateString("fr-FR")}</p>}
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-[12px] text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { if (confirm("Supprimer cette fiche client ?")) delMut.mutate(); }} data-testid="button-delete-client">
            <Trash2 className="h-4 w-4 mr-1" /> Supprimer
          </Button>
        </div>

        <Tabs defaultValue="info">
          <TabsList className="rounded-[12px]">
            <TabsTrigger value="info" data-testid="tab-info">Informations</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Historique ({notes.length})</TabsTrigger>
            <TabsTrigger value="appts" data-testid="tab-appts">Rendez-vous ({appts.length})</TabsTrigger>
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
          </TabsContent>

          <TabsContent value="history">
            {notes.length === 0 ? (
              <div className="card-naturo text-center py-12">
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-bold mb-1">Aucune note pour ce client</p>
                <p className="text-sm text-muted-foreground">Les notes des consultations apparaîtront ici.</p>
              </div>
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
              <div className="card-naturo text-center py-12">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-bold mb-1">Aucun rendez-vous</p>
              </div>
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
        </Tabs>
      </div>
    </AppLayout>
  );
}
