import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Save, Globe, Copy, Check, Link as LinkIcon, AlertCircle, RotateCcw } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
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
      toast({ title: "Page publique enregistrée" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold" style={{ color: "#1b4332" }}>Ma page publique</h1>
            <p className="text-muted-foreground text-sm mt-1">L'écran que voient vos clientes lorsqu'elles veulent prendre RDV.</p>
          </div>
          {user && (
            <a href={`/#/p/${user.slug}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary inline-flex items-center gap-1 hover:underline" data-testid="link-preview-public">
              Aperçu <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

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
              className="rounded-[15px] font-bold"
              data-testid="button-copy-public-url"
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copié" : "Copier"}
            </Button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-3 rounded-[15px] border border-input bg-background hover:bg-secondary text-sm font-bold"
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
              <Label>Photo (URL)</Label>
              <div className="flex items-center gap-3">
                {draft.photoUrl ? (
                  <img
                    src={draft.photoUrl}
                    alt="Aperçu"
                    className="h-14 w-14 rounded-full object-cover border border-input shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    onLoad={(e) => { (e.target as HTMLImageElement).style.display = ""; }}
                    data-testid="img-photo-preview"
                  />
                ) : null}
                <Input value={draft.photoUrl || ""} onChange={e => setDraft({ ...draft, photoUrl: e.target.value })} placeholder="https://…" data-testid="input-photo" />
              </div>
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

            {/* Couleurs du thème */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Couleurs de votre page</Label>
                {(draft.primaryColor !== DEFAULT_PRIMARY || draft.accentColor !== DEFAULT_ACCENT) && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT })}
                    className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
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
              className="rounded-[15px] font-bold"
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
