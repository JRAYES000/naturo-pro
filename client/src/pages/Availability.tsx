import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Clock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AvailabilitySlot } from "@shared/schema";

const DAYS = [
  { dow: 1, label: "Lundi" },
  { dow: 2, label: "Mardi" },
  { dow: 3, label: "Mercredi" },
  { dow: 4, label: "Jeudi" },
  { dow: 5, label: "Vendredi" },
  { dow: 6, label: "Samedi" },
  { dow: 0, label: "Dimanche" },
];

export default function Availability() {
  const { toast } = useToast();
  const { data: slots = [] } = useQuery<AvailabilitySlot[]>({ queryKey: ["/api/availability"] });
  const [draft, setDraft] = useState<{ dayOfWeek: number; startTime: string; endTime: string }[]>([]);

  useEffect(() => {
    if (slots.length || draft.length === 0) {
      setDraft(slots.map(s => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })));
    }
  }, [slots]);

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/availability", draft),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/availability"] }); toast({ title: "Disponibilités enregistrées", variant: "success" }); },
  });

  function add(dow: number) {
    setDraft([...draft, { dayOfWeek: dow, startTime: "09:00", endTime: "12:00" }]);
  }
  function update(idx: number, patch: any) {
    setDraft(draft.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function remove(idx: number) {
    setDraft(draft.filter((_, i) => i !== idx));
  }

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <PageHeader
          title="Disponibilités"
          subtitle="Vos plages horaires d'ouverture, par jour de la semaine."
          icon={Clock}
          actions={
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="rounded-[15px] font-bold" data-testid="button-save-availability">
              {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          }
        />

        <HelpNote>
          <p>
            Sur cette page, vous indiquez <strong>les jours et les heures où vous acceptez des
            rendez-vous</strong> (par exemple : lundi de 9h à 12h, mardi de 14h à 18h…).
          </p>
          <p>
            À partir de ces plages, l'application <strong>calcule toute seule les créneaux libres</strong>
            qui seront proposés à vos clientes sur votre page de réservation. Les créneaux déjà réservés
            n'apparaissent jamais : pas de risque de double réservation.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Comment ça marche ?</p>
            <ol>
              <li>Pour un jour donné, cliquez sur <strong>« Ajouter une plage »</strong>.</li>
              <li>Indiquez l'heure de <strong>début</strong> et l'heure de <strong>fin</strong>.</li>
              <li>Ajoutez autant de plages que nécessaire (matin, après-midi…).</li>
              <li>Cliquez sur <strong>« Enregistrer »</strong> en haut à droite.</li>
            </ol>
          </div>
          <p className="text-xs italic">
            💡 Vous pouvez modifier vos disponibilités à tout moment : les changements s'appliquent aussitôt.
          </p>
        </HelpNote>

        <div className="card-naturo space-y-4">
          {DAYS.map(d => {
            const daySlots = draft.map((s, i) => ({ s, i })).filter(({ s }) => s.dayOfWeek === d.dow);
            return (
              <div key={d.dow} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-extrabold text-primary">{d.label}</h3>
                  <button onClick={() => add(d.dow)} className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline" data-testid={`button-add-${d.dow}`}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter une plage
                  </button>
                </div>
                {daySlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Aucune disponibilité ce jour-là.</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map(({ s, i }) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" value={s.startTime} onChange={e => update(i, { startTime: e.target.value })} className="w-32 rounded-[10px]" data-testid={`input-start-${i}`} />
                        <span className="text-muted-foreground">–</span>
                        <Input type="time" value={s.endTime} onChange={e => update(i, { endTime: e.target.value })} className="w-32 rounded-[10px]" data-testid={`input-end-${i}`} />
                        <button onClick={() => remove(i)} className="p-1.5 rounded-md text-destructive hover:bg-destructive/10" data-testid={`button-remove-${i}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
