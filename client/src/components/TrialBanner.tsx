import { useState } from "react";
import { Link } from "wouter";
import { Sparkles, AlertTriangle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function TrialBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resending, setResending] = useState(false);

  if (!user) return null;

  const isTrial = user.plan === "trial";
  const days = typeof user.daysUntilTrialEnds === "number" ? user.daysUntilTrialEnds : null;
  const emailVerified = !!user.emailVerifiedAt;

  let trialBanner: React.ReactNode = null;
  if (isTrial && days !== null) {
    if (days === 0) {
      trialBanner = (
        <div
          className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 mb-4"
          style={{ background: "rgba(220, 38, 38, 0.10)", border: "1px solid rgba(220, 38, 38, 0.35)" }}
          data-testid="trial-banner-expired"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-destructive" />
          <p className="text-sm font-semibold flex-1 min-w-0" style={{ color: "#7f1d1d" }}>
            Votre essai est terminé · Activez votre abonnement pour continuer.
          </p>
          <Link href="/app/settings">
            <Button size="sm" className="rounded-lg font-bold" data-testid="button-activate-trial">
              Activer maintenant
            </Button>
          </Link>
        </div>
      );
    } else if (days <= 3) {
      trialBanner = (
        <div
          className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 mb-4"
          style={{ background: "rgba(234, 88, 12, 0.10)", border: "1px solid rgba(234, 88, 12, 0.35)" }}
          data-testid="trial-banner-warning"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{ color: "#c2410c" }} />
          <p className="text-sm font-semibold flex-1 min-w-0" style={{ color: "#7c2d12" }}>
            Plus que {days} jour{days > 1 ? "s" : ""} d'essai · Activez votre abonnement.
          </p>
          <Link href="/app/settings">
            <Button size="sm" className="rounded-lg font-bold" data-testid="button-activate-trial">
              Activer maintenant
            </Button>
          </Link>
        </div>
      );
    } else {
      trialBanner = (
        <div
          className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 mb-4"
          style={{ background: "rgba(23, 236, 155, 0.12)", border: "1px solid rgba(24, 103, 73, 0.25)" }}
          data-testid="trial-banner-info"
        >
          <Sparkles className="h-5 w-5 flex-shrink-0" style={{ color: "#186749" }} />
          <p className="text-sm font-semibold flex-1 min-w-0 text-heading">
            Vous êtes en essai gratuit · {days} jour{days > 1 ? "s" : ""} restant{days > 1 ? "s" : ""}
          </p>
          <Link href="/app/settings">
            <Button size="sm" variant="outline" className="rounded-lg font-bold" data-testid="button-activate-trial">
              Activer maintenant
            </Button>
          </Link>
        </div>
      );
    }
  }

  async function resend() {
    setResending(true);
    try {
      await apiRequest("POST", "/api/auth/resend-verification");
      toast({ title: "Email envoyé 🌿", description: "Vérifiez votre boîte mail." });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de renvoyer l'email.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  }

  const verifyBanner = !emailVerified ? (
    <div
      className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 mb-4"
      style={{ background: "rgba(250, 204, 21, 0.12)", border: "1px solid rgba(202, 138, 4, 0.35)" }}
      data-testid="email-verify-banner"
    >
      <Mail className="h-5 w-5 flex-shrink-0" style={{ color: "#a16207" }} />
      <p className="text-sm font-semibold flex-1 min-w-0" style={{ color: "#713f12" }}>
        Vérifiez votre email pour sécuriser votre compte.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={resend}
        disabled={resending}
        className="rounded-lg font-bold"
        data-testid="button-resend-verification-banner"
      >
        {resending ? "Envoi…" : "Renvoyer le lien"}
      </Button>
    </div>
  ) : null;

  if (!trialBanner && !verifyBanner) return null;

  return (
    <>
      {trialBanner}
      {verifyBanner}
    </>
  );
}
