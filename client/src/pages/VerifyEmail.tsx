import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type Status = "loading" | "success" | "error";

export default function VerifyEmail() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, navigate] = useLocation();
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setErrorMessage("Lien invalide.");
        setStatus("error");
        return;
      }
      try {
        await apiRequest("POST", `/api/auth/verify-email/${encodeURIComponent(token)}`);
        if (cancelled) return;
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        await refetch();
        setStatus("success");
      } catch (e: any) {
        if (cancelled) return;
        setErrorMessage(e?.message || "Le lien a expiré ou est invalide.");
        setStatus("error");
      }
    }
    run();
    return () => { cancelled = true; };
  }, [token]);

  async function resend() {
    if (!user) {
      navigate("/login");
      return;
    }
    setResending(true);
    try {
      await apiRequest("POST", "/api/auth/resend-verification");
      toast({ title: "Email envoyé 🌿", description: "Un nouveau lien vient de partir." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Impossible de renvoyer l'email.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6"><Logo /></Link>
        </div>
        <div className="card-naturo text-center">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
              <h1 className="text-2xl font-extrabold mb-2 text-heading">Vérification en cours…</h1>
              <p className="text-muted-foreground">Nous validons votre lien.</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: "#17EC9B" }} />
              <h1 className="text-2xl font-extrabold mb-2 text-heading">Email vérifié ✅</h1>
              <p className="text-muted-foreground mb-6">Votre adresse est confirmée. Bienvenue sur Naturo Pro 🌿</p>
              <Button
                onClick={() => navigate("/app")}
                className="w-full rounded-lg py-6 font-bold"
                data-testid="button-goto-dashboard"
              >
                Aller à mon tableau de bord
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h1 className="text-2xl font-extrabold mb-2 text-heading">Lien invalide</h1>
              <p className="text-muted-foreground mb-6">
                {errorMessage || "Ce lien a expiré ou n'est plus valable."}
              </p>
              <Button
                onClick={resend}
                disabled={resending}
                className="w-full rounded-lg py-6 font-bold"
                data-testid="button-resend-verification"
              >
                {resending ? "Envoi…" : "Renvoyer l'email"}
              </Button>
              {!user && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Vous devrez vous reconnecter pour recevoir un nouveau lien.
                </p>
              )}
            </>
          )}
        </div>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary font-bold" data-testid="link-to-login">Retour à la connexion</Link>
        </div>
      </div>
    </div>
  );
}
