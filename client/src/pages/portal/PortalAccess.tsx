/**
 * Espace cliente — ouverture du lien reçu par email : échange du jeton à usage
 * unique contre la session (cookie), puis arrivée sur l'espace.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function PortalAccess() {
  const { token = "" } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      try {
        await apiRequest("POST", "/api/public/portal/exchange", { token });
        await queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
        navigate("/espace", { replace: true });
      } catch (e: any) {
        setError(e.message || "Ce lien n'est plus valable.");
      }
    })();
  }, [token, navigate]);

  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="card-naturo w-full max-w-md text-center space-y-3" data-testid="portal-access">
        {error ? (
          <>
            <p className="font-semibold text-foreground">Lien expiré</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">
              Redemandez un lien depuis la page de réservation de votre praticienne (« Mon espace »), ou demandez-lui une nouvelle invitation.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Ouverture de votre espace…</p>
        )}
      </div>
    </div>
  );
}
