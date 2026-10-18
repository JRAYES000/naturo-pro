/**
 * Espace cliente — programme d'hygiène de vie par étapes : l'étape du jour mise
 * en avant, le relevé d'observance du jour (suivi, énergie, note) et l'historique.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loading } from "@/components/Loading";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const formatDate = (d: string | number) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
import { PortalExpired } from "./PortalHome";

interface Stage { index: number; section: string; items: string[]; start: string | null; end: string | null }
interface Checkin { day: string; adherence: number; energy: number | null; note: string | null }
interface ProgrammeData {
  id: number; title: string; startDate: string | null; today: string;
  stages: Stage[]; current: number | null; checkins: Checkin[];
  stats: { rate: number | null; energyAvg: number | null; streak: number; checkinDays: number; windowDays: number };
}

const ADHERENCE = [
  { v: 2, label: "Oui, je l'ai suivi" },
  { v: 1, label: "En partie" },
  { v: 0, label: "Pas aujourd'hui" },
];
const day = (d: string) => formatDate(`${d}T12:00:00`);

export default function PortalProgramme() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const key = ["/api/portal/programmes", Number(id)];
  const { data, isLoading, error } = useQuery<ProgrammeData>({ queryKey: key, retry: false });
  const todays = data?.checkins.find((c) => c.day === data.today);
  const [adherence, setAdherence] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (todays) { setAdherence(todays.adherence); setEnergy(todays.energy); setNote(todays.note || ""); }
  }, [todays?.day]);

  const save = useMutation({
    mutationFn: () => apiRequest("POST", `/api/portal/programmes/${id}/checkins`, { adherence, energy, note: note.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: "Relevé enregistré", description: "Merci ! Votre praticienne suit votre progression.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Loading label="Chargement du programme…" />;
  if (error || !data) return <PortalExpired />;

  return (
    <div className="min-h-screen leaf-bg px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <Link href="/espace" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Mon espace</Link>
        <h1 className="text-2xl text-heading">{data.title}</h1>

        <section className="card-naturo space-y-4" data-testid="portal-checkin">
          <h2 className="text-heading">Mon relevé du jour</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Avez-vous suivi votre programme aujourd'hui ?">
            {ADHERENCE.map((a) => (
              <button key={a.v} type="button" aria-pressed={adherence === a.v} onClick={() => setAdherence(a.v)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${adherence === a.v ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-secondary"}`}
                data-testid={`button-adherence-${a.v}`}>
                {a.label}
              </button>
            ))}
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Mon énergie</p>
            <div className="flex gap-2" role="group" aria-label="Niveau d'énergie de 1 à 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={energy === n} onClick={() => setEnergy(energy === n ? null : n)}
                  className={`h-10 w-10 rounded-md border text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${energy === n ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-secondary"}`}
                  data-testid={`button-energy-${n}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Une remarque pour votre praticienne (facultatif)" data-testid="input-checkin-note" />
          <Button onClick={() => save.mutate()} disabled={adherence === null || save.isPending} className="rounded-md font-bold" data-testid="button-save-checkin">
            <CheckCircle2 className="h-4 w-4 mr-1" /> {todays ? "Mettre à jour" : "Enregistrer"}
          </Button>
          {data.stats.checkinDays > 0 && (
            <p className="text-sm text-muted-foreground flex items-center gap-1" data-testid="text-adherence">
              {data.stats.streak > 1 && <><Flame className="h-4 w-4 text-amber-600" /> {data.stats.streak} jours d'affilée · </>}
              suivi à {data.stats.rate} % sur les {data.stats.windowDays} derniers jours
            </p>
          )}
        </section>

        <section className="space-y-3" data-testid="portal-stages">
          {data.stages.map((s) => {
            const actuelle = data.current === s.index;
            return (
              <div key={s.index} className={`card-naturo ${actuelle ? "border-primary" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-heading">{s.section}</h3>
                  {s.start && s.end && (
                    <span className={`text-xs ${actuelle ? "font-bold text-primary" : "text-muted-foreground"}`}>
                      {actuelle ? "Étape en cours · " : ""}du {day(s.start)} au {day(s.end)}
                    </span>
                  )}
                </div>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {s.items.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
