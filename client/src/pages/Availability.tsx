import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Clock, CalendarCheck, CopyPlus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { SubNav, PAGE_PUBLIQUE_TABS } from "@/components/SubNav";
import { HelpNote, HelpTip } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AvailabilitySlot, BlockedDate } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { CalendarOff } from "lucide-react";

const DAYS = [
  { dow: 1, label: "Lundi" },
  { dow: 2, label: "Mardi" },
  { dow: 3, label: "Mercredi" },
  { dow: 4, label: "Jeudi" },
  { dow: 5, label: "Vendredi" },
  { dow: 6, label: "Samedi" },
  { dow: 0, label: "Dimanche" },
];

type DraftSlot = { dayOfWeek: number; startTime: string; endTime: string };

const STANDARD_WEEK_PRESET: DraftSlot[] = [1, 2, 3, 4, 5].flatMap(dow => [
  { dayOfWeek: dow, startTime: "09:00", endTime: "12:00" },
  { dayOfWeek: dow, startTime: "14:00", endTime: "18:00" },
]);

/** Normalise une liste de plages pour comparaison : tri stable par jour puis heures. */
function normalize(list: DraftSlot[]): string {
  const sorted = [...list]
    .map(s => [s.dayOfWeek, s.startTime, s.endTime] as const)
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  return JSON.stringify(sorted);
}

type ValidationError = { dow: number; index: number; message: string };

/** Valide le draft : heure de fin > heure de début, et pas de chevauchement entre plages d'un même jour. */
function validateDraft(draft: DraftSlot[]): ValidationError[] {
  const errors: ValidationError[] = [];

  draft.forEach((s, index) => {
    if (s.endTime <= s.startTime) {
      errors.push({ dow: s.dayOfWeek, index, message: "L'heure de fin doit être après l'heure de début" });
    }
  });

  for (const day of DAYS) {
    const dayIdx = draft.map((s, i) => ({ s, i })).filter(({ s }) => s.dayOfWeek === day.dow);
    for (let a = 0; a < dayIdx.length; a++) {
      for (let b = a + 1; b < dayIdx.length; b++) {
        const s1 = dayIdx[a].s;
        const s2 = dayIdx[b].s;
        const overlap = s1.startTime < s2.endTime && s2.startTime < s1.endTime;
        if (overlap) {
          const msg = "Chevauchement avec une autre plage de ce jour";
          if (!errors.some(e => e.index === dayIdx[a].i && e.message === msg)) {
            errors.push({ dow: day.dow, index: dayIdx[a].i, message: msg });
          }
          if (!errors.some(e => e.index === dayIdx[b].i && e.message === msg)) {
            errors.push({ dow: day.dow, index: dayIdx[b].i, message: msg });
          }
        }
      }
    }
  }

  return errors;
}

export default function Availability() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: slots = [] } = useQuery<AvailabilitySlot[]>({ queryKey: ["/api/availability"] });
  const [draft, setDraft] = useState<DraftSlot[]>([]);
  const [copyMenuFor, setCopyMenuFor] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (slots.length || draft.length === 0) {
      setDraft(slots.map(s => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })));
    }
  }, [slots]);

  const serverSlots = useMemo<DraftSlot[]>(
    () => slots.map(s => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })),
    [slots]
  );

  const isDirty = useMemo(() => normalize(draft) !== normalize(serverSlots), [draft, serverSlots]);
  const errors = useMemo(() => validateDraft(draft), [draft]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/availability", draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability"] });
      toast({ title: "Disponibilités enregistrées", variant: "success" });
    },
    onError: (e: Error) => {
      toast({ title: "Impossible d'enregistrer", description: e.message, variant: "destructive" });
    },
  });

  const saveDisabled = (!isDirty && !saveMut.isPending) || errors.length > 0 || saveMut.isPending;

  function add(dow: number) {
    setDraft([...draft, { dayOfWeek: dow, startTime: "09:00", endTime: "12:00" }]);
  }
  function update(idx: number, patch: any) {
    setDraft(draft.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function remove(idx: number) {
    setDraft(draft.filter((_, i) => i !== idx));
  }

  async function applyStandardPreset() {
    if (draft.length > 0 && !isDirty) {
      const ok = await confirm({
        title: "Remplacer vos disponibilités actuelles par ce modèle ?",
        destructive: true,
      });
      if (!ok) return;
    }
    setDraft(STANDARD_WEEK_PRESET);
  }

  function openCopyMenu(dow: number) {
    setCopyMenuFor(dow);
    setCopyTargets(new Set());
  }
  function toggleCopyTarget(dow: number) {
    setCopyTargets(prev => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow); else next.add(dow);
      return next;
    });
  }
  function applyCopy(sourceDow: number) {
    const sourceSlots = draft.filter(s => s.dayOfWeek === sourceDow).map(s => ({ startTime: s.startTime, endTime: s.endTime }));
    setDraft(prev => {
      const withoutTargets = prev.filter(s => !copyTargets.has(s.dayOfWeek));
      const copied = Array.from(copyTargets).flatMap(dow =>
        sourceSlots.map(s => ({ dayOfWeek: dow, startTime: s.startTime, endTime: s.endTime }))
      );
      return [...withoutTargets, ...copied];
    });
    setCopyMenuFor(null);
    setCopyTargets(new Set());
  }

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <SubNav group="page-publique" tabs={PAGE_PUBLIQUE_TABS} />
        <PageHeader
          title="Disponibilités"
          subtitle="Vos plages horaires d'ouverture, par jour de la semaine."
          icon={Clock}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={applyStandardPreset}
                className="rounded-lg font-bold"
                data-testid="button-preset-standard"
              >
                <CalendarCheck className="h-4 w-4 mr-1" /> Appliquer « Lun-Ven 9h-18h »
              </Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveDisabled} className="rounded-lg font-bold" data-testid="button-save-availability">
                {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          }
        />

        {isDirty && (
          <div className="card-naturo mb-4 flex flex-wrap items-center justify-between gap-3 border border-amber-300 bg-amber-50/60 py-3" data-testid="banner-dirty">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-1">
                Modifications non enregistrées
              </span>
              {errors.length > 0 && (
                <span className="text-xs font-bold text-destructive bg-destructive/10 rounded-full px-2 py-1" data-testid="text-error-count">
                  {errors.length} erreur{errors.length > 1 ? "s" : ""} à corriger
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveDisabled}
              className="rounded-lg font-bold"
              data-testid="button-save-availability-banner"
            >
              {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        )}

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
              <li>Utilisez <strong>« Copier sur… »</strong> pour dupliquer les plages d'un jour vers d'autres jours.</li>
              <li>Cliquez sur <strong>« Enregistrer »</strong> en haut à droite.</li>
            </ol>
          </div>
          <HelpTip>Vous pouvez modifier vos disponibilités à tout moment : les changements s'appliquent aussitôt.</HelpTip>
        </HelpNote>

        <div className="card-naturo space-y-4">
          {DAYS.map(d => {
            const daySlots = draft.map((s, i) => ({ s, i })).filter(({ s }) => s.dayOfWeek === d.dow);
            return (
              <div key={d.dow} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-primary">{d.label}</h3>
                  <div className="flex items-center gap-3">
                    {daySlots.length > 0 && (
                      <button
                        onClick={() => (copyMenuFor === d.dow ? setCopyMenuFor(null) : openCopyMenu(d.dow))}
                        className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        data-testid={`button-copy-from-${d.dow}`}
                      >
                        <CopyPlus className="h-3.5 w-3.5" /> Copier sur…
                      </button>
                    )}
                    <button onClick={() => add(d.dow)} className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid={`button-add-${d.dow}`}>
                      <Plus className="h-3.5 w-3.5" /> Ajouter une plage
                    </button>
                  </div>
                </div>

                {copyMenuFor === d.dow && (
                  <div className="mb-3 rounded-md border border-border bg-muted/40 p-3" data-testid={`panel-copy-${d.dow}`}>
                    <p className="text-xs font-semibold text-foreground mb-2">
                      Copier les plages de {d.label} vers :
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                      {DAYS.filter(target => target.dow !== d.dow).map(target => (
                        <label key={target.dow} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={copyTargets.has(target.dow)}
                            onCheckedChange={() => toggleCopyTarget(target.dow)}
                            data-testid={`checkbox-copy-target-${target.dow}`}
                          />
                          {target.label}
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => applyCopy(d.dow)}
                        disabled={copyTargets.size === 0}
                        className="rounded-lg font-bold"
                        data-testid={`button-copy-apply-${d.dow}`}
                      >
                        Appliquer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCopyMenuFor(null)} data-testid={`button-copy-cancel-${d.dow}`}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}

                {daySlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Aucune disponibilité ce jour-là.</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map(({ s, i }) => {
                      const slotErrors = errors.filter(e => e.index === i);
                      const hasError = slotErrors.length > 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={s.startTime}
                              onChange={e => update(i, { startTime: e.target.value })}
                              className={`w-32 rounded-md ${hasError ? "border-destructive" : ""}`}
                              data-testid={`input-start-${i}`}
                            />
                            <span className="text-muted-foreground">–</span>
                            <Input
                              type="time"
                              value={s.endTime}
                              onChange={e => update(i, { endTime: e.target.value })}
                              className={`w-32 rounded-md ${hasError ? "border-destructive" : ""}`}
                              data-testid={`input-end-${i}`}
                            />
                            <button onClick={() => remove(i)} aria-label="Supprimer la plage horaire" className="h-9 w-9 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid={`button-remove-${i}`}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {slotErrors.map((e, ei) => (
                            <p key={ei} className="text-xs text-destructive font-semibold mt-1" data-testid={`text-error-${i}`}>
                              {e.message}
                            </p>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Lot 5 (QC Disponibilité) — dates bloquées : congés et fermetures
            ponctuelles, sans démonter le planning hebdomadaire. */}
        <BlockedDatesSection />
      </div>
    </AppLayout>
  );
}

// ─── Lot 5 (QC Disponibilité) — section « Dates bloquées » ────────────────────
function BlockedDatesSection() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: blocked = [] } = useQuery<BlockedDate[]>({ queryKey: ["/api/blocked-dates"] });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/blocked-dates", {
      startDate,
      endDate: endDate || startDate,
      reason: reason.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      setStartDate(""); setEndDate(""); setReason("");
      toast({ title: "Période bloquée", description: "Aucun créneau ne sera proposé sur ces dates à la réservation en ligne.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/blocked-dates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      toast({ title: "Blocage retiré", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="card-naturo mt-8" data-testid="section-blocked-dates">
      <div className="flex items-center gap-2 mb-2">
        <CalendarOff className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-heading">Dates bloquées (congés, absences)</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Bloquez une période ponctuelle (vacances, formation…) : aucun créneau n'est proposé à la réservation
        en ligne sur ces dates, sans toucher à votre planning hebdomadaire.
      </p>

      <div className="grid sm:grid-cols-4 gap-3 items-end mb-4">
        <div>
          <Label>Du</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-blocked-start" />
        </div>
        <div>
          <Label>Au (inclus)</Label>
          <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} data-testid="input-blocked-end" />
        </div>
        <div>
          <Label>Motif (optionnel)</Label>
          <Input placeholder="Vacances, formation…" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-blocked-reason" />
        </div>
        <Button
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending || !startDate}
          className="rounded-lg font-bold"
          data-testid="button-add-blocked"
        >
          <Plus className="h-4 w-4 mr-1" /> Bloquer
        </Button>
      </div>

      {blocked.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aucune période bloquée pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {blocked.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-2.5" data-testid={`blocked-date-${b.id}`}>
              <div className="text-sm">
                <span className="font-bold">
                  {b.startDate === b.endDate ? fmt(b.startDate) : `${fmt(b.startDate)} → ${fmt(b.endDate)}`}
                </span>
                {b.reason && <span className="text-muted-foreground"> — {b.reason}</span>}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-md text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={async () => {
                  if (!(await confirm({ title: "Retirer ce blocage ?", description: "Les créneaux redeviendront réservables sur cette période.", confirmLabel: "Retirer", cancelLabel: "Annuler" }))) return;
                  delMut.mutate(b.id);
                }}
                aria-label="Retirer le blocage"
                data-testid={`button-delete-blocked-${b.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
