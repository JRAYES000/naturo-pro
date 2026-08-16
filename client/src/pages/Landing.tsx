import { useState } from "react";
import { Link } from "wouter";
import {
  Calendar, CalendarClock, Globe, Video, Users, ClipboardList, FileText,
  Sprout, BookOpen, Package, Receipt, CreditCard, BellRing, BarChart3,
  ShieldCheck, ArrowRight, Check, ChevronDown, Sparkles,
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
  { q: "Qu'est-ce que Naturo Pro ?", a: "Naturo Pro est un logiciel tout-en-un conçu pour les naturopathes, qui réunit en un seul endroit l'agenda et la réservation en ligne, les dossiers clients, les anamnèses, les notes de consultation, les programmes d'hygiène de vie, la facturation et les statistiques de votre cabinet." },
  { q: "Comment fonctionne l'essai gratuit ?", a: "L'essai gratuit de Naturo Pro vous permet de créer votre compte et de tester l'ensemble des fonctionnalités du logiciel sans engagement et sans carte bancaire, le temps de configurer votre cabinet et votre page de réservation en ligne à votre propre rythme." },
  { q: "Mes données et celles de mes clients sont-elles sécurisées ?", a: "Oui : l'accès à Naturo Pro est protégé par mot de passe et chaque praticien ne peut consulter que ses propres données, jamais celles des autres cabinets, et l'application respecte le RGPD avec la possibilité d'exporter ou de supprimer vos données à tout moment." },
  { q: "Mes clients peuvent-ils réserver en ligne ?", a: "Oui : chaque praticien dispose d'une page publique personnalisable où ses clients choisissent une prestation et réservent en autonomie un rendez-vous, selon les disponibilités que vous définissez vous-même, sans avoir besoin de créer de compte ; ils peuvent ensuite annuler ou reporter leur rendez-vous à tout moment via un lien sécurisé reçu par email." },
  { q: "Les consultations à distance sont-elles gérées ?", a: "Oui : en connectant votre compte Google à Naturo Pro, un lien de visioconférence Google Meet est généré automatiquement pour chaque rendez-vous en visio et transmis directement à votre client dans l'email de confirmation, sans aucune manipulation supplémentaire de votre part ni jonglage entre plusieurs outils." },
  { q: "Puis-je éditer des factures conformes ?", a: "Oui : Naturo Pro génère des factures PDF personnalisées avec votre logo, votre SIRET et la TVA si vous y êtes assujetti, avec une numérotation automatique conforme, que vous pouvez envoyer par email à vos clients et intégrer à votre comptabilité via un export CSV de votre journal des recettes." },
  { q: "Naturo Pro fonctionne-t-il sur mobile ?", a: "Oui : Naturo Pro fonctionne directement depuis le navigateur de votre ordinateur, de votre tablette ou de votre smartphone, sans aucune installation ni application à télécharger, ce qui vous permet de consulter votre agenda et vos dossiers clients où que vous soyez." },
  { q: "Puis-je résilier et supprimer mon compte ?", a: "Oui : vous pouvez résilier et supprimer votre compte Naturo Pro à tout moment, directement depuis la page de vos paramètres, sans avoir à contacter le support ni à justifier votre décision ; la suppression est définitive et efface l'ensemble de vos données, conformément au RGPD, sans conservation ultérieure." },
];

/**
 * Généré depuis FAQ (même tableau que l'affichage, juste au-dessus) : le JSON-LD
 * ne peut jamais diverger du contenu visible, puisque c'est littéralement la
 * même donnée source, pas une copie à tenir synchronisée à la main.
 */
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

/**
 * Description identique à la meta description de client/index.html (pas une
 * nouvelle rédaction) — à garder synchronisée manuellement si l'une des deux
 * change, un fichier HTML statique n'étant pas importable ici.
 *
 * Volontairement sans "offers" (pas de grille tarifaire publiée) ni
 * "aggregateRating" (aucun système de note interne à Naturo Pro n'existe).
 */
const SOFTWARE_APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Naturo Pro",
  applicationCategory: "BusinessApplication",
  description: "Le logiciel tout-en-un pour naturopathes : agenda, dossiers clients, page publique de réservation, et gestion en ligne.",
  operatingSystem: "Web",
  url: "https://app.ecole-naturo.fr/",
};

// Pas de sur-titre au-dessus du h2 : l'étiquette en petites majuscules répète
// ce que le titre dit déjà, et c'est le marqueur le plus reconnaissable d'une
// page de gabarit. Le titre porte son propre poids.
function SectionHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-3xl lg:text-[2.75rem] leading-[1.12] text-heading">{title}</h2>
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
        <span className="font-display text-lg group-hover:text-primary transition-colors text-heading">{q}</span>
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_JSON_LD) }}
      />
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <button onClick={() => scrollToId("fonctionnalites")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-lg text-foreground/70 hover:text-primary hover:bg-secondary transition" data-testid="nav-features">Fonctionnalités</button>
            <button onClick={() => scrollToId("pourquoi")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-lg text-foreground/70 hover:text-primary hover:bg-secondary transition" data-testid="nav-why">Pourquoi</button>
            <button onClick={() => scrollToId("faq")} className="hidden md:inline-flex text-sm font-bold px-3 py-2 rounded-lg text-foreground/70 hover:text-primary hover:bg-secondary transition" data-testid="nav-faq">FAQ</button>
            {/* <a> natif, pas <Link> wouter : /login vit dans l'autre arbre de routage
                (hash), cf. commentaire de tête de client/src/main.tsx — un Link
                client-side ne pourrait pas y accéder, il faut une vraie navigation. */}
            <a href="/login" className="text-sm font-bold px-3 sm:px-4 py-2 rounded-lg hover:bg-secondary transition" data-testid="link-login">Connexion</a>
            <a href="/register" className="btn-primary-naturo text-sm" data-testid="link-register">Créer un compte</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="leaf-bg">
        <div className="max-w-4xl mx-auto px-6 pt-14 pb-12 lg:pt-20 lg:pb-16 text-center">
          {/* A8 (audit SEO 15/08/2026) — l'ancien H1 « Gérez tout votre cabinet, au
              même endroit » ne contenait aucun des deux mots que les praticiens
              tapent réellement dans Google. Le bénéfice reste, les mots-clés entrent. */}
          <h1 className="font-display text-4xl sm:text-5xl lg:text-[4rem] leading-[1.05] mb-5 text-heading">
            Le logiciel des naturopathes,<br />
            <span style={{ color: "#186749" }}>tout votre cabinet au même endroit.</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-7 leading-relaxed max-w-xl mx-auto">
            Fini les fichiers éparpillés. Naturo Pro réunit votre agenda, vos dossiers clients, vos anamnèses, vos comptes-rendus, votre facturation et votre réservation en ligne.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-5">
            <a href="/register" className="btn-primary-naturo" data-testid="cta-hero-register">
              Démarrer gratuitement <ArrowRight className="h-4 w-4" />
            </a>
            {/* A2/A7 — l'annuaire remplace le lien direct vers la fiche de
                démonstration : les pages praticiens n'étaient liées depuis nulle
                part (orphelines pour Google), et la fiche de démo est un
                praticien fictif qu'il vaut mieux ne pas mettre en avant. */}
            <a href="/naturopathes" className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/20 px-6 py-3 font-bold text-primary hover:bg-secondary transition" data-testid="cta-hero-demo">
              Voir les pages publiques
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Sans engagement</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Essai gratuit, sans carte bancaire</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> En français</span>
          </div>

          {/* Vidéo de présentation, dans un cadre soigné */}
          <div className="mt-12 mx-auto max-w-3xl">
            {/* Cadre vidéo : le filet porte le cadrage, l'ombre de 60 px en plus
                faisait léviter le seul objet posé de la page. */}
            <div className="rounded-xl border border-primary/15 bg-card p-2">
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
            title="Une plateforme complète, pensée pour votre métier."
            lead="Pas besoin de jongler entre dix outils. Naturo Pro réunit tout ce qu'il faut pour faire tourner votre activité au quotidien."
          />

          <div className="mt-12 flex flex-col gap-12 lg:gap-14">
            {/* Pas de 01/02/03 : ces trois thèmes ne se lisent pas dans l'ordre,
                le numéro ne portait aucune information. */}
            {FEATURE_GROUPS.map((group) => (
              <div key={group.label} className="grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-x-12 gap-y-6 border-t border-border pt-8">
                <div>
                  <h3 className="font-display text-2xl text-heading">{group.label}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-[28ch]">{group.blurb}</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-10 gap-y-7">
                  {group.items.map(({ Icon, title, desc }) => (
                    <div key={title} className="flex gap-3.5">
                      <Icon className="h-5 w-5 text-primary shrink-0 mt-1" strokeWidth={2} />
                      <div>
                        <h4 className="font-bold text-[0.975rem] text-heading">{title}</h4>
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

      {/* Studio contenu — argumentaire (Lot 2, action 19) : le seul terrain où
          Naturo Pro devance les logiciels naturo concurrents, mis en avant seul. */}
      <section id="studio" className="py-14 lg:py-20 bg-primary/[0.04] scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeading
            title="Votre communication, sans y passer vos soirées."
            lead="Unique parmi les logiciels de naturopathie : un studio qui rédige avec vous vos publications Instagram et Facebook, dans votre ton, à partir de votre vraie pratique."
          />
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-9">
            {[
              { title: "Des posts dans votre ton", desc: "Le Studio écrit avec votre voix : votre spécialité, votre ville, votre audience et le ton que vous avez choisis." },
              { title: "Des idées tirées de vos consultations", desc: "Les thèmes qui reviennent dans les questions de vos clientes deviennent des suggestions de publications qui parlent à votre patientèle." },
              { title: "Carrousels prêts à publier", desc: "Slides visuelles générées avec fond illustré, légende et hashtags, exportées en un clic pour Instagram." },
              { title: "Votre bibliothèque de contenus", desc: "Brouillons, contenus publiés, réutilisation : tout votre historique de communication au même endroit, relié à votre cabinet." },
            ].map((f) => (
              <div key={f.title} className="border-t border-primary/15 pt-5">
                <Sparkles className="h-5 w-5 text-primary" strokeWidth={2} />
                <h3 className="font-display text-xl mt-2 text-heading">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">{f.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-10">
            Le Studio contenu est inclus dans Naturo Pro, avec l'assistant Naturobot formé à la naturopathie — sans outil d'IA à payer en plus.
          </p>
        </div>
      </section>

      {/* Pourquoi Naturo Pro — colonnes à filet haut. Pas de 01/02/03 : ces
          quatre raisons n'ont pas d'ordre, la numérotation ne portait rien. */}
      <section id="pourquoi" className="py-14 lg:py-20 bg-muted/50 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeading
            title="Un outil qui inspire confiance."
            lead="Une solution pensée pour les praticiens, qui vous laisse vous concentrer sur l'essentiel : l'accompagnement de vos clients."
          />

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-9">
            {WHY.map((w) => (
              <div key={w.title} className="border-t border-primary/15 pt-5">
                <h3 className="font-display text-xl text-heading">{w.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — liste à filets */}
      <section id="faq" className="py-14 lg:py-20 scroll-mt-20">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
        />
        <div className="max-w-3xl mx-auto px-6">
          <SectionHeading
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
          <div className="relative overflow-hidden rounded-xl px-8 py-14 lg:px-16 lg:py-20 text-center" style={{ background: "linear-gradient(150deg, hsl(var(--heading)) 0%, #013F27 100%)" }}>
            {/* Le dégradé de la section suffit ; les deux halos menthe posés par-dessus
                étaient de la décoration, pas de la profondeur. */}
            <div className="relative">
              <h2 className="font-display text-3xl lg:text-5xl text-white leading-[1.1] max-w-2xl mx-auto">
                Donnez à votre cabinet l'outil serein qu'il mérite.
              </h2>
              <p className="text-white/75 text-lg mt-5 mb-8 max-w-xl mx-auto leading-relaxed">
                Rejoignez les naturopathes qui ont fait le choix de la simplicité.
              </p>
              <a href="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground font-bold px-8 py-4 transition hover:opacity-90" data-testid="cta-bottom-register">
                Créer mon compte gratuitement <ArrowRight className="h-4 w-4" />
              </a>
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
            {/* Maillage interne (A2/A8) : ces deux pages sont rendues côté serveur
                et n'existent pas dans le routeur Wouter — <a> natif obligatoire. */}
            <a href="/logiciel-naturopathe" className="hover:text-primary transition">Logiciel naturopathe</a>
            <a href="/naturopathes" className="hover:text-primary transition">Annuaire</a>
            <a href="/login" className="hover:text-primary transition">Connexion</a>
          </nav>
          <p>© 2026 Naturo Pro · Le logiciel des naturopathes en France.</p>
        </div>
      </footer>
    </div>
  );
}
