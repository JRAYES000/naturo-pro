/**
 * Espace cliente — demande d'un lien de connexion (sans mot de passe). La réponse
 * est identique que l'adresse soit connue ou non : rien ne révèle qui est cliente.
 */
import { useState } from "react";
import { useParams } from "wouter";
import { Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function PortalLogin() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/public/portal/request-link", { slug, email: email.trim() });
      setSent(true);
    } catch (err: any) {
      toast({ title: "Demande impossible", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl mb-2 text-heading">Mon espace</h1>
          <p className="text-muted-foreground">Rendez-vous, programmes, documents et factures, au même endroit.</p>
        </div>
        <div className="card-naturo">
          {sent ? (
            <div className="text-center space-y-3" data-testid="portal-link-sent">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <p className="font-semibold">Vérifiez votre boîte email</p>
              <p className="text-sm text-muted-foreground">
                Si cette adresse correspond à une fiche cliente, un lien de connexion vient de vous être envoyé.
                Il est valable 30 minutes.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="portal-email">Votre adresse email</Label>
                <Input id="portal-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.fr" data-testid="input-portal-email" />
                <p className="text-xs text-muted-foreground mt-1">Celle que vous avez donnée à votre praticienne.</p>
              </div>
              <Button type="submit" disabled={loading || !email.trim()} className="w-full rounded-md py-5 font-bold" data-testid="button-portal-request">
                <Mail className="h-4 w-4 mr-1" /> {loading ? "Envoi…" : "Recevoir mon lien de connexion"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
