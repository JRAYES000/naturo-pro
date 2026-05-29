import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Save, Globe, Copy, Check, Link as LinkIcon } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
// Phase 3 Lot 2 — URL publique (path-based en mode actif, sous-domaine en attente DNS)
import { tenantPathUrl } from "@/lib/tenant";

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
        specialties: JSON.parse(data.user.specialties || "[]"),
      });
    }
  }, [data]);

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
      <div className="max-w-3xl">
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
                <Input value={draft.slug || ""} onChange={e => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} data-testid="input-slug" />
              </div>
            </div>
          </div>

          <div><Label>Photo (URL)</Label><Input value={draft.photoUrl || ""} onChange={e => setDraft({ ...draft, photoUrl: e.target.value })} placeholder="https://…" data-testid="input-photo" /></div>
          <div><Label>Bio / présentation</Label><Textarea rows={5} value={draft.bio || ""} onChange={e => setDraft({ ...draft, bio: e.target.value })} data-testid="input-bio" /></div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Téléphone</Label><Input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} data-testid="input-phone" /></div>
            <div><Label>Ville</Label><Input value={draft.city || ""} onChange={e => setDraft({ ...draft, city: e.target.value })} data-testid="input-city" /></div>
          </div>
          <div><Label>Adresse cabinet</Label><Input value={draft.address || ""} onChange={e => setDraft({ ...draft, address: e.target.value })} data-testid="input-address" /></div>

          <div>
            <Label>Spécialités (séparées par des virgules)</Label>
            <Input
              value={(draft.specialties || []).join(", ")}
              onChange={e => setDraft({ ...draft, specialties: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              data-testid="input-specialties"
            />
          </div>

          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="rounded-[15px] font-bold" data-testid="button-save-public-page">
            <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
