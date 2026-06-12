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

  // Applique la préférence de thème du compte. Le défaut (dark) est déjà posé dans
  // main.tsx avant le rendu ; ici on ne retire le dark que si l'utilisateur a choisi
  // "light". Déconnecté / non chargé → on reste sur le défaut dark.
  useEffect(() => {
    const pref = data?.user?.themePreference;
    document.documentElement.classList.toggle("dark", pref !== "light");
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

  if (isLoading || isFetching || !user) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Chargement…</div>;
  }
  return <>{children}</>;
}
