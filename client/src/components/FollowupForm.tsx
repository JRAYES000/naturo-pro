/**
 * FollowupForm — ajout d'une entrée au journal de suivi d'une cliente (appel,
 * email, message, rencontre, note), datée du jour par défaut. Les entrées
 * s'affichent dans la chronologie de la fiche.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const FOLLOWUP_META: Record<string, { label: string }> = {
  appel: { label: "Appel" },
  email: { label: "Email" },
  message: { label: "Message" },
  rencontre: { label: "Rencontre" },
  note: { label: "Note de suivi" },
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function FollowupForm({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const [kind, setKind] = useState("appel");
  const [date, setDate] = useState(today());
  const [content, setContent] = useState("");

  const addMut = useMutation({
    mutationFn: async () => {
      // Jour choisi à l'heure courante (un suivi du jour garde l'ordre de saisie).
      const now = new Date();
      const [y, m, d] = date.split("-").map(Number);
      const occurredAt = date === today() ? now.getTime() : new Date(y, m - 1, d, 12, 0).getTime();
      return (await apiRequest("POST", `/api/clients/${clientId}/followups`, { kind, content: content.trim(), occurredAt })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "followups"] });
      setContent("");
      toast({ title: "Ajouté au journal de suivi", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="card-naturo mb-4" data-testid="form-followup">
      <p className="text-sm font-semibold text-foreground mb-2">Journal de suivi</p>
      <div className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr]">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="Type de suivi" data-testid="select-followup-kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(FOLLOWUP_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} aria-label="Date" data-testid="input-followup-date" />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={1}
          maxLength={5000}
          placeholder="Ex. : rappelée pour le bilan, elle souhaite un RDV en janvier"
          className="min-h-10"
          data-testid="input-followup-content"
        />
      </div>
      <div className="flex justify-end mt-2">
        <Button size="sm" onClick={() => addMut.mutate()} disabled={!content.trim() || addMut.isPending} className="rounded-md font-bold" data-testid="button-add-followup">
          <Plus className="h-4 w-4 mr-1" /> Ajouter
        </Button>
      </div>
    </div>
  );
}
