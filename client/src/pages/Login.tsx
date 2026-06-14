import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { refetch } = useAuth();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/login", values);
      // Force a refetch of /api/auth/me BEFORE navigating so ProtectedRoute
      // sees the freshly-created session instead of the stale `user=null` value.
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      const res = await refetch();
      toast({ title: "Bonjour 👋", description: "Connexion réussie." });
      const me: any = (res as any)?.data;
      const u = me?.user;
      if (u && !u.onboardingCompletedAt) {
        navigate("/app/onboarding");
      } else {
        navigate("/app");
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message || "Identifiants incorrects", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6"><Logo /></Link>
          <h1 className="text-3xl font-extrabold mb-2 text-heading">Heureux de vous revoir</h1>
          <p className="text-muted-foreground">Connectez-vous pour accéder à votre cabinet.</p>
        </div>
        <div className="card-naturo">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" autoComplete="email" placeholder="vous@exemple.fr" {...field} data-testid="input-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl><Input type="password" autoComplete="current-password" placeholder="••••••••" {...field} data-testid="input-password" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={loading} className="w-full rounded-lg py-6 font-bold" data-testid="button-submit-login">
                {loading ? "Connexion…" : "Se connecter"}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground hover:text-primary font-semibold"
              data-testid="link-forgot-password"
            >
              Mot de passe oublié ?
            </Link>
          </div>

          {/* Bouton 'Continuer avec Google' temporairement masqué. 
              L'OAuth Google sert actuellement à lier Google Calendar depuis Settings (après login).
              L'auth via Google sur cette page nécessitera une logique de création/réconciliation de compte. */}
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Pas encore de compte ? <Link href="/register" className="text-primary font-bold" data-testid="link-to-register">Créer un compte</Link>
        </div>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Compte de démo : <code className="bg-secondary px-1.5 py-0.5 rounded">marie@demo.fr</code> / <code className="bg-secondary px-1.5 py-0.5 rounded">demo1234</code>
        </div>
      </div>
    </div>
  );
}
