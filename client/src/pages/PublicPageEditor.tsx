import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ExternalLink, Save, Globe, Copy, Check, Link as LinkIcon, AlertCircle, RotateCcw, Upload,
  Image as ImageIcon, User, FileText, MapPin, Share2, Palette, Wand2, Undo2, Search,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { SubNav, PAGE_PUBLIQUE_TABS } from "@/components/SubNav";
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
import { QrCodeCard } from "@/components/QrCode";
import {
  BIO_RECOMMENDED, COLOR_PRESETS, DEFAULT_ACCENT, DEFAULT_PRIMARY, completeness, parseSpecialties,
  primaryIsReadable, slugError, slugify, socialHref, type CompletenessField,
} from "@/lib/public-page";

// Suggestions de spécialités naturo courantes (alignées sur l'onboarding).
const SPECIALTY_SUGGESTIONS = [
  "Alimentation", "Gestion du stress", "Sommeil", "Détox", "Immunité",
  "Digestion", "Féminin / hormonal", "Sportif", "Émotionnel", "Énergie",
  "Phytothérapie", "Aromathérapie",
];

/**
 * Redimensionne et compresse une image côté client avant envoi — 1200px de
 * large maximum, JPEG qualité 80. Évite les photos non compressées (plusieurs
 * Mo) qui pénalisaient le poids de la page publique (LCP) et de l'aperçu
 * Open Graph. API Canvas native du navigateur, aucune dépendance ajoutée.
 *
 * Chargement du fichier source via FileReader (data:), pas
 * URL.createObjectURL (blob:) : la CSP img-src du serveur (server/index.ts)
 * autorise "data:" mais pas "blob:" — testé en conditions réelles, la version
 * blob: échouait silencieusement (img.onerror) sans cette contrainte.
 */
function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1200;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas non disponible"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("Image invalide"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Fichier illisible"));
    reader.readAsDataURL(file);
  });
}

/** Brouillon éditable construit depuis le profil serveur (ordre des clés stable : sert à la comparaison). */
function fromUser(u: any) {
  return {
    name: u.name || "",
    slug: u.slug || "",
    bio: u.bio || "",
    photoUrl: u.photoUrl || "",
    phone: u.phone || "",
    address: u.address || "",
    city: u.city || "",
    publicPageEnabled: !!u.publicPageEnabled,
    specialties: parseSpecialties(u.specialties),
    primaryColor: u.primaryColor || DEFAULT_PRIMARY,
    accentColor: u.accentColor || DEFAULT_ACCENT,
    instagram: u.instagram || "",
    facebook: u.facebook || "",
    websiteUrl: u.websiteUrl || "",
  };
}
type Draft = ReturnType<typeof fromUser>;

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/** Champ ciblé par un clic sur un élément manquant de la complétude. */
const FIELD_IDS: Record<CompletenessField, string> = {
  name: "pp-name", photoUrl: "pp-photo", bio: "pp-bio", city: "pp-city", phone: "pp-phone", specialties: "pp-specialties",
};

function focusField(field: CompletenessField) {
  const el = document.getElementById(FIELD_IDS[field]);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const target = el.matches("input, textarea, button, label") ? el : el.querySelector<HTMLElement>("input, textarea, button");
  setTimeout(() => (target as HTMLElement | null)?.focus({ preventScroll: true }), 300);
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof User; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2 border-b border-border pb-2">
        <Icon className="h-4 w-4 text-primary mt-1 shrink-0" />
        <div>
          <h3 className="text-base">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function SocialField({ id, label, kind, value, placeholder, onChange, testId }: {
  id: string; label: string; kind: "instagram" | "facebook" | "website"; value: string;
  placeholder: string; onChange: (v: string) => void; testId: string;
}) {
  const href = socialHref(kind, value);
  const invalid = !!value.trim() && !href;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={invalid ? "border-destructive" : ""} data-testid={testId} />
      {invalid ? (
        <p className="text-xs text-destructive mt-1">Format non reconnu : ce lien ne sera pas affiché.</p>
      ) : href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary mt-1 truncate block">
          {href.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      ) : null}
    </div>
  );
}

export default function PublicPageEditor() {
  const { toast } = useToast();
  const { user, refetch } = useAuth();
  const { data } = useQuery<{ user: any }>({ queryKey: ["/api/profile"] });
  // A11 — état d'indexation calculé côté serveur (mêmes règles que le sitemap).
  const { data: seo } = useQuery<{ indexable: boolean; missing: string[] }>({
    queryKey: ["/api/profile/seo"],
  });

  // Brouillon vs état enregistré : un rechargement du profil (après une
  // publication par l'interrupteur, par exemple) n'écrase jamais une saisie en cours.
  const saved = useMemo(() => (data?.user ? fromUser(data.user) : null), [data]);
  const prevSaved = useRef<Draft | null>(null);
  const [draft, setDraft] = useState<Draft>(() => fromUser({}));
  useEffect(() => {
    if (!saved) return;
    // Valeur capturée ici : la fonction passée à setDraft s'exécute plus tard, après l'affectation de la ref.
    const before = prevSaved.current;
    setDraft((prev) => {
      const untouched = !before || same(prev, before);
      return untouched ? saved : { ...prev, publicPageEnabled: saved.publicPageEnabled };
    });
    prevSaved.current = saved;
  }, [saved]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // La publication s'enregistre seule (interrupteur) : elle ne compte pas comme modification en attente.
  const dirty = !!saved && !same({ ...draft, publicPageEnabled: saved.publicPageEnabled }, saved);
  const slugErr = slugError(draft.slug);
  const slugChanged = !!saved?.slug && draft.slug !== saved.slug;
  const { pct, missing } = completeness(draft);
  const bioLength = draft.bio.trim().length;
  const readable = primaryIsReadable(draft.primaryColor);

  const liveSlug = saved?.slug || user?.slug || "";
  const publicUrl = liveSlug ? tenantPathUrl(liveSlug) : "";
  const [copied, setCopied] = useState(false);
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

  function afterSave() {
    queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/profile/seo"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    refetch();
  }
  function saveError(e: any) {
    const taken = e?.status === 409;
    toast({
      title: taken ? "Adresse déjà prise" : "Erreur",
      description: taken ? "Une autre praticienne utilise déjà cette adresse : choisissez-en une autre." : e?.message,
      variant: "destructive",
    });
  }

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/profile", draft),
    onSuccess: () => {
      afterSave();
      toast({ title: "Page publique enregistrée", variant: "success" });
    },
    onError: saveError,
  });

  // L'interrupteur de publication agit tout de suite : c'est l'action principale
  // de la page, elle ne doit pas dépendre d'un « Enregistrer » oublié. La ville
  // saisie part avec, puisque le serveur l'exige pour publier.
  const publishMut = useMutation({
    mutationFn: async (enabled: boolean) =>
      apiRequest("PATCH", "/api/profile", {
        publicPageEnabled: enabled,
        ...(enabled && saved && draft.city !== saved.city ? { city: draft.city } : {}),
      }),
    onSuccess: (_r, enabled) => {
      afterSave();
      toast({
        title: enabled ? "Votre page est en ligne" : "Votre page est hors ligne",
        description: enabled ? "Vos clientes peuvent réserver dès maintenant." : "Votre lien affiche désormais « Page introuvable ».",
        variant: enabled ? "success" : undefined,
      });
    },
    onError: (e, enabled) => {
      set("publicPageEnabled", !enabled);
      saveError(e);
    },
  });

  const canSave = dirty && !slugErr && !saveMut.isPending;
  const save = () => { if (canSave) saveMut.mutate(); };

  // Ctrl/Cmd + S pour enregistrer, alerte avant de quitter avec des modifications en cours.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const online = !!saved?.publicPageEnabled;
  const cityMissing = !draft.city.trim();

  return (
    <AppLayout>
      <div className="max-w-6xl pb-24">
        <SubNav group="page-publique" tabs={PAGE_PUBLIQUE_TABS} />
        <PageHeader
          title="Page publique"
          subtitle="Votre vitrine en ligne : présentation, prestations et réservation."
          icon={Globe}
          actions={publicUrl && (
            <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary inline-flex items-center gap-1 hover:underline" data-testid="link-preview-public">
              Voir ma page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        />

        {/* Lot 5 (QC Page publique) — sans configuration email, les clientes qui
            réservent ne reçoivent AUCUNE confirmation, sans que rien ne le signale. */}
        {data?.user && !data.user.hasResendApiKey && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex items-start gap-2" data-testid="banner-email-not-configured">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Votre envoi d'emails n'est pas configuré.</strong> Les rappels J-1 à vos clientes sont{" "}
              <strong>inactifs</strong>, et les confirmations de réservation partent (au mieux) avec l'expéditeur
              générique Naturo Pro. Configurez votre clé Resend et votre adresse expéditeur dans{" "}
              <a href="/#/app/settings" className="underline font-semibold">Paramètres → Rappels email</a>.
            </span>
          </div>
        )}

        {/* Publication + lien : l'essentiel, en tête de page. */}
        <div className="card-naturo mb-5 space-y-4" data-testid="card-public-url">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                aria-hidden
              />
              <div>
                <p className="font-bold" data-testid="text-publication-status">
                  {online ? "Votre page est en ligne" : "Votre page est hors ligne"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {online
                    ? "Vos clientes peuvent la consulter et réserver."
                    : cityMissing
                      ? "Indiquez la ville de votre cabinet pour pouvoir la publier."
                      : "Personne ne peut la consulter tant qu'elle n'est pas publiée."}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              {online ? "Publiée" : "Publier"}
              <Switch
                checked={draft.publicPageEnabled}
                disabled={publishMut.isPending || (!draft.publicPageEnabled && cityMissing)}
                onCheckedChange={(v) => { set("publicPageEnabled", v); publishMut.mutate(v); }}
                aria-label="Publier la page"
                data-testid="switch-public-enabled"
              />
            </label>
          </div>
          {cityMissing && !online && (
            <button type="button" onClick={() => focusField("city")} className="text-xs font-bold text-amber-700 hover:underline" data-testid="button-goto-city">
              Renseigner la ville
            </button>
          )}

          <div>
            <Label htmlFor="pp-public-url" className="flex items-center gap-1.5"><LinkIcon className="h-3.5 w-3.5 text-primary" /> Votre lien à partager</Label>
            <div className="flex items-stretch gap-2 mt-1">
              <Input
                id="pp-public-url"
                readOnly
                value={publicUrl}
                className="font-mono text-sm"
                onClick={(e) => (e.target as HTMLInputElement).select()}
                data-testid="input-public-url"
              />
              <Button type="button" variant="outline" onClick={copyPublicUrl} className="font-bold shrink-0" data-testid="button-copy-public-url">
                {copied ? <Check className="h-4 w-4 sm:mr-1" /> : <Copy className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">{copied ? "Copié" : "Copier"}</span>
              </Button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Ouvrir ma page dans un nouvel onglet"
                className="inline-flex items-center justify-center px-3 rounded-md border border-input bg-background hover:bg-secondary text-sm font-bold shrink-0"
                data-testid="link-open-public-url"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              À mettre dans votre signature d'email, vos SMS, votre bio Instagram ou votre fiche Google.
            </p>
          </div>
        </div>

        {/* Complétude + référencement, regroupés : ce qui manque, en un clic. */}
        <div className="card-naturo mb-5 space-y-3" data-testid="card-completeness">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">Complétude de votre page</p>
            <span className={`text-sm font-bold ${pct === 100 ? "text-primary" : "text-amber-700"}`}>{pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? "bg-primary" : "bg-amber-500"}`}
              style={{ width: `${pct}%` }}
              data-testid="bar-completeness"
            />
          </div>
          {missing.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground mr-1">À compléter :</span>
              {missing.map((m) => (
                <button
                  key={m.field}
                  type="button"
                  onClick={() => focusField(m.field)}
                  className="px-2 py-0.5 rounded-sm bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 font-medium"
                  data-testid={`button-complete-${m.field}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-primary font-medium">Votre page est complète.</p>
          )}

          {/* Référencement (audit SEO du 15/08/2026, A11) — une fiche trop
              incomplète reste accessible par son lien mais sort du sitemap et
              de l'annuaire : autant dire lesquels champs la bloquent. */}
          {seo && (
            <div className="flex items-start gap-2 text-xs pt-3 border-t border-border" data-testid="text-seo-status">
              <Search className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${seo.indexable ? "text-primary" : "text-amber-700"}`} />
              {seo.indexable ? (
                <p>
                  <span className="font-bold text-primary">Référencée.</span>{" "}
                  <span className="text-muted-foreground">Votre fiche figure dans l'annuaire et dans le plan du site transmis à Google.</span>
                </p>
              ) : (
                <p>
                  <span className="font-bold text-amber-700">Pas encore proposée à Google.</span>{" "}
                  <span className="text-muted-foreground">
                    Il manque {seo.missing.join(", ")}. Votre page reste accessible par son lien direct.
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Deux colonnes : formulaire + aperçu live */}
        <div className="grid lg:grid-cols-[1fr,360px] gap-5 items-start">
          <div className="card-naturo space-y-8">
            <Section icon={User} title="Identité">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pp-name">Nom affiché</Label>
                  <Input id="pp-name" value={draft.name} onChange={(e) => set("name", e.target.value)} data-testid="input-name" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pp-slug">Adresse de la page</Label>
                    {draft.name.trim() && slugify(draft.name) !== draft.slug && (
                      <button type="button" onClick={() => set("slug", slugify(draft.name))}
                        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1" data-testid="button-slug-from-name">
                        <Wand2 className="h-3 w-3" /> Depuis le nom
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">/p/</span>
                    <Input
                      id="pp-slug"
                      value={draft.slug}
                      onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      className={slugErr ? "border-destructive" : ""}
                      data-testid="input-slug"
                    />
                  </div>
                  {slugErr ? (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1" data-testid="text-slug-error">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {slugErr}
                    </p>
                  ) : slugChanged && online ? (
                    <p className="text-xs text-amber-700 flex items-start gap-1 mt-1" data-testid="text-slug-change-warning">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Les liens et QR codes déjà partagés ne fonctionneront plus.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{tenantPathUrl(draft.slug)}</p>
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
                    <label id="pp-photo" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget.querySelector("input") as HTMLInputElement)?.click(); } }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-secondary text-sm font-bold cursor-pointer w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      data-testid="label-upload-photo">
                      <Upload className="h-4 w-4" />
                      {draft.photoUrl ? "Changer la photo" : "Importer une photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        data-testid="input-photo-file"
                        onChange={async (e) => {
                          const input = e.target;
                          const file = input.files?.[0];
                          if (!file) return;
                          // Garde-fou large : le fichier d'origine n'a plus besoin d'être déjà
                          // compressé (resizeImageFile s'en charge) — seuil élevé pour éviter
                          // uniquement un cas dégénéré qui ferait ramer le navigateur.
                          if (file.size > 15 * 1024 * 1024) {
                            toast({ title: "Image trop lourde", description: "Maximum 15 Mo pour le fichier d'origine.", variant: "destructive" });
                            input.value = "";
                            return;
                          }
                          try {
                            set("photoUrl", await resizeImageFile(file));
                          } catch {
                            toast({ title: "Image invalide", description: "Ce fichier ne peut pas être utilisé comme photo.", variant: "destructive" });
                          }
                          input.value = "";
                        }}
                      />
                    </label>
                    {draft.photoUrl && (
                      <button
                        type="button"
                        onClick={() => set("photoUrl", "")}
                        className="text-xs text-muted-foreground hover:text-destructive w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        data-testid="button-remove-photo"
                      >
                        Retirer la photo
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Un portrait souriant, de face, sur fond clair : c'est la première chose que vos clientes regardent.
                </p>
                <details className="mt-1">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Ou coller une URL d'image</summary>
                  <Input
                    value={draft.photoUrl.startsWith("data:") ? "" : draft.photoUrl}
                    onChange={(e) => set("photoUrl", e.target.value)}
                    placeholder="https://…"
                    className="mt-1"
                    data-testid="input-photo"
                  />
                </details>
              </div>
            </Section>

            <Section icon={FileText} title="Présentation" hint="Votre parcours, votre approche, ce que vos clientes viennent chercher.">
              <div>
                <Label htmlFor="pp-bio">Bio</Label>
                <Textarea id="pp-bio" rows={7} value={draft.bio} onChange={(e) => set("bio", e.target.value)}
                  placeholder="Ex. : Naturopathe certifiée depuis 2019, je vous accompagne sur la digestion, le sommeil et la gestion du stress…"
                  data-testid="input-bio" />
                {/* Aide à la rédaction (Action 18, 07/08/2026) — seuil aligné sur le critère
                    SEO réel (Onglet 2, Cocon 8) : une bio trop courte prive la fiche de son
                    potentiel de référencement local, indépendamment de son intérêt pour un
                    lecteur humain. */}
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="h-1 flex-1 rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full ${bioLength >= BIO_RECOMMENDED ? "bg-primary" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(100, (bioLength / BIO_RECOMMENDED) * 100)}%` }} />
                  </div>
                  <p className={`text-xs shrink-0 ${bioLength >= BIO_RECOMMENDED ? "text-muted-foreground" : "text-amber-700"}`} data-testid="text-bio-counter">
                    {bioLength} / {BIO_RECOMMENDED} {bioLength >= BIO_RECOMMENDED ? "— longueur recommandée atteinte" : "caractères recommandés"}
                  </p>
                </div>
              </div>
              <div id="pp-specialties">
                <Label>Spécialités</Label>
                <SpecialtiesInput
                  value={draft.specialties}
                  onChange={(next) => set("specialties", next)}
                  suggestions={SPECIALTY_SUGGESTIONS}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tapez une spécialité puis Entrée, ou cliquez une suggestion.
                </p>
              </div>
            </Section>

            <Section icon={MapPin} title="Coordonnées" hint="La ville est indispensable pour apparaître dans les recherches locales.">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pp-city">Ville {cityMissing && <span className="text-amber-700 font-normal">(obligatoire pour publier)</span>}</Label>
                  <Input id="pp-city" value={draft.city} onChange={(e) => set("city", e.target.value)} data-testid="input-city" />
                  {cityMissing && (
                    <p className="text-xs text-amber-700 mt-1" data-testid="text-city-warning">
                      Sans ville, votre fiche n'apparaît pas sur « naturopathe [votre ville] », les recherches les plus fréquentes.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="pp-phone">Téléphone</Label>
                  <Input id="pp-phone" type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} data-testid="input-phone" />
                </div>
              </div>
              <div>
                <Label htmlFor="pp-address">Adresse du cabinet</Label>
                <Input id="pp-address" value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="12 rue des Lilas" data-testid="input-address" />
              </div>
            </Section>

            <Section icon={Share2} title="Réseaux et site" hint="Affichés sous votre présentation, sur votre page publique.">
              <div className="grid sm:grid-cols-3 gap-3">
                <SocialField id="pp-instagram" label="Instagram" kind="instagram" value={draft.instagram} placeholder="@pseudo ou URL"
                  onChange={(v) => set("instagram", v)} testId="input-instagram" />
                <SocialField id="pp-facebook" label="Facebook" kind="facebook" value={draft.facebook} placeholder="URL de la page"
                  onChange={(v) => set("facebook", v)} testId="input-facebook" />
                <SocialField id="pp-website" label="Site web" kind="website" value={draft.websiteUrl} placeholder="monsite.fr"
                  onChange={(v) => set("websiteUrl", v)} testId="input-website" />
              </div>
            </Section>

            <Section icon={Palette} title="Apparence">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Palettes proposées">
                {COLOR_PRESETS.map((p) => {
                  const active = draft.primaryColor.toLowerCase() === p.primary.toLowerCase() && draft.accentColor.toLowerCase() === p.accent.toLowerCase();
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, primaryColor: p.primary, accentColor: p.accent }))}
                      aria-pressed={active}
                      className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-md border text-xs font-bold ${active ? "border-primary bg-secondary" : "border-input hover:bg-secondary"}`}
                      data-testid={`button-preset-${p.name.toLowerCase()}`}
                    >
                      <span className="flex">
                        <span className="h-5 w-5 rounded-sm" style={{ background: p.primary }} />
                        <span className="h-5 w-5 rounded-sm -ml-1.5" style={{ background: p.accent }} />
                      </span>
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={draft.primaryColor}
                    onChange={(e) => set("primaryColor", e.target.value)}
                    className="h-9 w-12 rounded-sm border border-input cursor-pointer bg-transparent"
                    data-testid="input-primary-color"
                  />
                  <span>Couleur principale</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={draft.accentColor}
                    onChange={(e) => set("accentColor", e.target.value)}
                    className="h-9 w-12 rounded-sm border border-input cursor-pointer bg-transparent"
                    data-testid="input-accent-color"
                  />
                  <span>Couleur d'accent</span>
                </label>
                {(draft.primaryColor !== DEFAULT_PRIMARY || draft.accentColor !== DEFAULT_ACCENT) && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT }))}
                    className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    data-testid="button-reset-colors"
                  >
                    <RotateCcw className="h-3 w-3" /> Réinitialiser
                  </button>
                )}
              </div>
              {!readable && (
                <p className="text-xs text-amber-700 flex items-start gap-1" data-testid="text-color-contrast-warning">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Couleur principale trop claire : le texte blanc des boutons « Prendre rendez-vous » sera difficile à lire.
                </p>
              )}
            </Section>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
              <Button onClick={save} disabled={!canSave} className="font-bold" data-testid="button-save-public-page">
                <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {dirty ? "Modifications non enregistrées (Ctrl + S)" : "Tout est enregistré."}
              </span>
            </div>
          </div>

          {/* Aperçu live + QR code */}
          <div className="lg:sticky lg:top-4 space-y-5">
            <div>
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
                instagram={draft.instagram}
                facebook={draft.facebook}
                websiteUrl={draft.websiteUrl}
                offline={!draft.publicPageEnabled}
              />
            </div>
            {/* Lot 2c — QR code imprimable de la page de réservation. */}
            {publicUrl && <QrCodeCard url={publicUrl} fileName={`qr-reservation-${liveSlug || "page"}`} compact />}
          </div>
        </div>
      </div>

      {/* Barre d'enregistrement flottante, visible dès qu'une modification attend. */}
      {dirty && (
        <div
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 rounded-lg bg-card shadow-lg px-4 py-3 flex items-center gap-3"
          role="status"
          data-testid="bar-unsaved-changes"
        >
          <span className="text-sm font-bold flex-1 sm:flex-none">Modifications non enregistrées</span>
          <Button variant="ghost" size="sm" onClick={() => saved && setDraft(saved)} disabled={saveMut.isPending} data-testid="button-discard-changes">
            <Undo2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Annuler</span>
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave} className="font-bold" data-testid="button-save-bar">
            <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      )}
    </AppLayout>
  );
}
