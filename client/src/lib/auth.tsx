import { createContext, useContext, ReactNode, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

export type AuthUser = {
  id: number; email: string; name: string; slug: string; bio?: string;
  photoUrl?: string | null; phone?: string | null; specialties?: string;
  address?: string | null; city?: string | null;
  publicPageEnabled?: boolean; emailRemindersEnabled?: boolean;
  primaryColor?: string; accentColor?: string;
  themePreference?: string;
  plan?: string;
  trialEndsAt?: number | null;
  emailVerifiedAt?: number | null;
  onboardingCompletedAt?: number | null;
  daysUntilTrialEnds?: number;
  /** Lot 1 — calculé par le serveur (publicUser) : abonné ou essai en cours. */
  hasFullAccess?: boolean;
};

type AuthCtx = {
  user: AuthUser | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  isLoading: true,
  isFetching: true,
  refetch: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isFetching, refetch } = useQuery<{ user: AuthUser } | null>({
    queryKey: ["/api/auth/me"],
    staleTime: 60_000,
  });

  // Applique la préférence de thème du compte. Le défaut est le thème clair (aucune
  // classe posée dans main.tsx) ; ici on n'ajoute le ".dark" que si l'utilisateur a
  // explicitement choisi "dark". Déconnecté / non chargé → on reste en clair.
  useEffect(() => {
    const pref = data?.user?.themePreference;
    document.documentElement.classList.toggle("dark", pref === "dark");
  }, [data?.user?.themePreference]);

  return (
    <Ctx.Provider
      value={{
        user: data?.user || null,
        isLoading,
        isFetching,
        refetch: async () => {
          await refetch();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, isFetching } = useAuth();
  const [, navigate] = useLocation();

  // Only redirect once we are SURE there is no session.
  // During a refetch (e.g. just after login), isFetching is true and we must wait
  // instead of bouncing back to /login with a stale `user=null` value.
  useEffect(() => {
    if (!isLoading && !isFetching && !user) {
      navigate("/login");
    }
  }, [isLoading, isFetching, user, navigate]);

  // On ne bloque le rendu que sur le PREMIER chargement. Inclure `isFetching` ici
  // démontait tout l'arbre protégé à chaque refetch en arrière-plan de /api/auth/me
  // (retour de Settings, invalidation…) : formulaire en cours vidé, scroll perdu.
  // Le useEffect ci-dessus garde `isFetching` : c'est lui qui doit attendre la fin
  // du refetch avant de conclure à l'absence de session.
  if (isLoading || !user) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Chargement…</div>;
  }
  return <>{children}</>;
}
