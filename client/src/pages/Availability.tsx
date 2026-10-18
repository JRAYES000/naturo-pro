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
import { CalendarOff, ShieldCheck } from "lucide-react";

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
        <BookingRulesSection />

        <BlockedDatesSection />
      </div>
    </AppLayout>
  );
}

// ─── Règles de réservation en ligne (parité naturooo) ────────────────────────
const NOTICE_CHOICES: Array<[number, string]> = [[0, "Aucun"], [1, "1 h"], [2, "2 h"], [4, "4 h"], [12, "12 h"], [24, "24 h"], [48, "48 h"]];
const AHEAD_CHOICES: Array<[number | null, string]> = [[14, "2 semaines"], [30, "1 mois"], [60, "2 mois"], [90, "3 mois"], [180, "6 mois"], [null, "Sans limite"]];
const CANCEL_CHOICES: Array<[number, string]> = [[0, "Jusqu'au rendez-vous"], [12, "12 h avant"], [24, "24 h avant"], [48, "48 h avant"], [72, "72 h avant"]];

function BookingRulesSection() {
  const { toast } = useToast();
  const { data } = useQuery<any>({ queryKey: ["/api/profile"] });
  const u = data?.user;
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiRequest("PATCH", "/api/profile", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Règle enregistrée", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });
  if (!u) return null;
  const minNotice = typeof u.bookingMinNoticeHours === "number" ? u.bookingMinNoticeHours : 2;
  const cancelNotice = u.bookingCancelNoticeHours || 0;
  const select = (label: string, value: string, options: Array<[number | null, string]>, onChange: (v: number | null) => void, testid: string, hint?: string) => (
    <div>
      <Label>{label}</Label>
      <select
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        data-testid={testid}
      >
        {options.map(([v, l]) => <option key={String(v)} value={v === null ? "" : String(v)}>{l}</option>)}
      </select>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="card-naturo mt-8 space-y-4" data-testid="section-booking-rules">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-heading">Règles de réservation en ligne</h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {select("Délai minimum avant un rendez-vous", String(minNotice), NOTICE_CHOICES, (v) => save.mutate({ bookingMinNoticeHours: v ?? 0 }), "select-min-notice")}
        {select("Réservable jusqu'à", u.bookingMaxDaysAhead ? String(u.bookingMaxDaysAhead) : "", AHEAD_CHOICES, (v) => save.mutate({ bookingMaxDaysAhead: v }), "select-max-ahead")}
        {select("Annulation ou report en ligne", String(cancelNotice), CANCEL_CHOICES, (v) => save.mutate({ bookingCancelNoticeHours: v ?? 0 }), "select-cancel-notice", "Passé ce délai, la cliente doit vous contacter.")}
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <Checkbox
          checked={!!u.bookingRequiresApproval}
          onCheckedChange={(v) => save.mutate({ bookingRequiresApproval: !!v })}
          data-testid="checkbox-requires-approval"
        />
        <span className="text-sm">
          <span className="font-semibold text-foreground">Valider chaque demande avant confirmation</span>
          <span className="block text-muted-foreground">
            La réservation arrive « en attente » : vous l'acceptez ou la refusez depuis le tableau de bord. Sans réponse
            sous 48 h, elle expire et la cliente est prévenue. L'acompte en ligne ne s'applique pas aux demandes à valider.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 cursor-pointer">
        <Checkbox
          checked={u.bookingNewClientsAllowed !== false}
          onCheckedChange={(v) => save.mutate({ bookingNewClientsAllowed: !!v })}
          data-testid="checkbox-new-clients"
        />
        <span className="text-sm">
          <span className="font-semibold text-foreground">Accepter les nouvelles clientes en ligne</span>
          <span className="block text-muted-foreground">
            Décoché, seules les clientes déjà enregistrées (même adresse email) peuvent réserver sur votre page.
          </span>
        </span>
      </label>
    </div>
  );
}

// ─── Indisponibilités : congés, absences, plages récurrentes ─────────────────
const WEEKDAYS: Array<[number, string]> = [[1, "L"], [2, "M"], [3, "M"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];
const WEEKDAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function BlockedDatesSection() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: blocked = [] } = useQuery<BlockedDate[]>({ queryKey: ["/api/blocked-dates"] });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("18:00");
  const [weekdays, setWeekdays] = useState<number[]>([]);

  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/blocked-dates", {
      startDate,
      endDate: endDate || startDate,
      reason: reason.trim() || null,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
      weekdays: weekdays.length ? weekdays : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      setStartDate(""); setEndDate(""); setReason(""); setWeekdays([]); setAllDay(true);
      toast({ title: "Indisponibilité ajoutée", description: "Aucun créneau ne sera proposé sur cette période à la réservation en ligne.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/blocked-dates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      toast({ title: "Indisponibilité retirée", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const describe = (b: any) => {
    const period = b.startDate === b.endDate ? fmt(b.startDate) : `${fmt(b.startDate)} → ${fmt(b.endDate)}`;
    const days = b.weekdays ? `chaque ${String(b.weekdays).split(",").map((d: string) => WEEKDAY_NAMES[Number(d)]).join(", ")}` : "";
    const hours = b.startTime && b.endTime ? `de ${b.startTime} à ${b.endTime}` : "journée entière";
    return [period, days, hours].filter(Boolean).join(" · ");
  };

  return (
    <div className="card-naturo mt-8" data-testid="section-blocked-dates">
      <div className="flex items-center gap-2 mb-2">
        <CalendarOff className="h-5 w-5 text-primary" />
        <h2 className="text-heading">Indisponibilités (congés, absences, plages récurrentes)</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Bloquez une période (vacances, formation…), une plage horaire, ou une plage qui revient chaque semaine
        (par exemple tous les mercredis après-midi jusqu'en juin) : aucun créneau n'y est proposé à la réservation en ligne.
      </p>

      <div className="grid sm:grid-cols-3 gap-3 mb-3">
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
      </div>
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(!!v)} data-testid="checkbox-blocked-all-day" />
          Journée entière
        </label>
        {!allDay && (
          <div className="flex items-end gap-2">
            <div>
              <Label>De</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-28" data-testid="input-blocked-start-time" />
            </div>
            <div>
              <Label>À</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-28" data-testid="input-blocked-end-time" />
            </div>
          </div>
        )}
        <div>
          <Label>Seulement le (facultatif)</Label>
          <div className="flex gap-1 mt-1" role="group" aria-label="Jours de la semaine">
            {WEEKDAYS.map(([d, l], idx) => {
              const on = weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_NAMES[d]}
                  onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                  className={`h-9 w-9 rounded-md border text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-secondary"}`}
                  data-testid={`button-blocked-weekday-${idx}`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending || !startDate}
          className="rounded-md font-bold"
          data-testid="button-add-blocked"
        >
          <Plus className="h-4 w-4 mr-1" /> Bloquer
        </Button>
      </div>

      {blocked.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aucune indisponibilité pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {blocked.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-2.5" data-testid={`blocked-date-${b.id}`}>
              <div className="text-sm">
                <span className="font-bold">{describe(b)}</span>
                {b.reason && <span className="text-muted-foreground"> — {b.reason}</span>}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-md text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={async () => {
                  if (!(await confirm({ title: "Retirer cette indisponibilité ?", description: "Les créneaux redeviendront réservables sur cette période.", confirmLabel: "Retirer", cancelLabel: "Annuler" }))) return;
                  delMut.mutate(b.id);
                }}
                aria-label="Retirer l'indisponibilité"
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
