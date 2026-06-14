import { useState } from "react";
import { Link } from "wouter";
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
  email: z.string().email("Email invalide"),
});

export default function ForgotPassword() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", values);
      setSubmitted(true);
    } catch (e: any) {
      // Pour rester anti-énumération côté UI, on affiche le même message
      setSubmitted(true);
      toast({ title: "Demande envoyée", description: "Vérifiez votre boîte mail." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6"><Logo /></Link>
          <h1 className="text-3xl font-extrabold mb-2 text-heading">Mot de passe oublié</h1>
          <p className="text-muted-foreground">Entrez votre email, nous vous enverrons un lien.</p>
        </div>
        <div className="card-naturo">
          {submitted ? (
            <div className="text-center py-4">
              <p className="font-semibold mb-2 text-heading">Si un compte existe avec cet email, vous recevrez un lien.</p>
              <p className="text-sm text-muted-foreground">Pensez à vérifier vos spams.</p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="vous@exemple.fr" {...field} data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg py-6 font-bold"
                  data-testid="button-submit-forgot"
                >
                  {loading ? "Envoi…" : "Envoyer le lien"}
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
