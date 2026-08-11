/**
 * GoogleStatusBanner — Lot 4 (actions C9 + P8)
 *
 * Bannière d'état de la connexion Google : quand elle est absente, liste
 * précisément les fonctionnalités impactées et propose la reconnexion en un clic.
 * Ne rend rien si Google est connecté ou non configuré côté serveur.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export function useGoogleStatus() {
  return useQuery<GoogleStatus>({
    queryKey: ["/api/google/status"],
    queryFn: async () => (await apiRequest("GET", "/api/google/status")).json(),
    staleTime: 60_000,
  });
}

export function GoogleStatusBanner({ visioContext = false }: { visioContext?: boolean }) {
  const { data } = useGoogleStatus();
  if (!data || !data.configured || data.connected) return null;
  return (
    <div
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm"
      data-testid="banner-google-status"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-bold mb-1">Google Agenda n'est pas connecté</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Synchronisation de l'agenda avec Google Agenda : <strong>inactive</strong></li>
            <li>Liens visio Google Meet automatiques{visioContext ? " (prestations Visio)" : ""} : <strong>inactifs</strong></li>
          </ul>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg font-bold shrink-0 border-amber-300 bg-white hover:bg-amber-100"
          onClick={() => { window.location.href = "/api/auth/google"; }}
          data-testid="button-google-reconnect"
        >
          Connecter Google
        </Button>
      </div>
    </div>
  );
}
