import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Sparkles, Clock, ArrowRight, Leaf, Heart, ShieldCheck, AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatPrice, durationLabel } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";
import { brandThemeVars } from "@/lib/brand-theme";
// Phase 3 Lot 2 — fallback sous-domaine
import { getCurrentTenant, isOnTenantSubdomain } from "@/lib/tenant";

interface PublicData {
  naturo: { name: string; slug: string; bio: string; photoUrl: string | null; city: string | null; address: string | null; specialties: string[]; primaryColor: string; accentColor: string; };
  categories: { id: number; name: string; durationMinutes: number; priceCents: number; location: string; description: string | null; color: string; }[];
}

function PublicPageSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label="Chargement de la page">
      {/* Header skeleton */}
      <header className="border-b border-border bg-background/80 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-10 w-36 rounded-[15px]" />
        </div>
      </header>
      {/* Hero skeleton */}
      <section className="leaf-bg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid lg:grid-cols-[280px,1fr] gap-8 items-center">
          <div className="flex justify-center lg:justify-start">
            <Skeleton className="h-52 w-52 rounded-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-20 w-full max-w-xl" />
            <div className="flex gap-2 flex-wrap">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
            <Skeleton className="h-12 w-44 rounded-[15px]" />
          </div>
        </div>
      </section>
      {/* Services skeleton */}
      <section className="py-12 lg:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <Skeleton className="h-4 w-32 mx-auto mb-2" />
            <Skeleton className="h-8 w-56 mx-auto" />
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {[1, 2].map(i => (
              <div key={i} className="card-naturo space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-3">
                  <Skeleton className="h-7 w-20 rounded-md" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                </div>
                <Skeleton className="h-11 w-full rounded-[15px]" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function PublicPage() {
  const params = useParams<{ slug?: string }>();
  // Phase 3 Lot 2 — sur un sous-domaine, pas de slug dans l'URL : on appelle _self.
  const tenant = getCurrentTenant();
  const onSub = isOnTenantSubdomain();
  const effectiveSlug = params.slug ?? tenant ?? "";
  const endpoint = onSub ? "/api/public/_self" : `/api/public/${effectiveSlug}`;
  const { data, isLoading, error } = useQuery<PublicData>({
    queryKey: ["/api/public", onSub ? "_self" : effectiveSlug],
    queryFn: async () => (await apiRequest("GET", endpoint)).json(),
    enabled: onSub || !!effectiveSlug,
    retry: 2,
  });

  // Document title — update when practitioner name is known
  useEffect(() => {
    if (data?.naturo?.name) {
      document.title = `${data.naturo.name} — Naturo Pro`;
    } else {
      document.title = "Naturo Pro";
    }
    return () => { document.title = "Naturo Pro"; };
  }, [data?.naturo?.name]);

  if (isLoading) return <PublicPageSkeleton />;

  if (error || !data || !data.naturo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4" data-testid="public-page-error">
        <div className="max-w-sm w-full text-center">
          <div className="h-16 w-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-extrabold mb-2 text-heading">Page introuvable</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            Ce naturopathe n'existe pas ou sa page est désactivée.
          </p>
          {error && (
            <Alert variant="destructive" className="text-left mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Erreur réseau — vérifiez votre connexion et rechargez la page.
              </AlertDescription>
            </Alert>
          )}
          <Link href="/" className="btn-primary-naturo inline-flex" data-testid="link-go-home">
            Aller à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  const { naturo, categories } = data;
  // Phase 3 Lot 2 — sur un sous-domaine, les liens internes utilisent /book ;
  // sinon ils utilisent /p/:slug/book (compat URLs partagées).
  const bookHref = onSub ? "/book" : `/p/${naturo.slug}/book`;
  // Couleur personnalisée de la praticienne (fallback sur le thème par défaut).
  const primary = naturo.primaryColor || "#186749";

  return (
    <div className="min-h-screen bg-background" style={brandThemeVars(naturo.primaryColor, naturo.accentColor)}>
      {/* Header minimal */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <Link href="/"><Logo /></Link>
          <Link
            href={bookHref}
            className="btn-primary-naturo text-sm py-2.5 sm:py-3 px-4 sm:px-6 whitespace-nowrap"
            data-testid="cta-header-book"
          >
            Prendre rendez-vous <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="leaf-bg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 lg:py-20 grid lg:grid-cols-[280px,1fr] gap-8 lg:gap-10 items-center">
          <div className="flex justify-center lg:justify-start">
            {naturo.photoUrl ? (
              <img
                src={naturo.photoUrl}
                alt={naturo.name}
                className="h-44 w-44 sm:h-56 sm:w-56 rounded-full object-cover border-4 border-card shadow-xl"
              />
            ) : (
              <div
                className="h-44 w-44 sm:h-56 sm:w-56 rounded-full text-white flex items-center justify-center text-5xl sm:text-6xl font-extrabold border-4 border-card shadow-xl"
                style={{ background: primary }}
                aria-label={`Initiale de ${naturo.name}`}
              >
                {naturo.name[0]}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-primary uppercase tracking-wider mb-2">Naturopathe certifié(e)</p>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4 leading-tight"
              style={{ color: primary }}
              data-testid="text-practitioner-name"
            >
              {naturo.name}
            </h1>
            {(naturo.city || naturo.address) && (
              <p className="text-muted-foreground flex items-center gap-2 mb-4 text-sm" data-testid="text-practitioner-location">
                <MapPin className="h-4 w-4 shrink-0" />
                {[naturo.address, naturo.city].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="text-base sm:text-lg leading-relaxed mb-5 max-w-xl">
              {naturo.bio || "Naturopathe à votre écoute pour vous accompagner vers une santé naturelle."}
            </p>
            {naturo.specialties.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {naturo.specialties.map(s => (
                  <span key={s} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: `${primary}1a`, color: primary }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
            <Link href={bookHref} className="btn-primary-naturo" style={{ background: primary }} data-testid="cta-hero-book">
              Prendre rendez-vous <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-12 lg:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 sm:mb-10">
            <p className="text-sm font-bold text-primary uppercase tracking-wider mb-2">Mes prestations</p>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-heading">
              Nos consultations
            </h2>
          </div>
          {categories.length === 0 ? (
            <div className="card-naturo text-center py-12" data-testid="text-no-services">
              <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-bold mb-1">Aucune prestation disponible</p>
              <p className="text-sm text-muted-foreground">Les prestations seront bientôt disponibles.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-5">
              {categories.map(c => (
                <div key={c.id} className="card-naturo flex flex-col" data-testid={`service-${c.id}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className="h-3 w-3 rounded-full mt-2 shrink-0" style={{ background: c.color }} />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg sm:text-xl font-extrabold mb-1 leading-snug">{c.name}</h3>
                      {c.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{c.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm mb-4">
                    <span className="bg-secondary text-primary font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1 whitespace-nowrap">
                      <Clock className="h-3.5 w-3.5 shrink-0" /> {durationLabel(c.durationMinutes)}
                    </span>
                    <span className="font-extrabold text-primary text-base whitespace-nowrap">
                      {formatPrice(c.priceCents)}
                    </span>
                    <span className="text-muted-foreground capitalize whitespace-nowrap">· {c.location}</span>
                  </div>
                  <div className="mt-auto">
                    <Link
                      href={`${bookHref}?cat=${c.id}`}
                      className="w-full btn-primary-naturo justify-center"
                      data-testid={`button-book-${c.id}`}
                    >
                      Réserver <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Trust */}
      <section className="py-12 lg:py-16 bg-secondary/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid sm:grid-cols-3 gap-6 sm:gap-8 text-center">
          <div>
            <Leaf className="h-10 w-10 mx-auto mb-3 text-primary" />
            <h3 className="font-extrabold mb-1">Approche naturelle</h3>
            <p className="text-sm text-muted-foreground">Solutions douces et personnalisées, à votre rythme.</p>
          </div>
          <div>
            <Heart className="h-10 w-10 mx-auto mb-3 text-primary" />
            <h3 className="font-extrabold mb-1">À votre écoute</h3>
            <p className="text-sm text-muted-foreground">Un accompagnement bienveillant et sans jugement.</p>
          </div>
          <div>
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-primary" />
            <h3 className="font-extrabold mb-1">Confidentialité</h3>
            <p className="text-sm text-muted-foreground">Vos données sont protégées et restent confidentielles.</p>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-12 lg:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <Sparkles className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3 text-heading">
            Prêt(e) à commencer&nbsp;?
          </h2>
          <p className="text-muted-foreground mb-6 text-sm sm:text-base">
            Réservez en ligne en quelques clics. Confirmation immédiate par email.
          </p>
          <Link href={bookHref} className="btn-primary-naturo inline-flex" data-testid="cta-final-book">
            Prendre rendez-vous <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-6 sm:py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row gap-2 sm:gap-3 items-center justify-between text-sm text-muted-foreground">
          <span>© 2025 {naturo.name}</span>
          <span>
            Page propulsée par{" "}
            <Link href="/" className="text-primary font-bold">
              Naturo Pro
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
