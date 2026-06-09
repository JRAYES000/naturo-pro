import { useState } from "react";
import { Link } from "wouter";
import {
  Calendar, CalendarClock, Globe, Video, Users, ClipboardList, FileText,
  Sprout, BookOpen, Package, Receipt, CreditCard, BellRing, BarChart3,
  ShieldCheck, Leaf, Heart, Sparkles, ArrowRight, Check, ChevronDown, MapPin,
} from "lucide-react";
import { Logo } from "@/components/Logo";

// Listing complet des fonctionnalités, affiché en "chips" dans le hero.
const HERO_FEATURES = [
  "Agenda intelligent",
  "Réservation en ligne",
  "Synchronisation Google Agenda",
  "Rendez-vous en visio (Google Meet)",
  "Dossiers clients enrichis",
  "Anamnèses personnalisées",
  "Notes de consultation",
  "Programmes d'hygiène de vie",
  "Bibliothèque de solutions naturelles",
  "Forfaits & carnets de séances",
  "Facturation conforme & PDF",
  "Acompte en ligne (Stripe)",
  "Rappels automatiques",
  "Statistiques & export comptable",
  "Conformité RGPD",
];

// Fonctionnalités détaillées (toutes réelles, vérifiées dans le code).
const FEATURES = [
  { Icon: Calendar, title: "Agenda intelligent", desc: "Vues mois, semaine, jour et agenda. Rendez-vous récurrents, couleurs par prestation, rendez-vous bloqués." },
  { Icon: Globe, title: "Page publique de réservation", desc: "Une page à votre nom (photo, bio, spécialités, couleurs) où vos clients réservent en ligne selon vos disponibilités, sans créer de compte." },
  { Icon: CalendarClock, title: "Synchronisation Google Agenda", desc: "Connectez votre Google Agenda : synchronisation bidirectionnelle automatique et import de vos événements externes comme créneaux bloquants." },
  { Icon: Video, title: "Consultations en visio", desc: "Un lien Google Meet est généré automatiquement pour vos rendez-vous à distance, ajouté à la confirmation envoyée au client." },
  { Icon: Users, title: "Dossiers clients enrichis", desc: "Coordonnées, antécédents, allergies, hygiène de vie, pense-bête privé, et documents joints (analyses, bilans)." },
  { Icon: ClipboardList, title: "Anamnèses personnalisées", desc: "Créez vos questionnaires de bilan (émonctoires, tempéraments, échelles…) et envoyez un lien que le client remplit en ligne avant la séance." },
  { Icon: FileText, title: "Notes de consultation structurées", desc: "Comptes-rendus au format naturo (motif, anamnèse, bilan, conseils alimentaires, hygiène de vie, suivi) avec sauvegarde automatique." },
  { Icon: Sprout, title: "Programmes d'hygiène de vie", desc: "Construisez des protocoles personnalisés par sections (alimentation, phytothérapie, activité physique…) et exportez-les en PDF professionnel." },
  { Icon: BookOpen, title: "Bibliothèque de solutions naturelles", desc: "Un catalogue de plantes, huiles essentielles, compléments et fleurs de Bach (propriétés, conseils, contre-indications), réutilisable dans vos programmes." },
  { Icon: Package, title: "Forfaits & carnets de séances", desc: "Vendez des packs de séances prépayées et suivez la consommation de chaque client d'un coup d'œil." },
  { Icon: Receipt, title: "Facturation conforme", desc: "Factures PDF personnalisées (logo, SIRET, TVA, numérotation automatique), envoi par email, facturation automatique en fin de rendez-vous." },
  { Icon: CreditCard, title: "Acompte en ligne", desc: "Demandez un acompte à la réservation via Stripe pour limiter les rendez-vous manqués. Le paiement arrive directement sur votre compte." },
  { Icon: BellRing, title: "Rappels & emails automatiques", desc: "Confirmation, rappel J-1, récapitulatif quotidien et demande d'avis Google — automatiques. Modèles d'emails entièrement personnalisables." },
  { Icon: BarChart3, title: "Statistiques & comptabilité", desc: "Chiffre d'affaires, rendez-vous réalisés, prestations phares… et export CSV du journal des recettes pour votre comptable." },
  { Icon: ShieldCheck, title: "Conformité RGPD", desc: "Vous gardez le contrôle : export complet de vos données et suppression définitive de votre compte à tout moment." },
];

const WHY = [
  { Icon: MapPin, title: "100 % français", desc: "Une interface intégralement en français, conçue pour les pratiques francophones. Aucun jargon, aucune traduction approximative." },
  { Icon: Sparkles, title: "Simple à utiliser", desc: "Pensé pour aller à l'essentiel. Prise en main rapide, sans formation : vous êtes opérationnel dès la première séance." },
  { Icon: ShieldCheck, title: "Vos données sous contrôle", desc: "Accès protégé par mot de passe, export et suppression de l'ensemble de vos données quand vous le souhaitez (RGPD)." },
  { Icon: Leaf, title: "Pensé pour les naturopathes", desc: "Anamnèses, programmes d'hygiène de vie, bibliothèque de solutions naturelles : de vrais outils métier, pas un agenda générique." },
];

const FAQ = [
  { q: "Qu'est-ce que Naturo Pro ?", a: "Naturo Pro est un logiciel tout-en-un pour gérer votre cabinet de naturopathie : agenda, réservation en ligne, dossiers clients, anamnèses, notes de consultation, programmes d'hygiène de vie, facturation et statistiques — au même endroit." },
  { q: "Comment fonctionne l'essai gratuit ?", a: "Vous créez votre compte et profitez d'un essai gratuit, sans carte bancaire. Vous pouvez tester l'ensemble des fonctionnalités et configurer votre cabinet à votre rythme." },
  { q: "Mes données et celles de mes clients sont-elles sécurisées ?", a: "Oui. L'accès est protégé par mot de passe et chaque praticien ne voit que ses propres données. Conformément au RGPD, vous pouvez à tout moment exporter l'intégralité de vos données ou supprimer définitivement votre compte." },
  { q: "Mes clients peuvent-ils réserver en ligne ?", a: "Oui. Chaque praticien dispose d'une page publique personnalisable où ses clients réservent en autonomie, en fonction des disponibilités que vous définissez. Ils peuvent aussi annuler ou reporter leur rendez-vous via un lien sécurisé." },
  { q: "Les consultations à distance sont-elles gérées ?", a: "Oui. En connectant votre compte Google, un lien Google Meet est généré automatiquement pour vos rendez-vous en visio et transmis au client dans l'email de confirmation." },
  { q: "Puis-je éditer des factures conformes ?", a: "Oui : factures PDF personnalisées avec votre logo, votre SIRET, la TVA si vous y êtes assujetti et une numérotation automatique. Vous pouvez les envoyer par email et exporter votre journal des recettes au format CSV pour votre comptable." },
  { q: "Naturo Pro fonctionne-t-il sur mobile ?", a: "Oui. L'application s'utilise depuis votre navigateur sur ordinateur, tablette ou smartphone — aucune installation n'est nécessaire." },
  { q: "Puis-je résilier et supprimer mon compte ?", a: "À tout moment, directement depuis vos paramètres. La suppression est définitive et efface l'ensemble de vos données." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-naturo">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 text-left"
        aria-expanded={open}
        data-testid={`faq-toggle-${q.slice(0, 12)}`}
      >
        <span className="font-extrabold text-lg" style={{ color: "#1b4332" }}>{q}</span>
        <ChevronDown className={`h-5 w-5 text-primary shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="text-muted-foreground leading-relaxed mt-4">{a}</p>}
    </div>
  );
}

export default function Landing() {
  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-3">
            <button onClick={() => scrollToId("fonctionnalites")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-[15px] hover:bg-secondary transition" data-testid="nav-features">Fonctionnalités</button>
            <button onClick={() => scrollToId("pourquoi")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-[15px] hover:bg-secondary transition" data-testid="nav-why">Pourquoi</button>
            <button onClick={() => scrollToId("faq")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-[15px] hover:bg-secondary transition" data-testid="nav-faq">FAQ</button>
            <Link href="/login" className="text-sm font-bold px-3 sm:px-4 py-2 rounded-[15px] hover:bg-secondary transition" data-testid="link-login">Connexion</Link>
            <Link href="/register" className="btn-primary-naturo text-sm" data-testid="link-register">Créer un compte</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="leaf-bg">
        <div className="max-w-5xl mx-auto px-6 py-20 lg:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-primary text-xs font-bold mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Le logiciel pensé par et pour les naturopathes
          </div>
          <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight mb-6" style={{ color: "#1b4332" }}>
            Gérez tout votre cabinet de naturopathie,<br />
            <span style={{ color: "#186749" }}>au même endroit.</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
            Fini les fichiers éparpillés. Naturo Pro centralise votre agenda, vos dossiers clients, vos anamnèses, vos comptes-rendus, votre facturation et votre page de réservation en ligne.
          </p>

          {/* Listing des fonctionnalités (chips) */}
          <div className="flex flex-wrap justify-center gap-2 mb-10 max-w-4xl mx-auto">
            {HERO_FEATURES.map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-sm font-bold text-primary">
                <Check className="h-3.5 w-3.5 text-accent" />
                {f}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-3 mb-6">
            <Link href="/register" className="btn-primary-naturo" data-testid="cta-hero-register">
              Démarrer gratuitement <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/p/marie-dupont" className="inline-flex items-center justify-center gap-2 rounded-[15px] border border-primary/20 px-6 py-3 font-bold text-primary hover:bg-secondary transition" data-testid="cta-hero-demo">
              Voir une page publique
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-14">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Sans engagement</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Essai gratuit, sans carte bancaire</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> En français</span>
          </div>

          {/* Aperçu / mockup */}
          <div className="relative max-w-3xl mx-auto">
            <div className="card-naturo p-0 overflow-hidden text-left">
              <img
                src="https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=1200&q=80"
                alt="Tisane et nature, ambiance naturopathie"
                className="w-full h-64 lg:h-80 object-cover"
              />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=80" alt="" className="h-10 w-10 rounded-full object-cover" />
                  <div>
                    <p className="font-extrabold">Marie Dupont</p>
                    <p className="text-xs text-muted-foreground">Naturopathe certifiée • Lyon</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  3 rendez-vous aujourd'hui • 2 nouvelles réservations cette semaine
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-secondary rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Cette sem.</p>
                    <p className="font-extrabold text-primary">12 RDV</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Clients</p>
                    <p className="font-extrabold text-primary">38</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Page vue</p>
                    <p className="font-extrabold text-primary">204×</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 hidden md:block">
              <div className="card-naturo p-3 flex items-center gap-3 max-w-[240px]">
                <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center"><Heart className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="font-bold text-sm">Nouveau RDV</p>
                  <p className="text-xs text-muted-foreground">Sophie a réservé un suivi</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features détaillées */}
      <section id="fonctionnalites" className="py-20 lg:py-28 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-bold text-primary mb-3 uppercase tracking-wider">Tout-en-un</p>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-4" style={{ color: "#1b4332" }}>
              Un logiciel complet, pensé pour les naturopathes.
            </h2>
            <p className="text-muted-foreground text-lg">
              Pas besoin de jongler entre dix outils. Naturo Pro réunit tout ce dont vous avez besoin pour gérer votre activité au quotidien.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="card-naturo hover:-translate-y-1 transition">
                <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center text-primary mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-extrabold mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pourquoi Naturo Pro */}
      <section id="pourquoi" className="py-20 lg:py-28 bg-muted/40 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-bold text-primary mb-3 uppercase tracking-wider">Pourquoi Naturo Pro</p>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-4" style={{ color: "#1b4332" }}>
              Un outil fiable, simple et vraiment à votre image.
            </h2>
            <p className="text-muted-foreground text-lg">
              Une solution conçue pour les praticiens, qui vous laisse vous concentrer sur l'essentiel : l'accompagnement de vos clients.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY.map(({ Icon, title, desc }) => (
              <div key={title} className="card-naturo">
                <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center text-primary mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-extrabold mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 lg:py-28 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-bold text-primary mb-3 uppercase tracking-wider">FAQ</p>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-4" style={{ color: "#1b4332" }}>
              Questions fréquentes
            </h2>
            <p className="text-muted-foreground text-lg">
              Tout ce que vous devez savoir avant de vous lancer.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA finale */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="rounded-3xl p-10 lg:p-16 text-center" style={{ background: "linear-gradient(135deg, #186749, #013F27)" }}>
            <Leaf className="h-12 w-12 text-accent mx-auto mb-4" />
            <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4">
              Prêt à simplifier la gestion de votre cabinet ?
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
              Rejoignez les naturopathes qui ont fait le choix de la simplicité. Essai gratuit, sans carte bancaire.
            </p>
            <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-[15px] bg-accent text-accent-foreground font-bold px-8 py-4 hover:opacity-90" data-testid="cta-bottom-register">
              Créer mon compte gratuitement <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 mt-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row gap-4 justify-between items-center text-sm text-muted-foreground">
          <Logo />
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <button onClick={() => scrollToId("fonctionnalites")} className="hover:text-primary transition">Fonctionnalités</button>
            <button onClick={() => scrollToId("pourquoi")} className="hover:text-primary transition">Pourquoi</button>
            <button onClick={() => scrollToId("faq")} className="hover:text-primary transition">FAQ</button>
            <Link href="/login" className="hover:text-primary transition">Connexion</Link>
          </nav>
          <p>© 2026 Naturo Pro — Le logiciel des naturopathes en France.</p>
        </div>
      </footer>
    </div>
  );
}
