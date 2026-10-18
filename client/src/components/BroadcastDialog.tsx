/**
 * BroadcastDialog — message groupé à toutes les clientes (fermeture du cabinet,
 * atelier, changement d'adresse). Chaque cliente reçoit son email personnalisé
 * ({prenom}) avec un lien de désinscription ; les fiches archivées ou désinscrites
 * sont exclues. Essai possible vers sa propre adresse avant l'envoi.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, FlaskConical, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

interface BroadcastRow {
  id: number;
  subject: string;
  status: "sending" | "sent" | "failed";
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: number;
}
interface BroadcastInfo {
  history: BroadcastRow[];
  recipients: number;
  totalEligible: number;
  sentLast24h: number;
  maxPerDay: number;
  maxRecipients: number;
  emailReady: boolean;
}

const UNE_HEURE = 3600 * 1000;

function statusText(b: BroadcastRow): string {
  if (b.status === "sending") {
    return Date.now() - b.createdAt > UNE_HEURE ? `interrompu (${b.sentCount}/${b.recipientCount})` : `en cours… ${b.sentCount}/${b.recipientCount}`;
  }
  if (b.status === "failed") return "échec de l'envoi";
  return `${b.sentCount}/${b.recipientCount} envoyé${b.sentCount > 1 ? "s" : ""}${b.failedCount ? `, ${b.failedCount} en échec` : ""}`;
}

export function BroadcastDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Bonjour {prenom},\n\n");
  const { data: info } = useQuery<BroadcastInfo>({
    queryKey: ["/api/broadcasts"],
    enabled: open,
    // Rafraîchit le compteur tant qu'un envoi tourne.
    refetchInterval: (q) => ((q.state.data as BroadcastInfo | undefined)?.history.some((b) => b.status === "sending" && Date.now() - b.createdAt < UNE_HEURE) ? 3000 : false),
  });

  const testMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/broadcasts/test", { subject, body })).json(),
    onSuccess: (r: any) => toast({ title: "Essai envoyé", description: `Vérifiez la boîte ${r.to}.`, variant: "success" }),
    onError: (e: any) => toast({ title: "Essai impossible", description: e.message, variant: "destructive" }),
  });
  const sendMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/broadcasts", { subject, body })).json(),
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/broadcasts"] });
      toast({ title: "Envoi lancé", description: `${r.recipientCount} cliente${r.recipientCount > 1 ? "s" : ""} vont recevoir votre message.`, variant: "success" });
      setSubject("");
      setBody("Bonjour {prenom},\n\n");
    },
    onError: (e: any) => toast({ title: "Envoi impossible", description: e.message, variant: "destructive" }),
  });

  const quotaAtteint = !!info && info.sentLast24h >= info.maxPerDay;
  const pret = subject.trim().length > 0 && body.replace("Bonjour {prenom},", "").trim().length > 0;

  async function envoyer() {
    if (!info) return;
    const ok = await confirm({
      title: `Envoyer ce message à ${info.recipients} cliente${info.recipients > 1 ? "s" : ""} ?`,
      description: "L'envoi ne peut pas être annulé. Chaque email comporte un lien de désinscription.",
      confirmLabel: "Envoyer",
      cancelLabel: "Annuler",
    });
    if (ok) sendMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message à toutes les clientes</DialogTitle>
          <DialogDescription>
            {info
              ? `${info.recipients} cliente${info.recipients > 1 ? "s" : ""} avec une adresse email (fiches archivées et désinscrites exclues${info.totalEligible > info.maxRecipients ? `, limité à ${info.maxRecipients}` : ""}).`
              : "Chargement…"}
          </DialogDescription>
        </DialogHeader>

        {info && !info.emailReady && (
          <p className="text-sm text-destructive" data-testid="text-broadcast-no-email">L'envoi d'email n'est pas configuré sur ce compte.</p>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="broadcast-subject">Objet</Label>
            <Input id="broadcast-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150}
              placeholder="Ex. : fermeture du cabinet du 20 au 27 décembre" data-testid="input-broadcast-subject" />
          </div>
          <div>
            <Label htmlFor="broadcast-body">Message</Label>
            <Textarea id="broadcast-body" value={body} onChange={(e) => setBody(e.target.value)} rows={9} maxLength={10000} data-testid="input-broadcast-body" />
            <p className="text-xs text-muted-foreground mt-1">
              {"{prenom}"} est remplacé par le prénom de chaque cliente. Les liens (https://…) deviennent cliquables.
              {info ? ` ${info.maxPerDay} messages groupés par 24 h au plus.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => testMut.mutate()} disabled={!pret || testMut.isPending || !info?.emailReady} className="rounded-md font-bold" data-testid="button-broadcast-test">
              {testMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1" />} M'envoyer un essai
            </Button>
            <Button onClick={envoyer} disabled={!pret || sendMut.isPending || quotaAtteint || !info?.recipients || !info?.emailReady} className="rounded-md font-bold" data-testid="button-broadcast-send">
              {sendMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {info ? `Envoyer à ${info.recipients} cliente${info.recipients > 1 ? "s" : ""}` : "Envoyer"}
            </Button>
          </div>
          {quotaAtteint && <p className="text-xs text-amber-700 text-right">Limite de {info!.maxPerDay} messages groupés par 24 h atteinte.</p>}
        </div>

        {!!info?.history.length && (
          <div className="mt-2 border-t pt-3">
            <p className="text-sm font-semibold text-foreground mb-2">Derniers messages</p>
            <ul className="space-y-1 text-sm" data-testid="list-broadcast-history">
              {info.history.slice(0, 6).map((b) => (
                <li key={b.id} className="flex justify-between gap-3">
                  <span className="truncate">{new Date(b.createdAt).toLocaleDateString("fr-FR")} — {b.subject}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{statusText(b)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
