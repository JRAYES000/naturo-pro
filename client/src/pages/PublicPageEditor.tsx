import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Save, Globe, Copy, Check, Link as LinkIcon, AlertCircle, RotateCcw, Upload, Image as ImageIcon } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { SpecialtiesInput } from "@/components/SpecialtiesInput";
import { PublicPagePreview } from "@/components/PublicPagePreview";
// Phase 3 Lot 2 — URL publique (path-based en mode actif, sous-domaine en attente DNS)
import { tenantPathUrl } from "@/lib/tenant";

// Suggestions de spécialités naturo courantes (alignées sur l'onboarding).
const SPECIALTY_SUGGESTIONS = [
  "Alimentation", "Gestion du stress", "Sommeil", "Détox", "Immunité",
  "Digestion", "Féminin / hormonal", "Sportif", "Émotionnel", "Énergie",
  "Phytothérapie", "Aromathérapie",
];

const DEFAULT_PRIMARY = "#186749";
const DEFAULT_ACCENT = "#17EC9B";

/** Parse défensif des spécialités stockées (JSON array en DB). Ne plante jamais. */
function parseSpecialties(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Validation de format du slug (pas de vérif de disponibilité réseau ici). */
function slugError(slug: string): string | null {
  if (!slug) return "L'URL ne peut pas être vide.";
  if (slug.length < 3) return "Au moins 3 caractères.";
  if (!/^[a-z0-9-]+$/.test(slug)) return "Lettres minuscules, chiffres et tirets uniquement.";
  if (/^-|-$/.test(slug)) return "Ne doit pas commencer ni finir par un tiret.";
  return null;
}

/** Pourcentage de complétude du profil public (champs qui valorisent la page). */
function completeness(draft: any): { pct: number; missing: string[] } {
  const checks: Array<[boolean, string]> = [
    [!!draft.name?.trim(), "Nom"],
    [!!draft.photoUrl?.trim(), "Photo"],
    [!!draft.bio?.trim(), "Bio"],
    [!!draft.city?.trim(), "Ville"],
    [!!draft.phone?.trim(), "Téléphone"],
    [(draft.specialties?.length || 0) > 0, "Spécialités"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  const pct = Math.round((done / checks.length) * 100);
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return { pct, missing };
}

export default function PublicPageEditor() {
  const { toast } = useToast();
  const { user, refetch } = useAuth();
  const { data } = useQuery<{ user: any }>({ queryKey: ["/api/profile"] });
  const [draft, setDraft] = useState<any>({});
  // Phase 3 Lot 2 — feedback "copié"
  const [copied, setCopied] = useState(false);
  const publicUrl = user?.slug ? tenantPathUrl(user.slug) : "";
  async function copyPublicUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Lien copié" });
    } catch {
      toast({ title: "Impossible de copier", variant: "destructive" });
    }
  }
  useEffect(() => {
    if (data?.user) {
      setDraft({
        name: data.user.name,
        slug: data.user.slug,
        bio: data.user.bio || "",
        photoUrl: data.user.photoUrl || "",
        phone: data.user.phone || "",
        address: data.user.address || "",
        city: data.user.city || "",
        publicPageEnabled: !!data.user.publicPageEnabled,
        specialties: parseSpecialties(data.user.specialties),
        primaryColor: data.user.primaryColor || DEFAULT_PRIMARY,
        accentColor: data.user.accentColor || DEFAULT_ACCENT,
        instagram: data.user.instagram || "",
        facebook: data.user.facebook || "",
        websiteUrl: data.user.websiteUrl || "",
      });
    }
  }, [data]);

  const slugErr = slugError(draft.slug || "");
  const { pct, missing } = completeness(draft);

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/profile", draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetch();
      toast({ title: "Page publique enregistrée", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <PageHeader
          title="Page publique"
          subtitle="Personnalisez votre page de réservation en ligne."
          icon={Globe}
          actions={user && (
            <a href={`/#/p/${user.slug}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary inline-flex items-center gap-1 hover:underline" data-testid="link-preview-public">
              Aperçu <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        />

        {/* Phase 3 Lot 2 — Lien public sur sous-domaine personnel */}
        <div className="card-naturo space-y-3 mb-5" data-testid="card-public-url">
          <div className="flex items-center gap-3">
            <LinkIcon className="h-5 w-5 text-primary" />
            <div>
              <p className="font-bold">Votre lien public</p>
              <p className="text-xs text-muted-foreground">
                L'adresse à partager avec vos clients pour accéder à votre page et réserver.
              </p>
            </div>
          </div>
          <div className="flex items-stretch gap-2">
            <Input
              readOnly
              value={publicUrl}
              className="font-mono text-sm"
              onClick={(e) => (e.target as HTMLInputElement).select()}
              data-testid="input-public-url"
            />
            <Button
              type="button"
              variant="outline"
              onClick={copyPublicUrl}
              className="rounded-lg font-bold"
              data-testid="button-copy-public-url"
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copié" : "Copier"}
            </Button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-3 rounded-lg border border-input bg-background hover:bg-secondary text-sm font-bold"
              data-testid="link-open-public-url"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Partagez ce lien avec vos clients par email, SMS ou sur vos réseaux sociaux.
          </p>
        </div>

        {/* Barre de complétude du profil */}
        <div className="card-naturo mb-5" data-testid="card-completeness">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-sm">Complétude de votre page</p>
            <span className="text-sm font-extrabold" style={{ color: pct === 100 ? DEFAULT_PRIMARY : "#b45309" }}>
              {pct}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: pct === 100 ? DEFAULT_PRIMARY : "#f59e0b" }}
              data-testid="bar-completeness"
            />
          </div>
          {missing.length > 0 ? (
            <p className="text-xs text-muted-foreground mt-2">
              À compléter pour une page plus attractive : <span className="font-medium">{missing.join(", ")}</span>.
            </p>
          ) : (
            <p className="text-xs text-primary font-medium mt-2">Votre page est complète. 🎉</p>
          )}
        </div>

        {/* Deux colonnes : formulaire + aperçu live */}
        <div className="grid lg:grid-cols-[1fr,360px] gap-5 items-start">
          <div className="card-naturo space-y-5">
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-bold">Page publique active</p>
                  <p className="text-xs text-muted-foreground">Désactivez pour rendre votre page privée.</p>
                </div>
              </div>
              <Switch checked={!!draft.publicPageEnabled} onCheckedChange={(v) => setDraft({ ...draft, publicPageEnabled: v })} data-testid="switch-public-enabled" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Nom affiché</Label><Input value={draft.name || ""} onChange={e => setDraft({ ...draft, name: e.target.value })} data-testid="input-name" /></div>
              <div>
                <Label>URL personnalisée</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/p/</span>
                  <Input
                    value={draft.slug || ""}
                    onChange={e => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    className={slugErr ? "border-destructive" : ""}
                    data-testid="input-slug"
                  />
                </div>
                {slugErr ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1" data-testid="text-slug-error">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {slugErr}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {tenantPathUrl(draft.slug || "")}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Photo de profil</Label>
              <div className="flex items-center gap-3">
                {draft.photoUrl ? (
                  <img
                    src={draft.photoUrl}
                    alt="Aperçu"
                    className="h-16 w-16 rounded-full object-cover border border-input shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    onLoad={(e) => { (e.target as HTMLImageElement).style.display = ""; }}
                    data-testid="img-photo-preview"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background hover:bg-secondary text-sm font-bold cursor-pointer w-fit" data-testid="label-upload-photo">
                    <Upload className="h-4 w-4" />
                    {draft.photoUrl ? "Changer la photo" : "Importer une photo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      data-testid="input-photo-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 1024 * 1024) {
                          toast({ title: "Image trop lourde", description: "Maximum 1 Mo. Compressez l'image et réessayez.", variant: "destructive" });
                          e.target.value = "";
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => setDraft({ ...draft, photoUrl: reader.result as string });
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {draft.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, photoUrl: "" })}
                      className="text-xs text-muted-foreground hover:text-destructive w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      data-testid="button-remove-photo"
                    >
                      Retirer la photo
                    </button>
                  )}
                </div>
              </div>
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">Ou coller une URL d'image</summary>
                <Input
                  value={draft.photoUrl?.startsWith("data:") ? "" : (draft.photoUrl || "")}
                  onChange={e => setDraft({ ...draft, photoUrl: e.target.value })}
                  placeholder="https://…"
                  className="mt-1"
                  data-testid="input-photo"
                />
              </details>
            </div>
            <div><Label>Bio / présentation</Label><Textarea rows={5} value={draft.bio || ""} onChange={e => setDraft({ ...draft, bio: e.target.value })} data-testid="input-bio" /></div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Téléphone</Label><Input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} data-testid="input-phone" /></div>
              <div><Label>Ville</Label><Input value={draft.city || ""} onChange={e => setDraft({ ...draft, city: e.target.value })} data-testid="input-city" /></div>
            </div>
            <div><Label>Adresse cabinet</Label><Input value={draft.address || ""} onChange={e => setDraft({ ...draft, address: e.target.value })} data-testid="input-address" /></div>

            <div>
              <Label>Spécialités</Label>
              <SpecialtiesInput
                value={draft.specialties || []}
                onChange={(next) => setDraft({ ...draft, specialties: next })}
                suggestions={SPECIALTY_SUGGESTIONS}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tapez une spécialité puis Entrée, ou cliquez une suggestion. Ces étiquettes s'affichent sur votre page publique.
              </p>
            </div>

            {/* Réseaux sociaux */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div><Label>Instagram</Label><Input value={draft.instagram || ""} onChange={e => setDraft({ ...draft, instagram: e.target.value })} placeholder="@pseudo ou URL" data-testid="input-instagram" /></div>
              <div><Label>Facebook</Label><Input value={draft.facebook || ""} onChange={e => setDraft({ ...draft, facebook: e.target.value })} placeholder="URL de la page" data-testid="input-facebook" /></div>
              <div><Label>Site web</Label><Input value={draft.websiteUrl || ""} onChange={e => setDraft({ ...draft, websiteUrl: e.target.value })} placeholder="https://…" data-testid="input-website" /></div>
            </div>

            {/* Couleurs du thème */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Couleurs de votre page</Label>
                {(draft.primaryColor !== DEFAULT_PRIMARY || draft.accentColor !== DEFAULT_ACCENT) && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT })}
                    className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    data-testid="button-reset-colors"
                  >
                    <RotateCcw className="h-3 w-3" /> Réinitialiser
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={draft.primaryColor || DEFAULT_PRIMARY}
                    onChange={e => setDraft({ ...draft, primaryColor: e.target.value })}
                    className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent"
                    data-testid="input-primary-color"
                  />
                  <span>Couleur principale</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={draft.accentColor || DEFAULT_ACCENT}
                    onChange={e => setDraft({ ...draft, accentColor: e.target.value })}
                    className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent"
                    data-testid="input-accent-color"
                  />
                  <span>Couleur d'accent</span>
                </label>
              </div>
            </div>

            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !!slugErr}
              className="rounded-lg font-bold"
              data-testid="button-save-public-page"
            >
              <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>

          {/* Aperçu live */}
          <div className="lg:sticky lg:top-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Aperçu en direct</p>
            <PublicPagePreview
              name={draft.name}
              bio={draft.bio}
              photoUrl={draft.photoUrl}
              city={draft.city}
              address={draft.address}
              specialties={draft.specialties}
              primaryColor={draft.primaryColor}
              accentColor={draft.accentColor}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
