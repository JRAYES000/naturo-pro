import { useState } from "react";
import { Link } from "wouter";
import {
  Calendar, CalendarClock, Globe, Video, Users, ClipboardList, FileText,
  Sprout, BookOpen, Package, Receipt, CreditCard, BellRing, BarChart3,
  ShieldCheck, ArrowRight, Check, ChevronDown,
} from "lucide-react";
import { Logo } from "@/components/Logo";

// Fonctionnalités réelles (vérifiées dans le code), regroupées par thème
// pour une présentation éditoriale plutôt qu'un mur de cartes identiques.
const FEATURE_GROUPS = [
  {
    label: "Agenda & réservation",
    blurb: "Remplissez votre agenda sans effort et laissez vos clients réserver en ligne.",
    items: [
      { Icon: Calendar, title: "Agenda intelligent", desc: "Vues mois, semaine, jour et agenda. Rendez-vous récurrents, couleurs par prestation, créneaux bloqués." },
      { Icon: Globe, title: "Page publique de réservation", desc: "Une page à votre nom (photo, bio, spécialités) où vos clients réservent en ligne selon vos disponibilités, sans créer de compte." },
      { Icon: CalendarClock, title: "Synchronisation Google Agenda", desc: "Synchronisation bidirectionnelle automatique, et import de vos événements externes comme créneaux occupés." },
      { Icon: Video, title: "Consultations en visio", desc: "Un lien Google Meet généré automatiquement pour vos rendez-vous à distance, ajouté à l'email de confirmation." },
      { Icon: CreditCard, title: "Acompte en ligne", desc: "Demandez un acompte à la réservation via Stripe pour limiter les rendez-vous manqués. Le paiement arrive directement sur votre compte." },
      { Icon: BellRing, title: "Rappels & emails automatiques", desc: "Confirmation, rappel J-1, récap quotidien et demande d'avis Google, tout en automatique. Modèles d'emails personnalisables." },
    ],
  },
  {
    label: "Suivi & accompagnement",
    blurb: "Le dossier naturo complet, de l'anamnèse au programme d'hygiène de vie.",
    items: [
      { Icon: Users, title: "Dossiers clients enrichis", desc: "Coordonnées, antécédents, allergies, hygiène de vie, pense-bête privé et documents joints (analyses, bilans)." },
      { Icon: ClipboardList, title: "Anamnèses personnalisées", desc: "Créez vos questionnaires de bilan (émonctoires, tempéraments, échelles) et envoyez un lien que le client remplit avant la séance." },
      { Icon: FileText, title: "Notes de consultation", desc: "Comptes-rendus au format naturo (motif, anamnèse, bilan, conseils, hygiène de vie, suivi) avec sauvegarde automatique." },
      { Icon: Sprout, title: "Programmes d'hygiène de vie", desc: "Construisez des protocoles personnalisés par sections (alimentation, phytothérapie, gestion du stress) et exportez-les en PDF." },
      { Icon: BookOpen, title: "Bibliothèque de solutions naturelles", desc: "Plantes, huiles essentielles, compléments et fleurs de Bach (propriétés, conseils, contre-indications), réutilisables dans vos programmes." },
      { Icon: Package, title: "Forfaits & carnets de séances", desc: "Vendez des packs de séances prépayées et suivez la consommation de chaque client d'un coup d'œil." },
    ],
  },
  {
    label: "Gestion & conformité",
    blurb: "La partie administrative, gérée proprement et en règle.",
    items: [
      { Icon: Receipt, title: "Facturation conforme", desc: "Factures PDF personnalisées (logo, SIRET, TVA, numérotation automatique), envoi par email, facturation automatique en fin de rendez-vous." },
      { Icon: BarChart3, title: "Statistiques & comptabilité", desc: "Chiffre d'affaires, rendez-vous réalisés, prestations phares, et export CSV du journal des recettes pour votre comptable." },
      { Icon: ShieldCheck, title: "Conformité RGPD", desc: "Vous gardez le contrôle : export complet de vos données et suppression définitive de votre compte à tout moment." },
    ],
  },
];

const WHY = [
  { title: "100 % français", desc: "Une interface intégralement en français, pensée pour les pratiques francophones. Aucun jargon, aucune traduction approximative." },
  { title: "Simple à utiliser", desc: "Pensé pour aller à l'essentiel. Prise en main rapide, sans formation : vous êtes opérationnel dès la première séance." },
  { title: "Vos données sous contrôle", desc: "Accès protégé, export et suppression de l'ensemble de vos données quand vous le souhaitez. Conforme au RGPD." },
  { title: "Pensé pour les naturopathes", desc: "Anamnèses, programmes d'hygiène de vie, bibliothèque de solutions naturelles. De vrais outils métier, pas un agenda générique." },
];

const FAQ = [
  { q: "Qu'est-ce que Naturo Pro ?", a: "Naturo Pro est un logiciel tout-en-un pour gérer votre cabinet de naturopathie : agenda, réservation en ligne, dossiers clients, anamnèses, notes de consultation, programmes d'hygiène de vie, facturation et statistiques, au même endroit." },
  { q: "Comment fonctionne l'essai gratuit ?", a: "Vous créez votre compte et profitez d'un essai gratuit, sans carte bancaire. Vous pouvez tester l'ensemble des fonctionnalités et configurer votre cabinet à votre rythme." },
  { q: "Mes données et celles de mes clients sont-elles sécurisées ?", a: "Oui. L'accès est protégé par mot de passe et chaque praticien ne voit que ses propres données. Conformément au RGPD, vous pouvez à tout moment exporter l'intégralité de vos données ou supprimer définitivement votre compte." },
  { q: "Mes clients peuvent-ils réserver en ligne ?", a: "Oui. Chaque praticien dispose d'une page publique personnalisable où ses clients réservent en autonomie, selon les disponibilités que vous définissez. Ils peuvent aussi annuler ou reporter leur rendez-vous via un lien sécurisé." },
  { q: "Les consultations à distance sont-elles gérées ?", a: "Oui. En connectant votre compte Google, un lien Google Meet est généré automatiquement pour vos rendez-vous en visio et transmis au client dans l'email de confirmation." },
  { q: "Puis-je éditer des factures conformes ?", a: "Oui : factures PDF personnalisées avec votre logo, votre SIRET, la TVA si vous y êtes assujetti et une numérotation automatique. Vous pouvez les envoyer par email et exporter votre journal des recettes au format CSV." },
  { q: "Naturo Pro fonctionne-t-il sur mobile ?", a: "Oui. L'application s'utilise depuis votre navigateur, sur ordinateur, tablette ou smartphone. Aucune installation n'est nécessaire." },
  { q: "Puis-je résilier et supprimer mon compte ?", a: "À tout moment, directement depuis vos paramètres. La suppression est définitive et efface l'ensemble de vos données." },
];

function SectionHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary/80 mb-3">{eyebrow}</p>
      <h2 className="font-display text-3xl lg:text-[2.75rem] leading-[1.12]" style={{ color: "#1b4332" }}>{title}</h2>
      {lead && <p className="text-muted-foreground text-lg mt-4 leading-relaxed">{lead}</p>}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-6 text-left py-5 group"
        aria-expanded={open}
        data-testid={`faq-toggle-${q.slice(0, 12)}`}
      >
        <span className="font-display text-lg group-hover:text-primary transition-colors" style={{ color: "#1b4332" }}>{q}</span>
        <ChevronDown className={`h-5 w-5 text-primary shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="text-muted-foreground leading-relaxed pb-5 -mt-1 max-w-[62ch]">{a}</p>}
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
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <button onClick={() => scrollToId("fonctionnalites")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-[15px] text-foreground/70 hover:text-primary hover:bg-secondary transition" data-testid="nav-features">Fonctionnalités</button>
            <button onClick={() => scrollToId("pourquoi")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-[15px] text-foreground/70 hover:text-primary hover:bg-secondary transition" data-testid="nav-why">Pourquoi</button>
            <button onClick={() => scrollToId("faq")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-[15px] text-foreground/70 hover:text-primary hover:bg-secondary transition" data-testid="nav-faq">FAQ</button>
            <Link href="/login" className="text-sm font-bold px-3 sm:px-4 py-2 rounded-[15px] hover:bg-secondary transition" data-testid="link-login">Connexion</Link>
            <Link href="/register" className="btn-primary-naturo text-sm" data-testid="link-register">Créer un compte</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="leaf-bg">
        <div className="max-w-4xl mx-auto px-6 pt-14 pb-12 lg:pt-20 lg:pb-16 text-center">
          <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-primary/80 mb-6">
            <span className="h-px w-8 bg-primary/25" aria-hidden="true" />
            Logiciel pour les naturopathes
            <span className="h-px w-8 bg-primary/25" aria-hidden="true" />
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-[4rem] leading-[1.05] mb-5" style={{ color: "#1b4332" }}>
            Gérez tout votre cabinet,<br />
            <span style={{ color: "#186749" }}>au même endroit.</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-7 leading-relaxed max-w-xl mx-auto">
            Fini les fichiers éparpillés. Naturo Pro réunit votre agenda, vos dossiers clients, vos anamnèses, vos comptes-rendus, votre facturation et votre réservation en ligne.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-5">
            <Link href="/register" className="btn-primary-naturo" data-testid="cta-hero-register">
              Démarrer gratuitement <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/p/marie-dupont" className="inline-flex items-center justify-center gap-2 rounded-[15px] border border-primary/20 px-6 py-3 font-bold text-primary hover:bg-secondary transition" data-testid="cta-hero-demo">
              Voir une page publique
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Sans engagement</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Essai gratuit, sans carte bancaire</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> En français</span>
          </div>

          {/* Vidéo de présentation, dans un cadre soigné */}
          <div className="mt-12 mx-auto max-w-3xl">
            <div className="rounded-2xl border border-primary/10 bg-card p-2 shadow-[0_24px_60px_-24px_rgba(24,103,73,0.4)]">
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-[#0d2a1f]">
                <iframe
                  src="https://www.loom.com/embed/4aa64b9616a54cc29c02e4f5a6988055"
                  title="Présentation de Naturo Pro"
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                  style={{ border: 0 }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fonctionnalités — regroupées par thème */}
      <section id="fonctionnalites" className="py-14 lg:py-20 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeading
            eyebrow="Fonctionnalités"
            title="Une plateforme complète, pensée pour votre métier."
            lead="Pas besoin de jongler entre dix outils. Naturo Pro réunit tout ce qu'il faut pour faire tourner votre activité au quotidien."
          />

          <div className="mt-12 flex flex-col gap-12 lg:gap-14">
            {FEATURE_GROUPS.map((group, gi) => (
              <div key={group.label} className="grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-x-12 gap-y-6 border-t border-border pt-8">
                <div>
                  <span className="font-display text-2xl text-primary/30">{String(gi + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-2xl mt-1" style={{ color: "#1b4332" }}>{group.label}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-[28ch]">{group.blurb}</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-10 gap-y-7">
                  {group.items.map(({ Icon, title, desc }) => (
                    <div key={title} className="flex gap-3.5">
                      <Icon className="h-5 w-5 text-primary shrink-0 mt-1" strokeWidth={2} />
                      <div>
                        <h4 className="font-bold text-[0.975rem]" style={{ color: "#1b4332" }}>{title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-1">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pourquoi Naturo Pro — colonnes numérotées */}
      <section id="pourquoi" className="py-14 lg:py-20 bg-muted/50 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeading
            eyebrow="Pourquoi Naturo Pro"
            title="Un outil qui inspire confiance."
            lead="Une solution pensée pour les praticiens, qui vous laisse vous concentrer sur l'essentiel : l'accompagnement de vos clients."
          />

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-9">
            {WHY.map((w, i) => (
              <div key={w.title} className="border-t border-primary/15 pt-5">
                <span className="font-display text-3xl text-primary/25">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display text-xl mt-2" style={{ color: "#1b4332" }}>{w.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — liste à filets */}
      <section id="faq" className="py-14 lg:py-20 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-6">
          <SectionHeading
            eyebrow="FAQ"
            title="Les questions que vous vous posez."
          />
          <div className="mt-8 border-t border-border">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA finale — section immersive vert profond */}
      <section className="py-12 lg:py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative overflow-hidden rounded-[28px] px-8 py-14 lg:px-16 lg:py-20 text-center" style={{ background: "linear-gradient(150deg, #1b4332 0%, #013F27 100%)" }}>
            <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(23,236,155,0.22), transparent 70%)" }} />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(23,236,155,0.10), transparent 70%)" }} />
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent mb-4">Essai gratuit</p>
              <h2 className="font-display text-3xl lg:text-5xl text-white leading-[1.1] max-w-2xl mx-auto">
                Donnez à votre cabinet l'outil serein qu'il mérite.
              </h2>
              <p className="text-white/75 text-lg mt-5 mb-8 max-w-xl mx-auto leading-relaxed">
                Rejoignez les naturopathes qui ont fait le choix de la simplicité.
              </p>
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-[15px] bg-accent text-accent-foreground font-bold px-8 py-4 transition hover:opacity-90" data-testid="cta-bottom-register">
                Créer mon compte gratuitement <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-white/60 text-sm mt-5">Sans carte bancaire · Sans engagement</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row gap-4 justify-between items-center text-sm text-muted-foreground">
          <Logo />
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <button onClick={() => scrollToId("fonctionnalites")} className="hover:text-primary transition">Fonctionnalités</button>
            <button onClick={() => scrollToId("pourquoi")} className="hover:text-primary transition">Pourquoi</button>
            <button onClick={() => scrollToId("faq")} className="hover:text-primary transition">FAQ</button>
            <Link href="/login" className="hover:text-primary transition">Connexion</Link>
          </nav>
          <p>© 2026 Naturo Pro · Le logiciel des naturopathes en France.</p>
        </div>
      </footer>
    </div>
  );
}
