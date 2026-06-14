import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Logo } from "@/components/Logo";

const schema = z.object({
  password: z.string().min(6, "6 caractères minimum"),
  confirm: z.string().min(6, "6 caractères minimum"),
}).refine((d) => d.password === d.confirm, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirm"],
});

export default function ResetPassword() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    setError("");
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        token,
        password: values.password,
      });
      toast({ title: "Mot de passe réinitialisé 🌿", description: "Vous pouvez vous connecter." });
      navigate("/login");
    } catch (e: any) {
      setError(e?.message || "Le lien a expiré ou est invalide.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6"><Logo /></Link>
          <h1 className="text-3xl font-extrabold mb-2 text-heading">Nouveau mot de passe</h1>
          <p className="text-muted-foreground">Choisissez un nouveau mot de passe sécurisé.</p>
        </div>
        <div className="card-naturo">
          {error ? (
            <div className="text-center py-4">
              <p className="font-semibold text-destructive mb-2">{error}</p>
              <p className="text-sm text-muted-foreground mb-4">
                Demandez un nouveau lien depuis la page mot de passe oublié.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block text-primary font-bold"
                data-testid="link-forgot-password"
              >
                Demander un nouveau lien
              </Link>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nouveau mot de passe</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="6 caractères minimum" {...field} data-testid="input-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="confirm" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmer le mot de passe</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Retapez votre mot de passe" {...field} data-testid="input-confirm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg py-6 font-bold"
                  data-testid="button-submit-reset"
                >
                  {loading ? "Mise à jour…" : "Réinitialiser le mot de passe"}
                </Button>
              </form>
            </Form>
          )}
        </div>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary font-bold" data-testid="link-back-login">Retour à la connexion</Link>
        </div>
      </div>
    </div>
  );
}
