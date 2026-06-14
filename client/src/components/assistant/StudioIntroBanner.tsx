import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * Bandeau d'onboarding « première fois » du Studio contenu.
 * S'affiche tant que `introSeen` est faux (flag backend `studioIntroSeenAt`).
 * « J'ai compris » → POST /api/content/intro-seen → disparaît définitivement.
 * Réutilise la requête ["/api/content/profile"] déjà câblée (cache partagé).
 */
export function StudioIntroBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data } = useQuery<{ introSeen: boolean }>({ queryKey: ["/api/content/profile"] });
  const seenMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/content/intro-seen"),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["/api/content/profile"] }); },
  });

  if (dismissed || !data || data.introSeen) return null;

  return (
    <div
      className="rounded-[15px] px-4 py-4 mb-4"
      style={{ background: "rgba(23, 236, 155, 0.12)", border: "1px solid rgba(24, 103, 73, 0.25)" }}
      data-testid="studio-intro-banner"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#186749" }} />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-heading mb-1">Bienvenue dans ton Studio contenu ✨</p>
          <p className="text-sm text-muted-foreground">
            Crée des posts Instagram &amp; Facebook prêts à publier pour attirer des clientes, en 3 étapes :{" "}
            <strong className="text-foreground">1)</strong> choisis un sujet (un thème, ou «&nbsp;Inspiré de tes clientes&nbsp;») ·{" "}
            <strong className="text-foreground">2)</strong> choisis le format (carrousel, reel, story…) ·{" "}
            <strong className="text-foreground">3)</strong> génère, ajuste, publie. Ton lien de réservation est déjà inséré, et tout est écrit{" "}
            <strong className="text-foreground">dans ta voix, sans jamais d'allégation médicale</strong>.
          </p>
          <Button
            size="sm"
            className="rounded-[15px] font-bold mt-3"
            disabled={seenMut.isPending}
            onClick={() => { setDismissed(true); seenMut.mutate(); }}
            data-testid="button-studio-intro-dismiss"
          >
            J'ai compris ✓
          </Button>
        </div>
      </div>
    </div>
  );
}
