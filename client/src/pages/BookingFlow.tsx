import { useState, useMemo, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Calendar as CalIcon, Clock,
  Loader2, AlertCircle, CalendarOff, WifiOff,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatPrice, durationLabel, formatHeureCabinet, formatDateHeureCabinet, fuseauDifferentDuCabinet } from "@/lib/format";
import { brandThemeVars } from "@/lib/brand-theme";
import { BookingStepIndicator } from "@/components/BookingStepIndicator";
import { BookingConfirmation } from "@/components/BookingConfirmation";
// Phase 3 Lot 2 — fallback sous-domaine
import { getCurrentTenant, isOnTenantSubdomain } from "@/lib/tenant";

interface PublicData {
  naturo: {
    name: string;
    slug: string;
    photoUrl: string | null;
    primaryColor: string;
    city?: string | null;
    address?: string | null;
  };
  categories: {
    id: number;
    name: string;
    durationMinutes: number;
    priceCents: number;
    location: string;
    description: string | null;
    color: string;
  }[];
}

/* ------------------------------------------------------------------ */
/* Skeleton for availability loading                                   */
/* ------------------------------------------------------------------ */
function DaysSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-busy="true" aria-label="Chargement des créneaux">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card-naturo py-4 space-y-2 flex flex-col items-center">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-7 w-8" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" aria-busy="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

function NaturoSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true">
      <header className="border-b border-border bg-background/80 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex gap-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-1.5 flex-1 rounded-full" />)}
        </div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid sm:grid-cols-2 gap-4">
          {[1,2].map(i => (
            <div key={i} className="card-naturo space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export default function BookingFlow() {
  const params = useParams<{ slug?: string; catId?: string }>();
  // Phase 3 Lot 2 — sur un sous-domaine, le slug n'est pas dans l'URL ; on lit
  // le tenant courant et on appelle /api/public/_self pour la résolution serveur.
  const tenantFromHost = getCurrentTenant();
  const onSub = isOnTenantSubdomain();
  const slug = params.slug ?? tenantFromHost ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Prestation présélectionnée, lue dans le CHEMIN (/p/:slug/book/:catId).
  //
  // Elle transitait avant par `?cat=`. En hash routing c'était perdant des deux côtés :
  // au clic gauche wouter déplaçait la query HORS du hash (/?cat=3#/p/slug/book), donc
  // la lecture dans window.location.hash ne trouvait jamais rien ; et sur un ctrl+clic
  // ou un lien copié-collé, la query restait DANS le hash, où elle empêchait la route
  // de matcher → « 404 Page introuvable » sur le lien que la praticienne partage.
  const initialCat = params.catId && /^\d+$/.test(params.catId) ? Number(params.catId) : null;

  const [step, setStep] = useState(initialCat ? 2 : 1);
  const [categoryId, setCategoryId] = useState<number | null>(initialCat);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
  const [confirmedAt, setConfirmedAt] = useState<{ when: Date; cat: any } | null>(null);
  const [emailConfigured, setEmailConfigured] = useState<boolean | undefined>(undefined);

  const {
    data,
    isLoading: loadingNaturo,
    isError: errorNaturo,
    error: naturoError,
    refetch: refetchNaturo,
  } = useQuery<PublicData>({
    queryKey: ["/api/public", onSub ? "_self" : slug],
    queryFn: async () => (await apiRequest("GET", onSub ? "/api/public/_self" : `/api/public/${slug}`)).json(),
    enabled: onSub || !!slug,
    retry: 2,
  });

  // Suivi de la connexion pour distinguer "vous êtes hors ligne" de "cette page n'existe pas" :
  // deux causes très différentes pour la cliente, qui appellent une action de repli différente.
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // "Page introuvable" = 404 backend (praticienne inexistante ou page désactivée), message métier explicite.
  // Toute autre erreur (réseau, 5xx) = erreur technique générique, avec bouton « Réessayer ».
  const naturoNotFound = errorNaturo && !isOffline && (naturoError as any)?.message === "Page introuvable";

  const cat = data?.categories.find(c => c.id === categoryId) || null;

  const from = useMemo(() => Date.now(), []);
  const to = useMemo(() => Date.now() + 30 * 86400000, []);
  const {
    data: avail,
    isLoading: loadingAvail,
    isError: errorAvail,
    refetch: refetchAvail,
  } = useQuery<{ slotsByDay: Record<string, string[]> }>({
    queryKey: ["/api/public", slug, "availability", { from, to, duration: cat?.durationMinutes }],
    queryFn: async () =>
      (await apiRequest("GET", `/api/public/${slug}/availability?from=${from}&to=${to}&duration=${cat?.durationMinutes || 60}`)).json(),
    enabled: !!cat,
    retry: 1,
  });

  const days = avail ? Object.keys(avail.slotsByDay).sort() : [];

  const bookMut = useMutation({
    mutationFn: async () => {
      if (!cat || !selectedSlot) throw new Error("Sélection incomplète");
      const r = await apiRequest("POST", `/api/public/${slug}/book`, {
        categoryId: cat.id,
        startAt: new Date(selectedSlot).getTime(),
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, phone: form.phone, notes: form.notes,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || "Ce créneau n'est plus disponible.");
      }
      return r.json();
    },
    onSuccess: (data: any) => {
      // Acompte Stripe activé → on redirige vers la page de paiement sécurisée.
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setConfirmedAt({ when: new Date(selectedSlot!), cat });
      // Lot 5 (QC Page publique) — le serveur dit si un email de confirmation peut partir.
      setEmailConfigured(typeof data?.emailConfigured === "boolean" ? data.emailConfigured : undefined);
      setStep(5);
    },
    onError: (e: any) => {
      // Cas particulier : le créneau vient d'être pris par quelqu'un d'autre pile au moment du
      // submit (race condition côté backend, cf. serialiserParUser). On ne laisse pas la cliente
      // sur un formulaire mort : on la ramène choisir un autre créneau avec une liste à jour.
      const message: string = e?.message || "Une erreur est survenue. Veuillez réessayer.";
      const slotGone = /cr[ée]neau.*(disponible|plus)/i.test(message);
      if (slotGone) {
        toast({
          title: "Ce créneau vient d'être réservé",
          description: "Quelqu'un d'autre a pris ce créneau entre-temps. Choisissez un autre horaire ci-dessous.",
          variant: "destructive",
        });
        setSelectedSlot(null);
        refetchAvail();
        setStep(3);
        return;
      }
      toast({
        title: "Erreur de réservation",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Document title with practitioner name
  useEffect(() => {
    if (data?.naturo?.name) {
      document.title = `Réserver — ${data.naturo.name} | Naturo Pro`;
    } else {
      document.title = "Réserver un rendez-vous | Naturo Pro";
    }
    return () => { document.title = "Naturo Pro"; };
  }, [data?.naturo?.name]);

  // ---- Loading ----
  if (loadingNaturo) return <NaturoSkeleton />;

  // ---- Error / not found ----
  if (errorNaturo || !data) {
    // Cas 1 : hors ligne — la cause est claire, on invite à reconnecter puis réessayer.
    if (isOffline) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10" data-testid="booking-page-error">
          <div className="max-w-sm w-full text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
              <WifiOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-2 text-heading">Vous êtes hors connexion</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Vérifiez votre connexion internet ou vos données mobiles, puis réessayez.
            </p>
            <Button
              onClick={() => refetchNaturo()}
              className="w-full rounded-lg py-6 font-bold min-h-[44px] active:motion-safe:scale-[0.98]"
              data-testid="button-retry-load"
            >
              Réessayer
            </Button>
          </div>
        </div>
      );
    }

    // Cas 2 : 404 métier — praticienne inexistante ou page désactivée. Pas la peine de proposer
    // « Réessayer » (ça ne changera rien) : on oriente vers un retour à la page publique.
    if (naturoNotFound) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10" data-testid="booking-page-error">
          <div className="max-w-sm w-full text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-2 text-heading">Page introuvable</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Cette page de réservation n'existe pas ou n'est plus disponible. Le lien est peut-être
              incorrect, ou la praticienne a désactivé sa prise de rendez-vous en ligne.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/">
                <Button variant="outline" className="w-full rounded-lg py-6 font-bold min-h-[44px] active:motion-safe:scale-[0.98]" data-testid="button-back-error">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Retour à l'accueil
                </Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // Cas 3 : erreur technique générique (réseau instable, 5xx…) — on encourage à réessayer.
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10" data-testid="booking-page-error">
        <div className="max-w-sm w-full text-center">
          <div className="h-16 w-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-2 text-heading">Impossible de charger</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Une erreur est survenue. Vérifiez votre connexion et réessayez.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => refetchNaturo()}
              className="w-full sm:w-auto rounded-lg py-6 font-bold min-h-[44px] active:motion-safe:scale-[0.98]"
              data-testid="button-retry-load"
            >
              Réessayer
            </Button>
            <Link href={onSub ? "/" : `/p/${slug}`}>
              <Button variant="outline" className="w-full rounded-lg py-6 font-bold min-h-[44px] active:motion-safe:scale-[0.98]" data-testid="button-back-error">
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const backHref = onSub ? "/" : `/p/${slug}`;

  return (
    <div className="min-h-screen bg-background" style={brandThemeVars(data.naturo.primaryColor)}>
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <Link href={backHref}><Logo /></Link>
          <Link
            href={backHref}
            className="text-sm font-bold text-muted-foreground hover:text-primary inline-flex items-center gap-1 py-2 px-3 rounded-lg hover:bg-secondary/60 motion-safe:transition min-h-[44px] active:motion-safe:scale-[0.98]"
            data-testid="link-back-public"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Retour</span>
            <span className="sm:hidden">Retour</span>
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Step indicator — shown for steps 1-4 */}
        {step >= 1 && step <= 4 && <BookingStepIndicator currentStep={step} />}

        {/* ================================================ */}
        {/* Step 1: choose service                          */}
        {/* ================================================ */}
        {step === 1 && (
          <div>
            <h1
              className="text-2xl sm:text-3xl font-bold mb-2 text-heading"
              data-testid="text-step1-title"
            >
              Choisissez une prestation
            </h1>
            <p className="text-muted-foreground mb-6 text-sm sm:text-base">
              Avec <strong>{data.naturo.name}</strong>.
            </p>

            {data.categories.length === 0 ? (
              <div className="card-naturo text-center py-12" data-testid="text-no-services">
                <CalendarOff className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-bold mb-1">Aucune prestation disponible</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {data.naturo.name} n'a pas encore configuré ses prestations.
                </p>
                <Link href={backHref}>
                  <Button variant="outline" className="rounded-lg font-bold min-h-[44px] active:motion-safe:scale-[0.98]" data-testid="button-back-no-services">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Retour à la page
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.categories.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setCategoryId(c.id); setStep(2); }}
                    className="card-naturo text-left hover:border-primary hover:bg-secondary/30 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:motion-safe:scale-[0.98] min-h-[44px]"
                    data-testid={`button-cat-${c.id}`}
                  >
                    <div className="flex items-start gap-2.5 mb-2">
                      <span className="h-2.5 w-2.5 rounded-full mt-1.5 shrink-0" style={{ background: c.color }} />
                      <h3 className="font-bold leading-snug">{c.name}</h3>
                    </div>
                    {c.description && (
                      <p className="text-sm text-muted-foreground mb-3 pl-5">{c.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-sm pl-5">
                      <span className="bg-secondary text-primary font-bold px-2 py-1 rounded-md whitespace-nowrap">
                        {durationLabel(c.durationMinutes)}
                      </span>
                      <span className="font-bold text-primary whitespace-nowrap">{formatPrice(c.priceCents)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================ */}
        {/* Step 2: choose date                             */}
        {/* ================================================ */}
        {step === 2 && cat && (
          <div>
            <button
              onClick={() => setStep(1)}
              className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4 hover:text-primary py-2.5 motion-safe:transition min-h-[44px] active:motion-safe:scale-[0.98]"
              data-testid="button-prev-step2"
            >
              <ArrowLeft className="h-4 w-4" /> Étape précédente
            </button>
            <h1
              className="text-2xl sm:text-3xl font-bold mb-2 text-heading"
              data-testid="text-step2-title"
            >
              Choisissez une date
            </h1>
            <p className="text-muted-foreground mb-6 text-sm sm:text-base">
              Pour <strong>{cat.name}</strong> ({durationLabel(cat.durationMinutes)}).
            </p>

            {loadingAvail && <DaysSkeleton />}

            {errorAvail && !loadingAvail && (
              <div className="card-naturo text-center py-10" data-testid="text-avail-error">
                <WifiOff className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-bold mb-1">Impossible de charger les disponibilités</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Une erreur est survenue. Vérifiez votre connexion.
                </p>
                <Button
                  onClick={() => refetchAvail()}
                  variant="outline"
                  className="rounded-lg font-bold min-h-[44px] active:motion-safe:scale-[0.98]"
                  data-testid="button-retry-avail"
                >
                  Réessayer
                </Button>
              </div>
            )}

            {!loadingAvail && !errorAvail && days.length === 0 && (
              <div className="card-naturo text-center py-12" data-testid="text-no-slots">
                <CalendarOff className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-bold mb-1">Aucun créneau disponible</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Aucun créneau disponible dans les 30 prochains jours.<br />
                  Essayez une autre prestation ou revenez plus tard.
                </p>
                <Button
                  onClick={() => setStep(1)}
                  variant="outline"
                  className="rounded-lg font-bold min-h-[44px] active:motion-safe:scale-[0.98]"
                  data-testid="button-back-no-slots"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" /> Changer de prestation
                </Button>
              </div>
            )}

            {!loadingAvail && !errorAvail && days.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {days.map(d => {
                  const date = new Date(d + "T12:00:00");
                  const slotCount = avail!.slotsByDay[d].length;
                  return (
                    <button
                      key={d}
                      onClick={() => { setSelectedDay(d); setStep(3); }}
                      className="card-naturo text-center hover:bg-secondary/50 hover:border-primary/40 motion-safe:transition-colors py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:motion-safe:scale-[0.98] min-h-[44px]"
                      data-testid={`button-day-${d}`}
                    >
                      <p className="text-xs uppercase font-bold text-primary">
                        {date.toLocaleDateString("fr-FR", { weekday: "short" })}
                      </p>
                      <p
                        className="text-2xl font-bold leading-none my-1 text-heading"
                      >
                        {date.getDate()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {date.toLocaleDateString("fr-FR", { month: "long" })}
                      </p>
                      <p className="text-xs text-primary mt-2 font-semibold">
                        {slotCount} créneau{slotCount > 1 ? "x" : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================ */}
        {/* Step 3: choose time slot                        */}
        {/* ================================================ */}
        {step === 3 && cat && selectedDay && (
          <div>
            <button
              onClick={() => setStep(2)}
              className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4 hover:text-primary py-2.5 motion-safe:transition min-h-[44px] active:motion-safe:scale-[0.98]"
              data-testid="button-prev-step3"
            >
              <ArrowLeft className="h-4 w-4" /> Étape précédente
            </button>
            <h1
              className="text-2xl sm:text-3xl font-bold mb-2 text-heading"
              data-testid="text-step3-title"
            >
              Choisissez un créneau
            </h1>
            <p className="text-muted-foreground mb-2 text-sm sm:text-base capitalize">
              Le {new Date(selectedDay + "T12:00:00").toLocaleDateString("fr-FR", {
                weekday: "long", day: "numeric", month: "long",
              })}.
            </p>
            {/* Les créneaux sont affichés en heure de Paris (celle du cabinet). On ne
                le précise qu'aux visiteuses dont le navigateur est sur un autre fuseau :
                pour elles, l'heure lue ici ne correspond pas à l'heure de leur téléphone. */}
            {fuseauDifferentDuCabinet() && (
              <p className="text-xs text-muted-foreground mb-6" data-testid="text-timezone-notice">
                <Clock className="inline-block h-3.5 w-3.5 align-[-2px] mr-1.5" aria-hidden="true" />Horaires affichés en <strong>heure française</strong> (fuseau du cabinet).
              </p>
            )}
            <div className="mb-4" />

            {loadingAvail ? (
              <SlotsSkeleton />
            ) : errorAvail || !avail ? (
              <div className="card-naturo text-center py-10" data-testid="text-avail-error-step3">
                <WifiOff className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-bold mb-1">Impossible de charger les créneaux</p>
                <p className="text-sm text-muted-foreground mb-4">Vérifiez votre connexion et réessayez.</p>
                <Button
                  onClick={() => refetchAvail()}
                  variant="outline"
                  className="rounded-lg font-bold min-h-[44px] active:motion-safe:scale-[0.98]"
                  data-testid="button-retry-avail-step3"
                >
                  Réessayer
                </Button>
              </div>
            ) : avail!.slotsByDay[selectedDay]?.length === 0 ? (
              <div className="card-naturo text-center py-10" data-testid="text-no-time-slots">
                <CalendarOff className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-bold mb-1">Aucun créneau disponible ce jour</p>
                <p className="text-sm text-muted-foreground mb-4">Sélectionnez une autre date.</p>
                <Button
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="rounded-lg font-bold min-h-[44px] active:motion-safe:scale-[0.98]"
                  data-testid="button-back-no-time-slots"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" /> Choisir une autre date
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {avail!.slotsByDay[selectedDay].map(iso => (
                  <button
                    key={iso}
                    onClick={() => { setSelectedSlot(iso); setStep(4); }}
                    className="rounded-lg border border-border bg-card hover:bg-primary hover:text-primary-foreground hover:border-primary py-3 font-bold motion-safe:transition text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] min-w-[44px] active:motion-safe:scale-[0.98]"
                    data-testid={`button-slot-${iso}`}
                  >
                    {formatHeureCabinet(iso)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================ */}
        {/* Step 4: client info form                        */}
        {/* ================================================ */}
        {step === 4 && cat && selectedSlot && (
          <div>
            <button
              onClick={() => setStep(3)}
              className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4 hover:text-primary py-2.5 motion-safe:transition min-h-[44px] active:motion-safe:scale-[0.98]"
              data-testid="button-prev-step4"
            >
              <ArrowLeft className="h-4 w-4" /> Étape précédente
            </button>
            <h1
              className="text-2xl sm:text-3xl font-bold mb-2 text-heading"
              data-testid="text-step4-title"
            >
              Vos coordonnées
            </h1>
            <p className="text-muted-foreground mb-6 text-sm sm:text-base">
              Quelques infos pour confirmer votre rendez-vous.
            </p>

            {/* Recap summary */}
            <div className="card-naturo mb-5 bg-secondary/40 border-secondary">
              <div className="flex items-start gap-3">
                <CalIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold">{cat.name}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {formatDateHeureCabinet(selectedSlot)}
                    {" "}• {durationLabel(cat.durationMinutes)}
                    {cat.priceCents > 0 && ` • ${formatPrice(cat.priceCents)}`}
                  </p>
                  {(data.naturo.city || data.naturo.address) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[data.naturo.address, data.naturo.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="card-naturo space-y-4">
              <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="firstName" className="text-sm font-bold mb-1 block">Prénom *</Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={e => setForm({ ...form, firstName: e.target.value })}
                    placeholder="Marie"
                    className="min-h-[44px]"
                    aria-required="true"
                    data-testid="input-firstName"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName" className="text-sm font-bold mb-1 block">Nom *</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={e => setForm({ ...form, lastName: e.target.value })}
                    placeholder="Dupont"
                    className="min-h-[44px]"
                    aria-required="true"
                    data-testid="input-lastName"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-bold mb-1 block">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="marie@exemple.fr"
                  className="min-h-[44px]"
                  aria-required="true"
                  data-testid="input-email"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm font-bold mb-1 block">Téléphone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="06 12 34 56 78"
                  className="min-h-[44px]"
                  aria-required="true"
                  data-testid="input-phone"
                />
              </div>
              <div>
                <Label htmlFor="notes" className="text-sm font-bold mb-1 block">
                  Quelque chose à nous dire ?{" "}
                  <span className="font-normal text-muted-foreground">(optionnel)</span>
                </Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Précisez vos besoins ou questions…"
                  data-testid="input-notes"
                />
              </div>

              {bookMut.isError && (
                <Alert variant="destructive" data-testid="alert-booking-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {(bookMut.error as any)?.message || "Ce créneau n'est plus disponible. Veuillez en choisir un autre."}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={() => bookMut.mutate()}
                disabled={bookMut.isPending || !form.firstName || !form.lastName || !form.email || !form.phone}
                className="w-full rounded-lg py-6 font-bold min-h-[52px] active:motion-safe:scale-[0.98]"
                data-testid="button-confirm-booking"
              >
                {bookMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Réservation en cours…</>
                ) : (
                  <>Confirmer le rendez-vous <ArrowRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                En confirmant, vous acceptez de recevoir un email de confirmation.
              </p>
            </div>
          </div>
        )}

        {/* ================================================ */}
        {/* Step 5: confirmation enrichie                   */}
        {/* ================================================ */}
        {step === 5 && confirmedAt && (
          <BookingConfirmation
            confirmed={confirmedAt}
            naturo={{
              name: data.naturo.name,
              address: (data.naturo as any).address ?? null,
              city: (data.naturo as any).city ?? null,
              photoUrl: data.naturo.photoUrl,
            }}
            email={form.email}
            backHref={backHref}
            emailConfigured={emailConfigured}
          />
        )}
      </div>
    </div>
  );
}
