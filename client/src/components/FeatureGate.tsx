/**
 * client/src/components/FeatureGate.tsx — état bloqué explicite (Lot 1, action 7)
 *
 * Affiché à la place d'un écran payant quand le compte n'a pas l'accès complet
 * (essai expiré, plan gratuit). Jamais d'erreur technique, jamais d'écran vide,
 * jamais de bouton sans effet : un message clair + le chemin vers l'abonnement.
 *
 * <FeatureGate />        → pleine page (dans AppLayout), pour les écrans payants.
 * <FeatureGateInline />  → encart, pour un bloc payant dans un écran gratuit
 *                          (ex. champs santé de la fiche client).
 */

import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Démarre la souscription : trace le clic (analytics, action 9) puis redirige
 * vers Stripe Checkout. Si les clés plateforme ne sont pas configurées (501),
 * on l'explique au lieu de laisser un bouton mort.
 */
export function useSubscribe(source: string) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const subscribe = async () => {
    setPending(true);
    try {
      await apiRequest("POST", "/api/billing/track", { event: "subscribe_click", source }).catch(() => {});
      const res = await apiRequest("POST", "/api/billing/create-checkout-session");
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast({
        title: "Abonnement bientôt disponible",
        description: e?.message || "Le paiement en ligne n'est pas encore ouvert. Réessayez plus tard.",
        variant: e?.status === 501 ? "default" : "destructive",
      });
    } finally {
      setPending(false);
    }
  };
  return { subscribe, pending };
}

function GateCard({ title, description, source }: { title: string; description: string; source: string }) {
  const { subscribe, pending } = useSubscribe(source);
  return (
    <div className="card-naturo max-w-xl mx-auto text-center py-10 px-6" data-testid={`feature-gate-${source}`}>
      <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-secondary text-primary flex items-center justify-center">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-extrabold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>
      <Button
        onClick={subscribe}
        disabled={pending}
        className="rounded-[15px] py-6 font-bold px-6"
        data-testid="button-subscribe"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        {pending ? "Redirection…" : "Passer à Naturo Pro — 19 €/mois"}
      </Button>
      <p className="text-xs text-muted-foreground mt-4">
        Votre socle gratuit reste actif : agenda, page de réservation, une prestation et vos fiches clients (coordonnées).
      </p>
    </div>
  );
}

export function FeatureGate({ feature, description }: { feature: string; description?: string }) {
  return (
    <AppLayout>
      <div className="max-w-4xl pt-8">
        <GateCard
          title={`${feature} — abonnement Naturo Pro`}
          description={description || "Cette fonctionnalité est réservée à l'abonnement Naturo Pro : un seul palier, 19 €/mois, sans engagement."}
          source={feature.toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "")}
        />
      </div>
    </AppLayout>
  );
}

export function FeatureGateInline({ title, description, source }: { title: string; description: string; source: string }) {
  const { subscribe, pending } = useSubscribe(source);
  return (
    <div
      className="rounded-[15px] border border-dashed border-primary/40 bg-secondary/40 px-4 py-5 text-center"
      data-testid={`feature-gate-inline-${source}`}
    >
      <div className="flex items-center justify-center gap-2 mb-1 text-primary">
        <Lock className="h-4 w-4" />
        <span className="font-bold text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <Button size="sm" variant="outline" onClick={subscribe} disabled={pending} className="rounded-lg font-bold" data-testid="button-subscribe-inline">
        {pending ? "Redirection…" : "Passer à Naturo Pro — 19 €/mois"}
      </Button>
    </div>
  );
}
