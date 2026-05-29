/**
 * BookingManage.tsx — Page publique d'annulation et de report de RDV
 * Route hash : /#/manage/:token
 * PHASE 3.5-B — token sécurisé, aucune authentification requise
 */
import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatTime, formatDay, durationLabel } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManageAppointment {
  id: number;
  date: number;
  time: number;
  startAt: number;
  endAt: number;
  duration: number;
  categoryName: string | null;
  practitionerName: string | null;
  practitionerSlug: string | null;
  address: string | null;
  status: string;
  clientFirstName: string | null;
  clientLastName: string | null;
}

interface ManageData {
  appointment: ManageAppointment;
  canCancel: boolean;
  canReschedule: boolean;
}

interface SlotsData {
  slotsByDay: Record<string, string[]>;
  durationMinutes: number;
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function ManageSkeleton() {
  return (
    <div className="min-h-screen leaf-bg bg-background" aria-busy="true" aria-label="Chargement">
      <header className="border-b border-border bg-background/80 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Skeleton className="h-7 w-36" />
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-6 w-64" />
        <div className="card-naturo p-6 space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-11 flex-1 rounded-[15px]" />
          <Skeleton className="h-11 flex-1 rounded-[15px]" />
        </div>
      </div>
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" aria-busy="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-[12px]" />
      ))}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <Badge variant="destructive" className="text-xs">
        Annulé
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="bg-emerald-600 text-white text-xs">
        Terminé
      </Badge>
    );
  }
  return (
    <Badge className="bg-[#1b4332] text-white text-xs">
      Confirmé
    </Badge>
  );
}

// ─── Slot picker sub-component ────────────────────────────────────────────────

function ManageSlotPicker({
  token,
  onSelect,
}: {
  token: string;
  onSelect: (ms: number) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [weekOffset, setWeekOffset] = useState(0);

  const from = new Date(today.getTime() + weekOffset * 7 * 86400000);
  const to = new Date(from.getTime() + 7 * 86400000 - 1);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const { data, isLoading, isError } = useQuery<SlotsData>({
    queryKey: ["/api/public/manage", token, "slots", fromStr],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/public/manage/${token}/slots?from=${fromStr}&to=${toStr}`
      ).then((r) => r.json()),
    retry: 1,
  });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Days with slots in the current week window
  const days = useMemo(() => {
    if (!data?.slotsByDay) return [];
    return Object.keys(data.slotsByDay).sort();
  }, [data]);

  const slots = useMemo(() => {
    if (!selectedDay || !data?.slotsByDay) return [];
    return data.slotsByDay[selectedDay] || [];
  }, [selectedDay, data]);

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(null); }}
          disabled={weekOffset === 0}
          className="rounded-[12px]"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground font-medium">
          {from.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          {" — "}
          {to.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(null); }}
          className="rounded-[12px]"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day selector */}
      {isLoading && <SlotsSkeleton />}
      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm py-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Impossible de charger les créneaux.
        </div>
      )}
      {data && (
        <>
          {days.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              Aucun créneau disponible cette semaine.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {days.map((day) => {
                const d = new Date(day + "T00:00:00");
                const count = data.slotsByDay[day]?.length ?? 0;
                const isSelected = selectedDay === day;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`card-naturo py-4 px-3 flex flex-col items-center gap-1 transition-all cursor-pointer border-2 ${
                      isSelected
                        ? "border-[#17EC9B] bg-[#17EC9B]/10"
                        : "border-transparent hover:border-[#17EC9B]/50"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground capitalize">
                      {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                    </span>
                    <span className="text-2xl font-bold text-foreground">
                      {d.getDate()}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {d.toLocaleDateString("fr-FR", { month: "short" })}
                    </span>
                    <span className="text-xs text-[#1b4332] dark:text-[#17EC9B] font-medium">
                      {count} {count > 1 ? "créneaux" : "créneau"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Time slots for selected day */}
          {selectedDay && slots.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-sm font-medium text-foreground">
                Choisir l'heure du{" "}
                {new Date(selectedDay + "T00:00:00").toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {slots.map((iso) => {
                  const ms = new Date(iso).getTime();
                  return (
                    <button
                      key={iso}
                      data-testid={`slot-${ms}`}
                      onClick={() => onSelect(ms)}
                      className="rounded-[12px] py-3 text-sm font-bold border-2 border-[#1b4332] text-[#1b4332] dark:border-[#17EC9B] dark:text-[#17EC9B] hover:bg-[#1b4332] hover:text-white dark:hover:bg-[#17EC9B] dark:hover:text-[#1b4332] transition-colors"
                    >
                      {formatTime(iso)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type PageState =
  | "loading"
  | "error"
  | "cancelled_already"
  | "active"
  | "confirm_cancel"
  | "reschedule"
  | "done_cancelled"
  | "done_rescheduled";

export default function BookingManage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // UI states
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [step, setStep] = useState<"main" | "reschedule" | "done_cancel" | "done_reschedule">("main");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [selectedSlotMs, setSelectedSlotMs] = useState<number | null>(null);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);

  // Fetch appointment data
  const { data, isLoading, isError } = useQuery<ManageData>({
    queryKey: ["/api/public/manage", token],
    queryFn: () =>
      apiRequest("GET", `/api/public/manage/${token}`).then((r) => r.json()),
    retry: false,
    enabled: !!token,
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/public/manage/${token}/cancel`).then((r) => r.json()),
    onSuccess: () => {
      setShowCancelDialog(false);
      setStep("done_cancel");
    },
    onError: (e: any) => {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible d'annuler le rendez-vous.",
        variant: "destructive",
      });
    },
  });

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: (newStartMs: number) =>
      apiRequest("POST", `/api/public/manage/${token}/reschedule`, {
        newStartMs,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setShowRescheduleConfirm(false);
      setNewToken(data.newToken);
      setStep("done_reschedule");
    },
    onError: (e: any) => {
      toast({
        title: "Créneau indisponible",
        description: e?.message || "Ce créneau n'est plus disponible.",
        variant: "destructive",
      });
    },
  });

  const appt = data?.appointment;
  const canCancel = data?.canCancel ?? false;
  const canReschedule = data?.canReschedule ?? false;

  // ── Screens ────────────────────────────────────────────────────────────────

  if (isLoading) return <ManageSkeleton />;

  // Error / not found
  if (isError || (!isLoading && !data)) {
    return (
      <div className="min-h-screen leaf-bg bg-background flex items-center justify-center p-4">
        <Card className="card-naturo max-w-md w-full">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Ce lien n'est plus valide
            </h1>
            <p className="text-muted-foreground text-sm">
              Ce lien a expiré ou n'est pas reconnu. Si vous avez besoin d'aide,
              contactez directement votre praticienne.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!appt) return null;

  const isCancelled = appt.status === "cancelled";

  // ── Done: cancelled ─────────────────────────────────────────────────────────
  if (step === "done_cancel" || (isCancelled && step === "main" && !canCancel && !canReschedule)) {
    return (
      <div className="min-h-screen leaf-bg bg-background flex items-center justify-center p-4">
        <Card className="card-naturo max-w-md w-full">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#1b4332]/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-[#1b4332] dark:text-[#17EC9B]" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              {step === "done_cancel" ? "RDV annulé" : "Ce RDV a été annulé"}
            </h1>
            <div className="text-sm text-muted-foreground space-y-1">
              {appt.categoryName && <p className="font-medium text-foreground">{appt.categoryName}</p>}
              <p data-testid="text-rdv-date">
                {formatDay(appt.startAt)} à {formatTime(appt.startAt)}
              </p>
              {appt.practitionerName && <p>avec {appt.practitionerName}</p>}
            </div>
            <p className="text-sm text-muted-foreground">
              Votre praticienne a été prévenue.
            </p>
            {appt.practitionerSlug && (
              <Button
                variant="outline"
                className="rounded-[15px] py-6 font-bold mt-2"
                onClick={() => navigate(`/p/${appt.practitionerSlug}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour à la page du cabinet
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Done: rescheduled ───────────────────────────────────────────────────────
  if (step === "done_reschedule" && newToken) {
    return (
      <div className="min-h-screen leaf-bg bg-background flex items-center justify-center p-4">
        <Card className="card-naturo max-w-md w-full">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#17EC9B]/20 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-[#1b4332] dark:text-[#17EC9B]" />
            </div>
            <h1 className="text-xl font-bold text-foreground">RDV reporté !</h1>
            <p className="text-sm text-muted-foreground">
              Votre nouveau rendez-vous a été enregistré.
              {selectedSlotMs && (
                <span className="block mt-1 font-medium text-foreground">
                  {formatDay(selectedSlotMs)} à {formatTime(selectedSlotMs)}
                </span>
              )}
            </p>
            <div className="flex flex-col gap-2 w-full mt-2">
              <Button
                className="rounded-[15px] py-6 font-bold bg-[#1b4332] hover:bg-[#1b4332]/90 text-white"
                onClick={() => navigate(`/manage/${newToken}`)}
              >
                Gérer le nouveau RDV
              </Button>
              {appt.practitionerSlug && (
                <Button
                  variant="outline"
                  className="rounded-[15px] py-6 font-bold"
                  onClick={() => navigate(`/p/${appt.practitionerSlug}`)}
                >
                  Retour à la page du cabinet
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Reschedule step ─────────────────────────────────────────────────────────
  if (step === "reschedule") {
    return (
      <div className="min-h-screen leaf-bg bg-background">
        <header className="border-b border-border bg-background/80 sticky top-0 z-30">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStep("main"); setSelectedSlotMs(null); setShowRescheduleConfirm(false); }}
              className="rounded-[12px]"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Retour
            </Button>
            <span className="font-bold text-foreground">Reporter le RDV</span>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Current appointment recap */}
          <Card className="card-naturo">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">RDV actuel</p>
              <p className="font-medium text-foreground">
                {formatDay(appt.startAt)} à {formatTime(appt.startAt)}
                {appt.duration && ` · ${durationLabel(appt.duration)}`}
              </p>
            </CardContent>
          </Card>

          {/* Slot picker */}
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4">
              Choisir un nouveau créneau
            </h2>
            <ManageSlotPicker
              token={token!}
              onSelect={(ms) => {
                setSelectedSlotMs(ms);
                setShowRescheduleConfirm(true);
              }}
            />
          </div>
        </div>

        {/* Reschedule confirmation dialog */}
        <Dialog open={showRescheduleConfirm} onOpenChange={setShowRescheduleConfirm}>
          <DialogContent className="rounded-[15px]">
            <DialogHeader>
              <DialogTitle>Confirmer le report</DialogTitle>
              <DialogDescription>
                Votre RDV actuel sera annulé et remplacé par :
              </DialogDescription>
            </DialogHeader>
            {selectedSlotMs && (
              <div className="card-naturo p-4 text-center">
                <p className="font-bold text-foreground text-lg">
                  {formatDay(selectedSlotMs)}
                </p>
                <p className="text-[#1b4332] dark:text-[#17EC9B] font-bold text-xl">
                  {formatTime(selectedSlotMs)}
                </p>
                {appt.duration && (
                  <p className="text-muted-foreground text-sm">
                    Durée : {durationLabel(appt.duration)}
                  </p>
                )}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setShowRescheduleConfirm(false)}
                className="rounded-[15px] py-6 font-bold"
              >
                Changer de créneau
              </Button>
              <Button
                data-testid="button-confirm-reschedule"
                onClick={() => selectedSlotMs && rescheduleMutation.mutate(selectedSlotMs)}
                disabled={rescheduleMutation.isPending}
                className="rounded-[15px] py-6 font-bold bg-[#1b4332] hover:bg-[#1b4332]/90 text-white"
              >
                {rescheduleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirmer le report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen leaf-bg bg-background">
      <header className="border-b border-border bg-background/80 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-foreground text-lg">Mon rendez-vous</span>
          {appt.practitionerSlug && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/p/${appt.practitionerSlug}`)}
              className="rounded-[12px] text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Retour
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Status */}
        <div className="flex items-center gap-2">
          <StatusBadge status={appt.status} />
          {isCancelled && (
            <span className="text-sm text-muted-foreground">Ce RDV a été annulé</span>
          )}
        </div>

        {/* RDV summary card */}
        <Card className="card-naturo">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              {appt.categoryName || "Rendez-vous"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Date */}
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-[#1b4332] dark:text-[#17EC9B] shrink-0 mt-0.5" />
              <div>
                <p
                  className="font-medium text-foreground capitalize"
                  data-testid="text-rdv-date"
                >
                  {formatDay(appt.startAt)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatTime(appt.startAt)}
                  {appt.duration ? ` · ${durationLabel(appt.duration)}` : ""}
                </p>
              </div>
            </div>

            {/* Practitioner */}
            {appt.practitionerName && (
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-[#1b4332] dark:text-[#17EC9B] shrink-0" />
                <p className="text-foreground">{appt.practitionerName}</p>
              </div>
            )}

            {/* Address */}
            {appt.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-[#1b4332] dark:text-[#17EC9B] shrink-0 mt-0.5" />
                <p className="text-muted-foreground text-sm">{appt.address}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {canCancel || canReschedule ? (
          <div className="flex flex-col sm:flex-row gap-3">
            {canReschedule && (
              <Button
                data-testid="button-reschedule-rdv"
                variant="outline"
                className="flex-1 rounded-[15px] py-6 font-bold border-[#1b4332] text-[#1b4332] hover:bg-[#1b4332] hover:text-white dark:border-[#17EC9B] dark:text-[#17EC9B]"
                onClick={() => setStep("reschedule")}
              >
                <Clock className="h-4 w-4 mr-2" />
                Reporter à une autre date
              </Button>
            )}
            {canCancel && (
              <Button
                data-testid="button-cancel-rdv"
                variant="outline"
                className="flex-1 rounded-[15px] py-6 font-bold border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Annuler le RDV
              </Button>
            )}
          </div>
        ) : (
          !isCancelled && (
            <p className="text-sm text-muted-foreground text-center">
              Ce rendez-vous est passé et ne peut plus être modifié.
            </p>
          )
        )}
      </div>

      {/* Cancel confirmation dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="rounded-[15px]">
          <DialogHeader>
            <DialogTitle>Annuler le rendez-vous ?</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Votre praticienne sera prévenue.
            </DialogDescription>
          </DialogHeader>
          <div className="card-naturo p-4 text-center">
            <p
              className="font-bold text-foreground"
              data-testid="text-rdv-date"
            >
              {formatDay(appt.startAt)}
            </p>
            <p className="text-[#1b4332] dark:text-[#17EC9B] font-bold text-lg">
              {formatTime(appt.startAt)}
            </p>
            {appt.categoryName && (
              <p className="text-muted-foreground text-sm">{appt.categoryName}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              className="rounded-[15px] py-6 font-bold"
            >
              Conserver le RDV
            </Button>
            <Button
              data-testid="button-confirm-cancel"
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="rounded-[15px] py-6 font-bold"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
