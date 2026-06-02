import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, Calendar as CalendarIcon, CheckCircle2, AlertTriangle, LogOut, RefreshCw, Mail, Shield, Download, Trash2, Star, CreditCard } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { HelpNote } from "@/components/HelpNote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ResendTutorialDialog } from "@/components/ResendTutorialDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

type GoogleStatus = { configured: boolean; connected: boolean; email: string | null };

export default function Settings() {
  const { toast } = useToast();
  const { data } = useQuery<any>({ queryKey: ["/api/profile"] });
  const { data: googleStatus } = useQuery<GoogleStatus>({ queryKey: ["/api/google/status"] });
  const [draft, setDraft] = useState<any>({});

  useEffect(() => {
    if (data?.user) setDraft({
      name: data.user.name, email: data.user.email,
      emailRemindersEnabled: !!data.user.emailRemindersEnabled,
      // Phase 0.7 — config email Resend
      resendApiKey: "", // jamais pré-rempli (sécurité — le serveur ne le renvoie pas)
      hasResendApiKey: !!data.user.hasResendApiKey,
      emailFromAddress: data.user.emailFromAddress || "",
      emailFromName: data.user.emailFromName || "",
      dailyRecapEnabled: !!data.user.dailyRecapEnabled,
      reminderHourLocal: typeof data.user.reminderHourLocal === "number" ? data.user.reminderHourLocal : 10,
      recapHourLocal: typeof data.user.recapHourLocal === "number" ? data.user.recapHourLocal : 10,
      // Phase 1 — Facturation
      billingCompanyName: data.user.billingCompanyName || "",
      billingSiret: data.user.billingSiret || "",
      billingAddress: data.user.billingAddress || "",
      billingPostalCode: data.user.billingPostalCode || "",
      billingCity: data.user.billingCity || "",
      billingCountry: data.user.billingCountry || "France",
      billingIban: data.user.billingIban || "",
      billingBic: data.user.billingBic || "",
      billingLogoBase64: data.user.billingLogoBase64 || "",
      billingVatEnabled: !!data.user.billingVatEnabled,
      billingVatRate: typeof data.user.billingVatRate === "number" ? data.user.billingVatRate : 2000,
      billingLegalMention: data.user.billingLegalMention || "",
      billingPaymentTerms: data.user.billingPaymentTerms || "",
      autoInvoiceOnCompleted: !!data.user.autoInvoiceOnCompleted,
      // Avis Google
      googleReviewUrl: data.user.googleReviewUrl || "",
      reviewRequestEnabled: !!data.user.reviewRequestEnabled,
      // Paiements en ligne (Stripe)
      stripeSecretKey: "", // jamais pré-rempli (sécurité)
      hasStripeSecretKey: !!data.user.hasStripeSecretKey,
      stripeDepositPercent: typeof data.user.stripeDepositPercent === "number" ? data.user.stripeDepositPercent : 0,
    });
  }, [data]);

  // Read ?google=ok|error from URL query string (placed BEFORE the hash so wouter ignores them)
  // URL format: https://app.ecole-naturo.fr/?google=ok#/app/settings
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "ok") {
      toast({ title: "Google Calendar connecté", description: "Vos RDV seront désormais synchronisés." });
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      // Clean URL: keep hash, drop query string
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    } else if (g === "error") {
      const reason = params.get("reason") || "";
      toast({ title: "Erreur Google", description: reason || "Connexion échouée", variant: "destructive" });
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, [toast]);

  const saveMut = useMutation({
    mutationFn: async () => {
      // On retire hasResendApiKey (read-only) et resendApiKey si vide (pour ne pas écraser).
      const payload: any = { ...draft };
      delete payload.hasResendApiKey;
      delete payload.hasStripeSecretKey;
      if (!payload.resendApiKey) delete payload.resendApiKey;
      if (!payload.stripeSecretKey) delete payload.stripeSecretKey; // ne pas écraser la clé existante
      // Normaliser "" en null pour les champs nullable
      if (payload.emailFromAddress === "") payload.emailFromAddress = null;
      if (payload.emailFromName === "") payload.emailFromName = null;
      if (payload.googleReviewUrl === "") payload.googleReviewUrl = null;
      return apiRequest("PATCH", "/api/profile", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Paramètres enregistrés" });
      // Vider le champ clé API après save (sécurité)
      setDraft((d: any) => ({ ...d, resendApiKey: "" }));
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec", variant: "destructive" }),
  });

  const disconnectGoogleMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/google/disconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      toast({ title: "Google Calendar déconnecté" });
    },
  });

  const importGoogleMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/google/sync-import", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      const { created = 0, updated = 0, deleted = 0, total = 0 } = data || {};
      toast({
        title: "Synchronisation Google terminée",
        description: `${total} événement(s) lus · ${created} créé(s) · ${updated} mis à jour · ${deleted} supprimé(s)`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Erreur synchronisation", description: e?.message || "Échec", variant: "destructive" });
    },
  });

  const handleConnectGoogle = () => {
    // Full-page redirect: server reads session cookie, signs state, redirects to Google.
    window.location.href = "/api/auth/google";
  };

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6">
        <h1 className="text-3xl font-extrabold" style={{ color: "#1b4332" }}>Paramètres</h1>

        <HelpNote>
          <p>
            C'est le <strong>centre de réglages de votre compte</strong>. Vous y configurez, une fois
            pour toutes, les informations qui font tourner l'application au quotidien.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Ce que vous réglez ici :</p>
            <ul>
              <li>👤 <strong>Vos informations</strong> : votre nom et votre adresse email.</li>
              <li>✉️ <strong>L'envoi des emails</strong> : la connexion qui permet d'envoyer confirmations et rappels à vos clientes.</li>
              <li>🧾 <strong>La facturation</strong> : vos coordonnées (adresse, SIRET, IBAN…) qui apparaîtront sur vos factures.</li>
              <li>📅 <strong>Google Agenda</strong> : pour synchroniser vos rendez-vous avec votre agenda Google (optionnel).</li>
              <li>🔔 <strong>Les rappels automatiques</strong> : les activer et choisir l'heure d'envoi.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-2">Comment ça marche ?</p>
            <ol>
              <li>Remplissez ou modifiez les champs de la section qui vous intéresse.</li>
              <li>Cliquez sur le bouton <strong>« Enregistrer »</strong> de cette section. C'est tout.</li>
            </ol>
          </div>
          <p className="text-xs italic">
            💡 Pas besoin de tout remplir d'un coup. Prenez surtout le temps de compléter la partie
            <strong> facturation</strong> si vous éditez des factures, et l'<strong>envoi des emails</strong>
            pour que vos clientes reçoivent bien leurs confirmations.
          </p>
        </HelpNote>

        <div className="card-naturo space-y-4">
          <h2 className="font-extrabold">Compte</h2>
          <div><Label>Nom</Label><Input value={draft.name || ""} onChange={e => setDraft({ ...draft, name: e.target.value })} data-testid="input-name" /></div>
          <div><Label>Email</Label><Input value={draft.email || ""} disabled data-testid="input-email" /></div>
        </div>

        <div className="card-naturo space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" style={{ color: "#1b4332" }} />
            <h2 className="font-extrabold">Rappels email (Resend)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Configurez votre clé Resend pour envoyer automatiquement un rappel J-1 à vos clientes
            (avec boutons “Confirmer” / “Annuler”) et recevoir un récap quotidien de votre journée.
          </p>

          <div>
            <Label>Clé API Resend</Label>
            <Input
              type="password"
              placeholder={draft.hasResendApiKey ? "•••••••• (clé déjà enregistrée — saisissez pour remplacer)" : "re_xxx..."}
              value={draft.resendApiKey || ""}
              onChange={(e) => setDraft({ ...draft, resendApiKey: e.target.value })}
              autoComplete="new-password"
              data-testid="input-resend-key"
            />
            <p className="text-xs text-muted-foreground mt-1">
              <ResendTutorialDialog
                trigger={
                  <button
                    type="button"
                    className="underline font-medium hover:opacity-80 text-left"
                    style={{ color: "#1b4332" }}
                    data-testid="link-resend-tutorial"
                  >
                    Suivez ce tutoriel rapide pour créer un compte Resend et obtenir votre clé API.
                  </button>
                }
              />{" "}
              Ça prend moins de 5&nbsp;min et c'est totalement gratuit.
              {draft.hasResendApiKey && <> — Clé actuellement <strong>configurée</strong>.</>}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Email expéditeur</Label>
              <Input
                placeholder="noreply@votre-domaine.fr"
                value={draft.emailFromAddress || ""}
                onChange={(e) => setDraft({ ...draft, emailFromAddress: e.target.value })}
                data-testid="input-email-from"
              />
            </div>
            <div>
              <Label>Nom expéditeur (optionnel)</Label>
              <Input
                placeholder="Nom de votre cabinet"
                value={draft.emailFromName || ""}
                onChange={(e) => setDraft({ ...draft, emailFromName: e.target.value })}
                data-testid="input-email-from-name"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Rappels J-1 aux clientes</p>
                <p className="text-sm text-muted-foreground">Email envoyé la veille du RDV avec boutons confirmer / annuler.</p>
              </div>
              <Switch checked={!!draft.emailRemindersEnabled} onCheckedChange={(v) => setDraft({ ...draft, emailRemindersEnabled: v })} data-testid="switch-reminders" />
            </div>
            <div>
              <Label className="text-sm">Heure d'envoi des rappels (heure locale Europe/Bucharest)</Label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={draft.reminderHourLocal ?? 10}
                onChange={(e) => setDraft({ ...draft, reminderHourLocal: parseInt(e.target.value, 10) })}
                data-testid="select-reminder-hour"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}h00</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Récap quotidien (à vous)</p>
                <p className="text-sm text-muted-foreground">Email envoyé chaque matin avec votre planning du jour.</p>
              </div>
              <Switch checked={!!draft.dailyRecapEnabled} onCheckedChange={(v) => setDraft({ ...draft, dailyRecapEnabled: v })} data-testid="switch-recap" />
            </div>
            <div>
              <Label className="text-sm">Heure d'envoi du récap</Label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={draft.recapHourLocal ?? 10}
                onChange={(e) => setDraft({ ...draft, recapHourLocal: parseInt(e.target.value, 10) })}
                data-testid="select-recap-hour"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}h00</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card-naturo space-y-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" style={{ color: "#1b4332" }} />
            <h2 className="font-extrabold">Google Calendar</h2>
          </div>

          {!googleStatus?.configured && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>L'intégration Google Calendar n'est pas encore activée côté serveur. L'administrateur doit définir <code className="bg-secondary px-1 py-0.5 rounded text-xs">GOOGLE_CLIENT_ID</code> et <code className="bg-secondary px-1 py-0.5 rounded text-xs">GOOGLE_CLIENT_SECRET</code>.</p>
            </div>
          )}

          {googleStatus?.configured && !googleStatus?.connected && (
            <>
              <p className="text-sm text-muted-foreground">
                Connectez votre compte Google pour que chaque RDV créé soit automatiquement ajouté à votre agenda Google Calendar (et synchronisé en cas de modification ou d'annulation).
              </p>
              <Button onClick={handleConnectGoogle} className="rounded-[15px] font-bold" data-testid="button-connect-google">
                <CalendarIcon className="h-4 w-4 mr-1" /> Connecter Google Calendar
              </Button>
            </>
          )}

          {googleStatus?.configured && googleStatus?.connected && (
            <>
              <div className="flex items-center gap-2 text-sm" style={{ color: "#1b4332" }}>
                <CheckCircle2 className="h-4 w-4" />
                <span>Connecté{googleStatus.email ? <> en tant que <strong>{googleStatus.email}</strong></> : ""}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Synchronisation bidirectionnelle automatique toutes les 15 min : vos RDV Naturo Pro sont poussés vers Google,
                et vos événements Google (RDV pris ailleurs, vacances, perso) sont importés comme créneaux bloquants pour
                éviter le double-booking.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => importGoogleMut.mutate()}
                  disabled={importGoogleMut.isPending}
                  className="rounded-[15px] font-bold"
                  data-testid="button-import-google"
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${importGoogleMut.isPending ? "animate-spin" : ""}`} />
                  {importGoogleMut.isPending ? "Synchronisation…" : "Synchroniser maintenant"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => disconnectGoogleMut.mutate()}
                  disabled={disconnectGoogleMut.isPending}
                  className="rounded-[15px]"
                  data-testid="button-disconnect-google"
                >
                  <LogOut className="h-4 w-4 mr-1" /> Déconnecter
                </Button>
                <Button
                  variant="outline"
                  onClick={handleConnectGoogle}
                  className="rounded-[15px]"
                  data-testid="button-reconnect-google"
                >
                  Reconnecter
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Phase 1 — Facturation */}
        <div className="card-naturo space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">Facturation</h2>
          </div>
          <p className="text-sm text-muted-foreground">Vos coordonnées professionnelles apparaîtront sur les factures émises.</p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Raison sociale</Label>
              <Input
                value={draft.billingCompanyName || ""}
                onChange={(e) => setDraft({ ...draft, billingCompanyName: e.target.value })}
                placeholder="Cabinet Marie Dupont"
                data-testid="input-billing-company"
              />
            </div>
            <div>
              <Label>SIRET</Label>
              <Input
                value={draft.billingSiret || ""}
                onChange={(e) => setDraft({ ...draft, billingSiret: e.target.value })}
                placeholder="123 456 789 00012"
                data-testid="input-billing-siret"
              />
            </div>
            <div>
              <Label>Pays</Label>
              <Input
                value={draft.billingCountry || ""}
                onChange={(e) => setDraft({ ...draft, billingCountry: e.target.value })}
                data-testid="input-billing-country"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Adresse</Label>
              <Input
                value={draft.billingAddress || ""}
                onChange={(e) => setDraft({ ...draft, billingAddress: e.target.value })}
                data-testid="input-billing-address"
              />
            </div>
            <div>
              <Label>Code postal</Label>
              <Input
                value={draft.billingPostalCode || ""}
                onChange={(e) => setDraft({ ...draft, billingPostalCode: e.target.value })}
                data-testid="input-billing-postal"
              />
            </div>
            <div>
              <Label>Ville</Label>
              <Input
                value={draft.billingCity || ""}
                onChange={(e) => setDraft({ ...draft, billingCity: e.target.value })}
                data-testid="input-billing-city"
              />
            </div>
            <div>
              <Label>IBAN</Label>
              <Input
                value={draft.billingIban || ""}
                onChange={(e) => setDraft({ ...draft, billingIban: e.target.value })}
                placeholder="FR76 …"
                data-testid="input-billing-iban"
              />
            </div>
            <div>
              <Label>BIC</Label>
              <Input
                value={draft.billingBic || ""}
                onChange={(e) => setDraft({ ...draft, billingBic: e.target.value })}
                data-testid="input-billing-bic"
              />
            </div>
          </div>

          <div>
            <Label>Logo (PNG/JPG, max 200 Ko)</Label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 200 * 1024) {
                  toast({ title: "Image trop lourde", description: "Maximum 200 Ko", variant: "destructive" });
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setDraft({ ...draft, billingLogoBase64: reader.result as string });
                reader.readAsDataURL(file);
              }}
              className="block w-full text-sm mt-1"
              data-testid="input-billing-logo"
            />
            {draft.billingLogoBase64 && (
              <div className="flex items-center gap-3 mt-2">
                <img src={draft.billingLogoBase64} alt="Logo" className="h-16 w-auto rounded border" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft({ ...draft, billingLogoBase64: "" })}
                  className="text-destructive"
                  data-testid="button-remove-logo"
                >
                  Retirer
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label className="font-bold">TVA applicable</Label>
              <p className="text-xs text-muted-foreground">Activez si vous êtes assujettie à la TVA.</p>
            </div>
            <Switch
              checked={!!draft.billingVatEnabled}
              onCheckedChange={(v) => setDraft({ ...draft, billingVatEnabled: v })}
              data-testid="switch-vat"
            />
          </div>
          {draft.billingVatEnabled && (
            <div>
              <Label>Taux de TVA (%)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={(draft.billingVatRate ?? 2000) / 100}
                onChange={(e) => setDraft({ ...draft, billingVatRate: Math.round(Number(e.target.value) * 100) })}
                data-testid="input-vat-rate"
              />
            </div>
          )}

          <div>
            <Label>Mention légale</Label>
            <Input
              value={draft.billingLegalMention || ""}
              onChange={(e) => setDraft({ ...draft, billingLegalMention: e.target.value })}
              placeholder="Par défaut : TVA non applicable, art. 293 B du CGI."
              data-testid="input-legal-mention"
            />
          </div>
          <div>
            <Label>Conditions de paiement</Label>
            <Input
              value={draft.billingPaymentTerms || ""}
              onChange={(e) => setDraft({ ...draft, billingPaymentTerms: e.target.value })}
              placeholder="Ex : Paiement à réception"
              data-testid="input-payment-terms"
            />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label className="font-bold">Facturation automatique</Label>
              <p className="text-xs text-muted-foreground">Crée une facture en brouillon dès qu'un RDV passe en "terminé".</p>
            </div>
            <Switch
              checked={!!draft.autoInvoiceOnCompleted}
              onCheckedChange={(v) => setDraft({ ...draft, autoInvoiceOnCompleted: v })}
              data-testid="switch-auto-invoice"
            />
          </div>
        </div>

        {/* Avis Google */}
        <div className="card-naturo space-y-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5" style={{ color: "#1b4332" }} />
            <h2 className="font-extrabold">Avis Google</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Envoyez automatiquement une demande d'avis Google à vos clientes 2 jours après leur rendez-vous.
            Cela vous aide à gagner en visibilité en ligne.
          </p>

          <div>
            <Label>Lien vers votre fiche Google (URL d'avis)</Label>
            <Input
              type="url"
              placeholder="https://g.page/r/XXXXXXX/review"
              value={draft.googleReviewUrl || ""}
              onChange={(e) => setDraft({ ...draft, googleReviewUrl: e.target.value })}
              data-testid="input-google-review-url"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Trouvez ce lien dans votre Google Business Profile → « Obtenir plus d'avis ».
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="font-medium">Envoyer une demande d'avis après le RDV</p>
              <p className="text-sm text-muted-foreground">Email automatique envoyé 2 jours après chaque rendez-vous terminé.</p>
            </div>
            <Switch
              checked={!!draft.reviewRequestEnabled}
              onCheckedChange={(v) => setDraft({ ...draft, reviewRequestEnabled: v })}
              data-testid="switch-review-request"
            />
          </div>
        </div>

        {/* Paiements en ligne (Stripe) */}
        <div className="card-naturo space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" style={{ color: "#1b4332" }} />
            <h2 className="font-extrabold">Paiements en ligne (Stripe)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Demandez un <strong>acompte au moment de la réservation en ligne</strong> pour limiter les
            rendez-vous manqués. Le paiement va directement sur votre compte Stripe.
          </p>

          <div>
            <Label>Clé secrète Stripe</Label>
            <Input
              type="password"
              placeholder={draft.hasStripeSecretKey ? "•••••••••• (déjà configurée — laisser vide pour conserver)" : "sk_live_… ou sk_test_…"}
              value={draft.stripeSecretKey || ""}
              onChange={(e) => setDraft({ ...draft, stripeSecretKey: e.target.value })}
              data-testid="input-stripe-key"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {draft.hasStripeSecretKey ? "✓ Une clé est enregistrée. " : ""}
              Disponible dans votre tableau de bord Stripe → Développeurs → Clés API. Commencez par une clé de <strong>test</strong> (sk_test_…).
            </p>
          </div>

          <div>
            <Label>Acompte demandé (% du tarif de la prestation)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={draft.stripeDepositPercent ?? 0}
              onChange={(e) => setDraft({ ...draft, stripeDepositPercent: Math.max(0, Math.min(100, parseInt(e.target.value || "0", 10) || 0)) })}
              data-testid="input-stripe-deposit-percent"
            />
            <p className="text-xs text-muted-foreground mt-1">
              <strong>0 = désactivé</strong> (réservation sans paiement). Ex. 30 = la cliente paie 30 % du tarif à la réservation ;
              le rendez-vous n'est confirmé qu'après paiement. Sans effet si la prestation n'a pas de tarif.
            </p>
          </div>
        </div>

        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="rounded-[15px] font-bold" data-testid="button-save-settings">
          <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>

        {/* Lot 5 — Confidentialité (RGPD) */}
        <PrivacySection userEmail={data?.user?.email} />
      </div>
    </AppLayout>
  );
}

// ============================================================================
// Lot 5 — Section Confidentialité (RGPD) : export données + suppression compte
// ============================================================================
function PrivacySection({ userEmail }: { userEmail?: string }) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isProtected = userEmail === "marie@demo.fr" || userEmail === "jrayes000@gmail.com";

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/auth/me/export", { credentials: "include" });
      if (!res.ok) throw new Error("Échec de l'export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `naturo-pro-export-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export téléchargé", description: "Vos données ont été exportées au format JSON." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Impossible d'exporter", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!pwd || !confirmed) {
      toast({ title: "Champs requis", description: "Saisissez votre mot de passe et cochez la confirmation.", variant: "destructive" });
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: pwd, confirm: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Échec de la suppression");
      }
      toast({ title: "Compte supprimé", description: "Votre compte et toutes vos données ont été définitivement supprimés." });
      // Clear cache + redirect to landing
      queryClient.clear();
      setTimeout(() => {
        window.location.hash = "";
        window.location.reload();
      }, 1200);
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Suppression impossible", variant: "destructive" });
      setDeleting(false);
    }
  };

  return (
    <div className="card-naturo space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5" style={{ color: "#1b4332" }} />
        <h2 className="font-extrabold">Confidentialité (RGPD)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Conformément au RGPD, vous pouvez à tout moment télécharger l'intégralité de vos données ou supprimer définitivement votre compte.
      </p>

      <div className="border-t pt-4 space-y-2">
        <p className="font-medium">Exporter mes données</p>
        <p className="text-sm text-muted-foreground">
          Téléchargez un fichier JSON contenant votre profil, vos catégories, clients, RDV, notes de consultation et factures.
        </p>
        <Button
          onClick={handleExport}
          disabled={exporting}
          variant="outline"
          className="rounded-[15px] font-bold"
          data-testid="button-export-data"
        >
          <Download className="h-4 w-4 mr-1" />
          {exporting ? "Préparation…" : "Télécharger mes données"}
        </Button>
      </div>

      <div className="border-t pt-4 space-y-2">
        <p className="font-medium text-destructive">Supprimer mon compte</p>
        <p className="text-sm text-muted-foreground">
          Cette action est <strong>irréversible</strong>. Toutes vos données (clients, RDV, notes, factures) seront définitivement effacées.
        </p>
        {isProtected ? (
          <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <p className="text-amber-900">
              Ce compte est protégé et ne peut pas être supprimé depuis cette interface (compte de démonstration ou compte propriétaire).
            </p>
          </div>
        ) : (
          <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) { setPwd(""); setConfirmed(false); } }}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="rounded-[15px] font-bold" data-testid="button-delete-account">
                <Trash2 className="h-4 w-4 mr-1" />
                Supprimer définitivement mon compte
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-delete-account">
              <DialogHeader>
                <DialogTitle>Suppression définitive du compte</DialogTitle>
                <DialogDescription>
                  Cette action est <strong>irréversible</strong>. Toutes vos données seront effacées. Pour confirmer, saisissez votre mot de passe et cochez la case ci-dessous.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Mot de passe actuel</Label>
                  <Input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    autoComplete="current-password"
                    data-testid="input-delete-password"
                  />
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="confirm-delete"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                    data-testid="checkbox-confirm-delete"
                  />
                  <label htmlFor="confirm-delete" className="text-sm leading-tight cursor-pointer">
                    Je comprends que cette action est irréversible et que toutes mes données (clients, RDV, notes, factures) seront définitivement supprimées.
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  className="rounded-[15px]"
                  data-testid="button-cancel-delete"
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting || !pwd || !confirmed}
                  className="rounded-[15px] font-bold"
                  data-testid="button-confirm-delete"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deleting ? "Suppression…" : "Supprimer définitivement"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
