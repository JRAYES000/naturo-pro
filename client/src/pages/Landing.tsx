import { Link } from "wouter";
import { Calendar, Users, Globe, FileText, Clock, Mail, Sparkles, Leaf, Heart, ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-bold px-4 py-2 rounded-[15px] hover:bg-secondary transition" data-testid="link-login">Connexion</Link>
            <Link href="/register" className="btn-primary-naturo text-sm" data-testid="link-register">Créer un compte</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="leaf-bg">
        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-primary text-xs font-bold mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Le logiciel pensé par et pour les naturopathes
            </div>
            <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight mb-6" style={{ color: "#1b4332" }}>
              Votre cabinet de naturopathie,<br />
              <span style={{ color: "#186749" }}>simple et serein.</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-lg">
              Gérez vos rendez-vous, vos clients et votre page de réservation en ligne — sans prise de tête. Concentrez-vous sur ce qui compte&nbsp;: vos consultations.
            </p>
            <div className="flex flex-wrap gap-3 mb-8">
              <Link href="/register" className="btn-primary-naturo" data-testid="cta-hero-register">
                Démarrer gratuitement <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/p/marie-dupont" className="inline-flex items-center justify-center gap-2 rounded-[15px] border border-primary/20 px-6 py-3 font-bold text-primary hover:bg-secondary transition" data-testid="cta-hero-demo">
                Voir une page publique
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Sans engagement</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Données sécurisées</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> En français</span>
            </div>
          </div>
          <div className="relative">
            <div className="card-naturo p-0 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=900&q=80"
                alt="Tisane et nature, ambiance naturopathie"
                className="w-full h-72 lg:h-96 object-cover"
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

      {/* Features */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-bold text-primary mb-3 uppercase tracking-wider">Tout-en-un</p>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-4" style={{ color: "#1b4332" }}>
              Une plateforme complète, pensée naturo.
            </h2>
            <p className="text-muted-foreground text-lg">
              Pas besoin de jongler entre dix outils. Naturo Pro réunit tout ce dont vous avez besoin pour faire tourner votre cabinet.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { Icon: Calendar, title: "Agenda intelligent", desc: "Vue semaine, mois, agenda — couleurs par prestation, glisser-déposer, vue limpide." },
              { Icon: Globe, title: "Page publique", desc: "Une jolie page de réservation à votre nom. Photo, bio, services, créneaux dispo." },
              { Icon: Users, title: "Dossiers clients", desc: "Antécédents, allergies, mode de vie, pense-bête — tout au même endroit." },
              { Icon: FileText, title: "Notes structurées", desc: "Motif, anamnèse, bilan, conseils alimentaires, hygiène de vie. Auto-sauvegarde." },
              { Icon: Clock, title: "Disponibilités", desc: "Définissez vos créneaux récurrents en quelques clics. Naturo Pro fait le reste." },
              { Icon: Mail, title: "Rappels automatiques", desc: "Confirmation par email, rappel J-1. Moins d'oublis, plus de présence." },
            ].map(({ Icon, title, desc }) => (
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

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="rounded-3xl p-10 lg:p-16 text-center" style={{ background: "linear-gradient(135deg, #186749, #013F27)" }}>
            <Leaf className="h-12 w-12 text-accent mx-auto mb-4" />
            <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4">
              Donnez à votre cabinet l'outil qu'il mérite.
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
              Rejoignez les naturopathes qui ont fait le choix de la simplicité.
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
          <p>© 2025 Naturo Pro — Le logiciel des naturopathes en France.</p>
        </div>
      </footer>
    </div>
  );
}
