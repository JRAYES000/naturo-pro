/**
 * CadreLegal.tsx — Lot 4 (action P13)
 * Route : /#/app/cadre-legal
 *
 * Guide éditorial statique : les grands interdits de la pratique de la
 * naturopathie en France et des exemples de formulations alternatives.
 * Contenu informatif — ne remplace pas un conseil juridique.
 */
import { Scale, Ban, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";

const INTERDITS: Array<{ titre: string; detail: string }> = [
  {
    titre: "Ne jamais poser de diagnostic médical",
    detail:
      "Le diagnostic est un acte médical réservé aux médecins (art. L.4161-1 du Code de la santé publique). " +
      "Nommer une maladie à partir des signes observés (« vous faites de l'hypothyroïdie ») relève de l'exercice illégal de la médecine.",
  },
  {
    titre: "Ne jamais prescrire, arrêter ou modifier un traitement",
    detail:
      "Seul un médecin prescrit. Conseiller d'arrêter ou de réduire un médicament, même « naturellement », engage votre " +
      "responsabilité pénale — surtout si l'état de la personne se dégrade.",
  },
  {
    titre: "Ne jamais promettre une guérison",
    detail:
      "« Cette cure va guérir votre eczéma » est à la fois une pratique commerciale trompeuse et une sortie du cadre " +
      "du bien-être. La naturopathie accompagne la vitalité, elle ne traite pas une maladie.",
  },
  {
    titre: "Ne pas utiliser de termes réservés aux professions réglementées",
    detail:
      "« Consultation médicale », « patient », « thérapeute agréé », « massage kinésithérapique », « ordonnance »… " +
      "Ces termes créent une confusion avec les professions de santé réglementées. Préférez « séance », « client », « conseils personnalisés ».",
  },
  {
    titre: "Ne jamais dissuader de consulter un médecin",
    detail:
      "Face à un symptôme inquiétant, un signalement de douleur inhabituelle ou un traitement en cours, le réflexe " +
      "professionnel est d'orienter vers le médecin traitant — et de le tracer dans vos notes.",
  },
  {
    titre: "Prudence sur les publics fragiles",
    detail:
      "Femmes enceintes, nourrissons, personnes atteintes de pathologies lourdes : certaines plantes et pratiques sont " +
      "contre-indiquées. En cas de doute, abstenez-vous et orientez vers un professionnel de santé.",
  },
];

const REFORMULATIONS: Array<{ eviter: string; preferer: string }> = [
  { eviter: "Je vais diagnostiquer votre problème de thyroïde", preferer: "Je vais faire le point sur votre vitalité et votre terrain" },
  { eviter: "Ce protocole va guérir votre eczéma", preferer: "Ces conseils d'hygiène de vie peuvent accompagner le confort de votre peau" },
  { eviter: "Vous pouvez arrêter votre traitement", preferer: "Parlez-en à votre médecin — je ne modifie jamais un traitement en cours" },
  { eviter: "Je vous prescris de la valériane", preferer: "Je vous propose de découvrir la valériane, traditionnellement utilisée pour la détente" },
  { eviter: "Mes patients constatent une guérison rapide", preferer: "Mes clients témoignent souvent d'un mieux-être global" },
  { eviter: "Consultation médicale naturopathique", preferer: "Séance de naturopathie / bilan de vitalité" },
];

export default function CadreLegal() {
  return (
    <AppLayout>
      <div className="max-w-4xl">
        <PageHeader
          icon={Scale}
          title="Cadre légal"
          subtitle="Les repères pour exercer la naturopathie dans le cadre du bien-être, en France."
        />

        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex gap-2 items-start" data-testid="text-cadre-legal-disclaimer">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Ce guide est un <strong>rappel pédagogique</strong>, pas un conseil juridique. En cas de doute sur une
            situation précise, rapprochez-vous de votre syndicat professionnel (OMNES, SPN…) ou d'un avocat.
          </span>
        </div>

        <div className="card-naturo mb-6">
          <h2 className="text-xl font-extrabold mb-2 text-heading">Le principe</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            En France, la naturopathie n'est pas une profession de santé réglementée : elle s'exerce dans le champ du{" "}
            <strong className="text-foreground">bien-être et de l'éducation à la santé</strong>. Vous accompagnez la vitalité
            d'une personne par l'hygiène de vie (alimentation, sommeil, gestion du stress, activité physique, plantes…) —
            vous ne diagnostiquez pas, vous ne traitez pas, vous ne prescrivez pas. Rester dans ce cadre protège vos
            clients, et vous protège juridiquement.
          </p>
        </div>

        <h2 className="text-xl font-extrabold mb-3 text-heading">Les grands interdits</h2>
        <ul className="space-y-3 mb-8">
          {INTERDITS.map((it, i) => (
            <li key={i} className="card-naturo flex items-start gap-3" data-testid={`interdit-${i}`}>
              <Ban className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{it.titre}</p>
                <p className="text-sm text-muted-foreground mt-1">{it.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="text-xl font-extrabold mb-3 text-heading">Reformuler pour rester dans le cadre</h2>
        <div className="card-naturo overflow-x-auto p-0 mb-8">
          <table className="table-naturo">
            <thead>
              <tr>
                <th>❌ À éviter</th>
                <th>✅ À préférer</th>
              </tr>
            </thead>
            <tbody>
              {REFORMULATIONS.map((r, i) => (
                <tr key={i} data-testid={`reformulation-${i}`}>
                  <td className="text-destructive/90">{r.eviter}</td>
                  <td className="font-medium">{r.preferer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card-naturo mb-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="font-extrabold text-heading">Les bons réflexes au quotidien</h2>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Faire signer un document d'information précisant que la séance ne remplace pas une consultation médicale.",
              "Tracer dans vos notes chaque orientation vers un médecin (date + motif).",
              "Recueillir le consentement pour la conservation des données (RGPD) — vos fiches clients contiennent des données sensibles.",
              "Relire vos supports de communication (site, réseaux, page publique) avec la grille de reformulation ci-dessus.",
              "Souscrire une assurance responsabilité civile professionnelle couvrant explicitement la naturopathie.",
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
