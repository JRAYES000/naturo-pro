/**
 * BrevoSettings — compte Brevo de la praticienne : synchronisation des clientes
 * vers une liste de contacts (newsletter) et rappels SMS la veille du rendez-vous,
 * envoyés avec ses propres crédits SMS.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageSquareText, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BrevoState {
  connected: boolean;
  account: { email: string | null; companyName: string | null; smsCredits: number | null } | null;
  lists: Array<{ id: number; name: string; totalSubscribers: number | null }>;
  listId: number | null;
  smsSender: string | null;
  smsRemindersEnabled: boolean;
  lastSyncAt: number | null;
  lastSyncCount: number | null;
  error: string | null;
}

const KEY = ["/api/integrations/brevo"];

export function BrevoSettings() {
  const { toast } = useToast();
  const { data } = useQuery<BrevoState>({ queryKey: KEY });
  const [apiKey, setApiKey] = useState("");
  const [sender, setSender] = useState("");
  const [testPhone, setTestPhone] = useState("");
  useEffect(() => { setSender(data?.smsSender ?? ""); }, [data?.smsSender]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const fail = (e: any) => toast({ title: "Brevo", description: e.message, variant: "destructive" });

  const connect = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/brevo", { apiKey: apiKey.trim() }),
    onSuccess: () => { setApiKey(""); refresh(); toast({ title: "Brevo connecté", variant: "success" }); },
    onError: fail,
  });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("PATCH", "/api/integrations/brevo", body),
    onSuccess: () => { refresh(); toast({ title: "Réglage enregistré", variant: "success" }); },
    onError: fail,
  });
  const disconnect = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/integrations/brevo"),
    onSuccess: () => { refresh(); toast({ title: "Brevo déconnecté" }); },
    onError: fail,
  });
  const sync = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/integrations/brevo/sync", {})).json(),
    onSuccess: (r: any) => { refresh(); toast({ title: "Contacts synchronisés", description: `${r.synced} cliente(s) ajoutée(s) ou mise(s) à jour${r.failed ? `, ${r.failed} en échec` : ""}.`, variant: "success" }); },
    onError: fail,
  });
  const testSms = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/integrations/brevo/test-sms", { phone: testPhone || undefined })).json(),
    onSuccess: (r: any) => toast({ title: "SMS d'essai envoyé", description: `Destinataire : +${r.recipient}`, variant: "success" }),
    onError: fail,
  });

  return (
    <div className="card-naturo space-y-4" data-testid="section-brevo">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-5 w-5 text-heading" />
        <h2 className="font-bold">Brevo : newsletter et rappels SMS</h2>
      </div>
      {!data?.connected ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Connectez votre compte Brevo (gratuit) pour y envoyer vos clientes en liste de contacts et leur adresser
            un SMS de rappel la veille de leur rendez-vous, avec vos propres crédits SMS.
            Clé à créer dans Brevo : Paramètres → SMTP &amp; API → Clés API.
          </p>
          {data?.error && <p className="text-sm text-destructive">{data.error}</p>}
          <div className="flex gap-2">
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="xkeysib-…" autoComplete="off" data-testid="input-brevo-key" />
            <Button onClick={() => connect.mutate()} disabled={apiKey.trim().length < 20 || connect.isPending} className="rounded-md font-bold shrink-0" data-testid="button-brevo-connect">
              Connecter
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Compte <strong>{data.account?.companyName || data.account?.email || "Brevo"}</strong>
              {data.account?.smsCredits != null ? ` · ${data.account.smsCredits} crédit(s) SMS` : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={() => disconnect.mutate()} className="text-destructive" data-testid="button-brevo-disconnect">
              <Unplug className="h-4 w-4 mr-1" /> Déconnecter
            </Button>
          </div>
          {data.error && <p className="text-sm text-destructive">{data.error}</p>}

          <div className="space-y-2">
            <p className="font-semibold text-sm">Liste de contacts</p>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={data.listId ? String(data.listId) : ""} onValueChange={(v) => patch.mutate({ listId: Number(v) })}>
                <SelectTrigger className="w-64" data-testid="select-brevo-list"><SelectValue placeholder="Choisir une liste Brevo" /></SelectTrigger>
                <SelectContent>
                  {data.lists.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}{l.totalSubscribers != null ? ` (${l.totalSubscribers})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => sync.mutate()} disabled={!data.listId || sync.isPending} className="rounded-md font-bold" data-testid="button-brevo-sync">
                <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} /> Synchroniser mes clientes
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Fiches avec email, hors archivées et désinscrites des messages groupés.
              {data.lastSyncAt ? ` Dernière synchronisation le ${new Date(data.lastSyncAt).toLocaleDateString("fr-FR")} (${data.lastSyncCount} contacts).` : ""}
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-sm">Rappels SMS la veille</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <Label htmlFor="brevo-sender">Nom d'expéditeur (3 à 11 lettres ou chiffres)</Label>
                <Input id="brevo-sender" value={sender} maxLength={11} onChange={(e) => setSender(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} className="w-48" data-testid="input-brevo-sender" />
              </div>
              <Button variant="outline" onClick={() => patch.mutate({ smsSender: sender || null })} disabled={sender === (data.smsSender ?? "") || patch.isPending} className="rounded-md">
                Enregistrer
              </Button>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={data.smsRemindersEnabled} onCheckedChange={(v) => patch.mutate({ smsRemindersEnabled: v })} disabled={!data.smsSender} data-testid="switch-sms-reminders" />
              Envoyer un SMS de rappel la veille de chaque rendez-vous (à l'heure de vos rappels email)
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Votre mobile (06…)" className="w-48" data-testid="input-sms-test-phone" />
              <Button variant="outline" size="sm" onClick={() => testSms.mutate()} disabled={!data.smsSender || testSms.isPending} className="rounded-md" data-testid="button-sms-test">
                M'envoyer un SMS d'essai
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
