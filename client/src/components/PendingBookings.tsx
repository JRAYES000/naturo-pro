/**
 * PendingBookings — demandes de rendez-vous en attente de validation (option
 * « Valider chaque demande »). Accepter envoie la confirmation à la cliente ;
 * refuser la prévient, avec un message facultatif. Sans réponse sous 48 h,
 * la demande expire d'elle-même.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Appointment } from "@shared/schema";

function when(ms: number) {
  return new Date(ms).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export function PendingBookings() {
  const { toast } = useToast();
  // Toujours frais : une demande arrive à tout moment et expire en 48 h.
  const { data: pending = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/pending"],
    staleTime: 0,
    refetchInterval: 2 * 60 * 1000,
  });
  const [refusing, setRefusing] = useState<Appointment | null>(null);
  const [message, setMessage] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/appointments/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
  };
  const acceptMut = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/appointments/${id}/accept`, {}),
    onSuccess: () => { refresh(); toast({ title: "Rendez-vous confirmé", description: "La cliente reçoit sa confirmation.", variant: "success" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  const refuseMut = useMutation({
    mutationFn: async ({ id, msg }: { id: number; msg: string }) => apiRequest("POST", `/api/appointments/${id}/refuse`, { message: msg || undefined }),
    onSuccess: () => {
      refresh();
      setRefusing(null);
      setMessage("");
      toast({ title: "Demande refusée", description: "La cliente est prévenue.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  if (pending.length === 0) return null;

  return (
    <div className="card-naturo mb-6 border-amber-300 bg-amber-50/60" data-testid="card-pending-bookings">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-5 w-5 text-amber-700" />
        <h2 className="text-heading">
          {pending.length === 1 ? "1 demande de rendez-vous à valider" : `${pending.length} demandes de rendez-vous à valider`}
        </h2>
      </div>
      <ul className="space-y-2">
        {pending.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2" data-testid={`pending-${a.id}`}>
            <div className="text-sm">
              <p className="font-semibold text-foreground">{`${a.clientFirstName || ""} ${a.clientLastName || ""}`.trim() || "Cliente"}</p>
              <p className="text-muted-foreground">{when(a.startAt)}{a.clientEmail ? ` · ${a.clientEmail}` : ""}</p>
              {a.notesBefore && <p className="text-muted-foreground italic">« {a.notesBefore} »</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-md font-bold" onClick={() => acceptMut.mutate(a.id)} disabled={acceptMut.isPending} data-testid={`button-accept-${a.id}`}>
                <Check className="h-4 w-4 mr-1" /> Accepter
              </Button>
              <Button size="sm" variant="outline" className="rounded-md" onClick={() => setRefusing(a)} data-testid={`button-refuse-${a.id}`}>
                <X className="h-4 w-4 mr-1" /> Refuser
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!refusing} onOpenChange={(o) => { if (!o) setRefusing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la demande</DialogTitle>
            <DialogDescription>La cliente reçoit un email avec un lien pour choisir un autre créneau.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Message facultatif (ex. : je vous propose plutôt jeudi matin)"
            data-testid="input-refuse-message"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusing(null)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => refusing && refuseMut.mutate({ id: refusing.id, msg: message.trim() })}
              disabled={refuseMut.isPending}
              data-testid="button-confirm-refuse"
            >
              Refuser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
