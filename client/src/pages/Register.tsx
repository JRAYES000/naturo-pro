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
  name: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
});

export default function Register() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { refetch } = useAuth();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/register", values);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetch();
      toast({ title: "Bienvenue 🌿", description: "Un email de confirmation vous a été envoyé." });
      navigate("/app/onboarding");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6"><Logo /></Link>
          <h1 className="text-3xl font-extrabold mb-2" style={{ color: "#1b4332" }}>Créer mon compte</h1>
          <p className="text-muted-foreground">C'est gratuit, et ça ne prend qu'une minute.</p>
        </div>
        <div className="card-naturo">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Votre nom complet</FormLabel>
                  <FormControl><Input placeholder="Marie Dupont" {...field} data-testid="input-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="vous@exemple.fr" {...field} data-testid="input-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl><Input type="password" placeholder="6 caractères minimum" {...field} data-testid="input-password" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={loading} className="w-full rounded-[15px] py-6 font-bold" data-testid="button-submit-register">
                {loading ? "Création…" : "Créer mon compte"}
              </Button>
            </form>
          </Form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Essai gratuit 7 jours, sans engagement, sans carte bancaire.
          </p>
        </div>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Vous avez déjà un compte ? <Link href="/login" className="text-primary font-bold" data-testid="link-to-login">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
