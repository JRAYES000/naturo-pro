import { useMemo, useState } from "react";
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileText, Receipt, Send, CalendarArrowDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Appointment, AppointmentCategory, Client } from "@shared/schema";
import { formatPrice, durationLabel } from "@/lib/format";

const locales = { fr };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales,
});

const messages = {
  allDay: "Journée",
  previous: "Précédent",
  next: "Suivant",
  today: "Aujourd'hui",
  month: "Mois",
  week: "Semaine",
  day: "Jour",
  agenda: "Agenda",
  date: "Date",
  time: "Heure",
  event: "Événement",
  noEventsInRange: "Aucun rendez-vous sur cette période.",
};

export default function Agenda() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [resendDialog, setResendDialog] = useState(false);
  const [creating, setCreating] = useState<{ start: Date; end: Date } | null>(null);

  const { data: appts = [] } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: cats = [] } = useQuery<AppointmentCategory[]>({ queryKey: ["/api/categories"] });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const events = useMemo(() => appts
    .filter(a => a.status !== "cancelled")
    .map(a => {
      const aAny = a as any;
      let prefix = "";
      if (aAny.clientCancelledAt) prefix = "✕ ";
      else if (aAny.clientConfirmedAt) prefix = "✓ ";
      return {
        id: a.id,
        title: `${prefix}${a.clientFirstName || "—"} ${a.clientLastName || ""} · ${cats.find(c => c.id === a.categoryId)?.name || ""}`,
        start: new Date(a.startAt),
        end: new Date(a.endAt),
        resource: a,
      };
    }), [appts, cats]);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Rendez-vous supprimé" });
      setSelected(null);
    },
  });

  const sendReminderMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/appointments/${id}/send-reminder`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: `Rappel envoyé à ${selected?.clientEmail || "la cliente"}` });
      setResendDialog(false);
    },
    onError: (e: any) => {
      toast({ title: "Erreur envoi", description: e?.message || "Impossible d'envoyer le rappel", variant: "destructive" });
      setResendDialog(false);
    },
  });

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-extrabold" style={{ color: "#1b4332" }}>Agenda</h1>
          <Button onClick={() => setCreating({ start: new Date(), end: new Date(Date.now() + 60 * 60000) })} className="rounded-[15px] font-bold" data-testid="button-new-appointment">
            <Plus className="h-4 w-4 mr-1" /> Nouveau RDV
          </Button>
        </div>

        <div className="card-naturo p-4">
          <BigCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            culture="fr"
            messages={messages}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            defaultView={Views.WEEK}
            min={new Date(0,0,0,7,0)}
            max={new Date(0,0,0,21,0)}
            step={30}
            timeslots={2}
            style={{ height: "70vh" }}
            onSelectEvent={(e: any) => setSelected(e.resource)}
            selectable
            onSelectSlot={({ start, end }: any) => setCreating({ start, end })}
            eventPropGetter={(event: any) => {
              const r = event.resource;
              // Imported Google events (no category) → gray
              if (r.source === "google") {
                return { style: { backgroundColor: r.status === "blocked" ? "#9ca3af" : "#6b7280", borderLeft: "3px solid #1f2937" } };
              }
              // Annulation client : barré + opacité réduite
              if (r.clientCancelledAt) {
                return { style: { backgroundColor: "#dc2626", textDecoration: "line-through", opacity: 0.65 } };
              }
              const cat = cats.find(c => c.id === r.categoryId);
              const baseStyle: any = { backgroundColor: cat?.color || "#186749" };
              // Confirmation client : bordure verte plus marquée
              if (r.clientConfirmedAt) {
                baseStyle.borderLeft = "4px solid #15803d";
                baseStyle.fontWeight = 600;
              }
              return { style: baseStyle };
            }}
            data-testid="calendar-agenda"
          />
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          {selected && (() => {
            const cat = cats.find(c => c.id === selected.categoryId);
            return (
              <div>
                <DialogHeader><DialogTitle>{selected.clientFirstName} {selected.clientLastName}</DialogTitle></DialogHeader>
                <div className="space-y-2 text-sm py-3">
                  <p><strong>Date :</strong> {new Date(selected.startAt).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}</p>
                  <p><strong>Prestation :</strong> {cat?.name} — {durationLabel(cat?.durationMinutes || 60)} — {formatPrice(cat?.priceCents || 0)}</p>
                  {selected.clientEmail && <p><strong>Email :</strong> {selected.clientEmail}</p>}
                  {selected.clientPhone && <p><strong>Téléphone :</strong> {selected.clientPhone}</p>}
                  <p><strong>Lieu :</strong> {selected.location}</p>
                  {(selected as any).googleMeetLink && (
                    <p>
                      <strong>Lien visio :</strong>{" "}
                      <a
                        href={(selected as any).googleMeetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline break-all"
                        data-testid="link-meet"
                      >
                        {(selected as any).googleMeetLink}
                      </a>
                    </p>
                  )}
                  <p><strong>Statut :</strong> {selected.status}{(selected as any).clientConfirmedAt ? " — ✓ confirmé par la cliente" : ""}{(selected as any).clientCancelledAt ? " — ✕ annulé par la cliente" : ""}</p>
                  {(selected as any).reminderSentAt && (
                    <p className="text-xs text-muted-foreground">✉ Rappel envoyé le {new Date((selected as any).reminderSentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>
                  )}
                  <p><strong>Paiement :</strong> {selected.paymentStatus === "paid" ? "Payé" : selected.paymentStatus === "partial" ? "Partiel" : "Non payé"}{selected.paymentAmountCents ? ` — ${formatPrice(selected.paymentAmountCents)}` : ""}</p>
                  {selected.source === "google" && (
                    <p className="text-xs text-muted-foreground italic">⚡ Importé depuis Google Calendar (lecture seule)</p>
                  )}
                  {selected.notesBefore && <p><strong>Notes :</strong> {selected.notesBefore}</p>}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {selected.clientId && (
                    <Link href={`/app/notes/${selected.id}`}>
                      <Button size="sm" className="rounded-[12px]" data-testid="button-open-note"><FileText className="h-4 w-4 mr-1" /> Note de consultation</Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-[12px]"
                    data-testid="button-create-invoice"
                    onClick={() => {
                      navigate(`/app/invoices/new?fromAppointment=${selected.id}`);
                    }}
                  >
                    <Receipt className="h-4 w-4 mr-1" /> Créer une facture
                  </Button>
                  {selected.clientEmail && selected.startAt > Date.now() && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-[12px]"
                        data-testid={`button-send-reminder-${selected.id}`}
                        disabled={sendReminderMut.isPending}
                        onClick={() => {
                          if ((selected as any).reminderSent) {
                            setResendDialog(true);
                          } else {
                            sendReminderMut.mutate(selected.id);
                          }
                        }}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        {sendReminderMut.isPending ? "Envoi…" : "Envoyer le rappel"}
                      </Button>
                      {(selected as any).reminderSent && (
                        <Badge className="bg-green-600 text-white text-xs">Envoyé</Badge>
                      )}
                    </div>
                  )}
                  <a
                    href={`/api/appointments/${selected.id}/ics`}
                    download={`rdv-${selected.id}.ics`}
                    data-testid="button-ics"
                  >
                    <Button size="sm" variant="outline" className="rounded-[12px]">
                      <CalendarArrowDown className="h-4 w-4 mr-1" /> Ajouter à mon agenda (.ics)
                    </Button>
                  </a>
                  <Button size="sm" variant="destructive" onClick={() => deleteMut.mutate(selected.id)} className="rounded-[12px]" data-testid="button-delete-appointment">
                    <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation re-envoi rappel */}
      <Dialog open={resendDialog} onOpenChange={setResendDialog}>
        <DialogContent data-testid="dialog-resend-reminder">
          <DialogHeader>
            <DialogTitle>Renvoyer le rappel ?</DialogTitle>
            <DialogDescription>
              Le rappel a déjà été envoyé
              {selected && (selected as any).reminderSentAt
                ? ` le ${new Date((selected as any).reminderSentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`
                : ""}
              . Voulez-vous le renvoyer à {selected?.clientEmail} ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResendDialog(false)}>Annuler</Button>
            <Button
              disabled={sendReminderMut.isPending}
              onClick={() => selected && sendReminderMut.mutate(selected.id)}
            >
              {sendReminderMut.isPending ? "Envoi…" : "Oui, renvoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewAppointmentDialog
        open={!!creating}
        initial={creating}
        cats={cats}
        clients={clients}
        onClose={() => setCreating(null)}
      />
    </AppLayout>
  );
}

function NewAppointmentDialog({ open, initial, cats, clients, onClose }: any) {
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<string>("unpaid");
  const [paymentAmount, setPaymentAmount] = useState<string>("");

  const initialDate = initial?.start ? new Date(initial.start) : new Date();
  if (open && !date) {
    setDate(initialDate.toISOString().slice(0, 10));
    setTime(initialDate.toTimeString().slice(0, 5));
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const cat = cats.find((c: AppointmentCategory) => c.id === Number(categoryId));
      if (!cat) throw new Error("Choisissez une prestation");
      const start = new Date(`${date}T${time}`);
      const startAt = start.getTime();
      const endAt = startAt + cat.durationMinutes * 60000;
      const paymentAmountCents = paymentAmount ? Math.round(parseFloat(paymentAmount.replace(",", ".")) * 100) : 0;
      let payload: any = {
        categoryId: cat.id, startAt, endAt, status: "confirmed",
        location: cat.location, notesBefore: null,
        paymentStatus, paymentAmountCents,
        source: "manual",
      };
      if (clientId) {
        const c = clients.find((x: Client) => x.id === Number(clientId));
        payload = { ...payload, clientId: c.id, clientFirstName: c.firstName, clientLastName: c.lastName, clientEmail: c.email, clientPhone: c.phone };
      } else {
        payload = { ...payload, clientId: null, clientFirstName: firstName, clientLastName: lastName, clientEmail: email, clientPhone: phone };
      }
      await apiRequest("POST", "/api/appointments", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Rendez-vous créé" });
      reset(); onClose();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  function reset() { setCategoryId(""); setClientId(""); setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setDate(""); setTime(""); setPaymentStatus("unpaid"); setPaymentAmount(""); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau rendez-vous</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Prestation</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="select-category"><SelectValue placeholder="Choisir une prestation" /></SelectTrigger>
              <SelectContent>{cats.map((c: AppointmentCategory) => <SelectItem key={c.id} value={String(c.id)}>{c.name} — {durationLabel(c.durationMinutes)} — {formatPrice(c.priceCents)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-date" /></div>
            <div><Label>Heure</Label><Input type="time" value={time} onChange={e => setTime(e.target.value)} data-testid="input-time" /></div>
          </div>
          <div>
            <Label>Client existant (optionnel)</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger data-testid="select-client"><SelectValue placeholder="— Aucun (nouveau) —" /></SelectTrigger>
              <SelectContent>{clients.map((c: Client) => <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!clientId && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prénom</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} data-testid="input-firstName" /></div>
              <div><Label>Nom</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} data-testid="input-lastName" /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-clientEmail" /></div>
              <div><Label>Téléphone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-clientPhone" /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Paiement</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger data-testid="select-payment-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Non payé</SelectItem>
                  <SelectItem value="paid">Payé</SelectItem>
                  <SelectItem value="partial">Partiel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant reçu (€)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                disabled={paymentStatus === "unpaid"}
                data-testid="input-payment-amount"
              />
            </div>
          </div>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="w-full rounded-[15px] py-5 font-bold" data-testid="button-create-appointment">
            {createMut.isPending ? "Création…" : "Créer le rendez-vous"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
