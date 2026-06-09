import { useParams } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, FileText } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Appointment, ConsultationNote } from "@shared/schema";
import { formatDay, formatTime } from "@/lib/format";

const FIELDS: Array<[keyof Draft, string, string]> = [
  ["motif", "Motif de consultation", "Pourquoi le client vient aujourd'hui."],
  ["anamnese", "Anamnèse", "Antécédents, contexte de vie, terrain."],
  ["bilan", "Bilan / observations", "Vos hypothèses, terrain, déséquilibres."],
  ["conseilsAlimentaires", "Conseils alimentaires", "Recommandations diététiques personnalisées."],
  ["hygieneDeVie", "Hygiène de vie", "Sommeil, sport, gestion du stress, respiration."],
  ["suivi", "Suivi proposé", "Prochain RDV, ressources, objectifs."],
];

type Draft = Pick<ConsultationNote, "motif" | "anamnese" | "bilan" | "conseilsAlimentaires" | "hygieneDeVie" | "suivi" | "notesLibres">;

export default function ConsultationNotePage() {
  const { appointmentId } = useParams();
  const apptId = Number(appointmentId);
  const { data: appt } = useQuery<Appointment>({ queryKey: ["/api/appointments", apptId],
    queryFn: async () => (await apiRequest("GET", `/api/appointments`)).json().then(arr => arr.find((a: Appointment) => a.id === apptId)),
  });
  const { data: existing, isLoading } = useQuery<ConsultationNote | null>({
    queryKey: ["/api/appointments", apptId, "note"],
    queryFn: async () => (await apiRequest("GET", `/api/appointments/${apptId}/note`)).json(),
  });

  const [draft, setDraft] = useState<Draft>({
    motif: "", anamnese: "", bilan: "", conseilsAlimentaires: "", hygieneDeVie: "", suivi: "", notesLibres: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const initialized = useRef(false);
  const debounceRef = useRef<any>();

  useEffect(() => {
    if (existing && !initialized.current) {
      setDraft({
        motif: existing.motif || "",
        anamnese: existing.anamnese || "",
        bilan: existing.bilan || "",
        conseilsAlimentaires: existing.conseilsAlimentaires || "",
        hygieneDeVie: existing.hygieneDeVie || "",
        suivi: existing.suivi || "",
        notesLibres: existing.notesLibres || "",
      });
      initialized.current = true;
    } else if (existing === null && !initialized.current) {
      initialized.current = true;
    }
  }, [existing]);

  function onChange<K extends keyof Draft>(k: K, v: string) {
    setDraft(prev => ({ ...prev, [k]: v }));
    setStatus("saving");
    clearTimeout(debounceRef.current);
    const next = { ...draft, [k]: v };
    debounceRef.current = setTimeout(async () => {
      try {
        await apiRequest("POST", `/api/appointments/${apptId}/note`, next);
        queryClient.invalidateQueries({ queryKey: ["/api/appointments", apptId, "note"] });
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch { setStatus("idle"); }
    }, 800);
  }

  if (isLoading) return <AppLayout><Skeleton className="h-96" aria-busy="true" /></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <PageHeader
          title="Note de consultation"
          subtitle={appt ? `${appt.clientFirstName} ${appt.clientLastName} • ${formatDay(appt.startAt)} • ${formatTime(appt.startAt)}` : undefined}
          icon={FileText}
          backTo={{ href: "/app/agenda", label: "Retour" }}
          actions={
            <div className="text-sm text-muted-foreground flex items-center gap-2" data-testid="status-save">
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</>}
              {status === "saved" && <span className="text-primary inline-flex items-center gap-1"><Check className="h-4 w-4" /> Enregistré</span>}
            </div>
          }
        />

        <div className="card-naturo space-y-5">
          {FIELDS.map(([key, label, hint]) => (
            <div key={key as string}>
              <Label className="font-bold">{label}</Label>
              <p className="text-xs text-muted-foreground mb-1">{hint}</p>
              <Textarea
                rows={3}
                value={(draft[key] || "") as string}
                onChange={e => onChange(key, e.target.value)}
                className="rounded-[10px]"
                data-testid={`input-${key as string}`}
              />
            </div>
          ))}
          <div>
            <Label className="font-bold">Notes libres</Label>
            <p className="text-xs text-muted-foreground mb-1">Ce que vous voulez ajouter d'autre.</p>
            <Textarea rows={5} value={draft.notesLibres || ""} onChange={e => onChange("notesLibres", e.target.value)} className="rounded-[10px]" data-testid="input-notesLibres" />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
