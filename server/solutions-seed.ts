/**
 * server/solutions-seed.ts
 *
 * Jeu de départ pour la base de solutions naturelles (catalogue de référence
 * global, userId NULL). Inséré une seule fois au démarrage si aucune solution
 * globale n'existe encore. Le praticien peut ensuite ajouter ses propres entrées.
 *
 * ⚠️ Contenu d'information naturopathique (hygiène de vie), PAS un avis médical.
 * Chaque fiche inclut des précautions ; un disclaimer global est affiché dans l'UI.
 */

import { storage } from "./storage";

export interface SeedSolution {
  name: string;
  category: string; // Plante | Huile essentielle | Complément | Fleur de Bach
  properties: string;
  contraindications: string;
  usageNotes: string;
}

export const DEFAULT_SOLUTIONS: SeedSolution[] = [
  // ── Plantes ──
  { name: "Camomille romaine", category: "Plante", properties: "Apaise les tensions nerveuses et facilite la digestion ; utile en cas d'agitation et de troubles digestifs légers.", contraindications: "Allergie aux Astéracées (marguerite, arnica). Prudence pendant la grossesse.", usageNotes: "1 c. à café de fleurs séchées en infusion 10 min, 1 à 3 fois/jour." },
  { name: "Mélisse", category: "Plante", properties: "Calmante, favorise l'endormissement et apaise les troubles digestifs d'origine nerveuse.", contraindications: "Déconseillée pendant la grossesse (données insuffisantes). Prudence en cas d'hypothyroïdie.", usageNotes: "Infusion le soir ; souvent associée à la passiflore pour le sommeil." },
  { name: "Passiflore", category: "Plante", properties: "Anxiolytique doux, favorise le sommeil et réduit l'agitation et la nervosité.", contraindications: "Déconseillée en cas de dépression sévère ; éviter avec sédatifs sans avis. Grossesse : à éviter.", usageNotes: "Infusion ou extrait en fin de journée. Synergie avec valériane/mélisse." },
  { name: "Valériane", category: "Plante", properties: "Sédative, aide à l'endormissement et à la qualité du sommeil.", contraindications: "Peut majorer l'effet des somnifères/anxiolytiques. Éviter avant de conduire. Grossesse/allaitement : avis requis.", usageNotes: "Extrait sec le soir, en cure courte." },
  { name: "Ortie", category: "Plante", properties: "Reminéralisante (fer, silice), soutient l'élimination ; utile en cas de fatigue et terrain déminéralisé.", contraindications: "Prudence en cas d'œdèmes liés à une insuffisance cardiaque/rénale.", usageNotes: "Infusion de feuilles, en cure de 3 semaines." },
  { name: "Pissenlit", category: "Plante", properties: "Soutient les fonctions hépatique et rénale ; draineur classique des cures détox.", contraindications: "Calculs/obstruction des voies biliaires, ulcère. Allergie aux Astéracées.", usageNotes: "Racine/feuille en infusion ou décoction, cure de drainage au printemps/automne." },
  { name: "Romarin", category: "Plante", properties: "Tonique général et hépatique, soutient la digestion et la vitalité.", contraindications: "Hypertension non contrôlée, épilepsie, grossesse pour les formes concentrées.", usageNotes: "Infusion le matin/midi (éviter le soir : tonifiant)." },
  { name: "Gingembre", category: "Plante", properties: "Anti-nauséeux, stimule la digestion, tonique.", contraindications: "Prudence avec les anticoagulants et en cas de calculs biliaires.", usageNotes: "Frais râpé en infusion, ou en poudre dans l'alimentation." },
  { name: "Thym", category: "Plante", properties: "Soutien des voies respiratoires et antiseptique ; utile l'hiver.", contraindications: "Prudence en cas de troubles thyroïdiens ; grossesse pour formes concentrées.", usageNotes: "Infusion avec un peu de miel en cas de gorge irritée." },
  { name: "Aubépine", category: "Plante", properties: "Apaise la nervosité et soutient le système cardiovasculaire (palpitations d'origine émotionnelle).", contraindications: "Traitement cardiaque en cours : avis médical indispensable.", usageNotes: "Infusion ou extrait, en cure régulière." },
  { name: "Artichaut", category: "Plante", properties: "Soutient le foie et la digestion des graisses ; draineur hépatique.", contraindications: "Obstruction des voies biliaires, allergie aux Astéracées.", usageNotes: "Extrait de feuilles avant les repas, en cure." },
  { name: "Fenouil", category: "Plante", properties: "Digestif, anti-ballonnements et anti-spasmodique.", contraindications: "Allergies aux Apiacées ; prudence grossesse pour formes concentrées.", usageNotes: "Graines en infusion après les repas." },

  // ── Huiles essentielles ──
  { name: "Lavande vraie (HE)", category: "Huile essentielle", properties: "Calmante et relaxante, favorise le sommeil ; apaise petites irritations cutanées.", contraindications: "Éviter les 3 premiers mois de grossesse ; prudence chez le jeune enfant.", usageNotes: "1-2 gouttes en diffusion le soir, ou diluée dans une huile végétale en massage." },
  { name: "Tea tree (HE)", category: "Huile essentielle", properties: "Anti-infectieuse à large spectre (bactéries, mycoses) ; assainissante.", contraindications: "Grossesse/allaitement et jeunes enfants : avis requis. Toujours diluer.", usageNotes: "Usage local dilué ; jamais pur sur une grande surface." },
  { name: "Menthe poivrée (HE)", category: "Huile essentielle", properties: "Digestive, anti-nausée et utile contre les maux de tête (effet rafraîchissant).", contraindications: "Interdite femme enceinte/allaitante, enfant < 7 ans, épileptiques. Jamais près des yeux/voies respiratoires du jeune enfant.", usageNotes: "1 goutte sur un comprimé neutre après un repas lourd, ou diluée sur les tempes (adulte)." },
  { name: "Ravintsara (HE)", category: "Huile essentielle", properties: "Antivirale et tonifiante, soutien immunitaire pendant la saison froide.", contraindications: "Déconseillée 1er trimestre de grossesse et bébé < 3 mois ; prudence asthmatiques/épileptiques.", usageNotes: "2 gouttes diluées sur le thorax/poignets en prévention hivernale (adulte)." },
  { name: "Eucalyptus radié (HE)", category: "Huile essentielle", properties: "Décongestionnante des voies respiratoires hautes, expectorante douce.", contraindications: "Jeunes enfants et asthmatiques : prudence ; éviter en diffusion près des nourrissons.", usageNotes: "Diffusion courte ou dilué en friction thoracique (adulte)." },
  { name: "Citron (HE)", category: "Huile essentielle", properties: "Assainit l'air, soutient la digestion et le foie.", contraindications: "Photosensibilisante : pas d'exposition au soleil après application cutanée.", usageNotes: "Diffusion atmosphérique ; usage interne uniquement sur avis." },

  // ── Compléments / micronutrition ──
  { name: "Magnésium", category: "Complément", properties: "Soutient le système nerveux et musculaire ; utile en cas de stress, fatigue, crampes.", contraindications: "Insuffisance rénale sévère : avis médical. Excès = effet laxatif.", usageNotes: "Privilégier les formes bien tolérées (bisglycinate, glycérophosphate), souvent le soir." },
  { name: "Vitamine D3", category: "Complément", properties: "Immunité, santé osseuse et tonus ; carence fréquente en hiver.", contraindications: "Hypercalcémie, certaines pathologies : dosage sanguin conseillé.", usageNotes: "Supplémentation surtout d'octobre à mars ; idéalement guidée par un bilan." },
  { name: "Probiotiques", category: "Complément", properties: "Soutiennent l'équilibre du microbiote intestinal et le confort digestif.", contraindications: "Immunodépression sévère : avis médical.", usageNotes: "Cure de 1 à 3 mois, à distance des repas ou selon la souche." },
  { name: "Oméga-3 (EPA/DHA)", category: "Complément", properties: "Soutien cardiovasculaire, nerveux et anti-inflammatoire.", contraindications: "Prudence avec les anticoagulants ; choisir une source purifiée.", usageNotes: "Au cours d'un repas contenant des graisses." },
  { name: "Spiruline", category: "Complément", properties: "Riche en protéines et fer ; soutien en cas de fatigue et terrain déminéralisé.", contraindications: "Phénylcétonurie, hémochromatose, maladies auto-immunes : avis requis. Qualité/origine essentielles.", usageNotes: "Démarrer à faible dose et augmenter progressivement." },

  // ── Fleurs de Bach ──
  { name: "Rescue (fleurs de Bach)", category: "Fleur de Bach", properties: "Apaisement émotionnel en cas de coup de stress ou de choc émotionnel ponctuel.", contraindications: "Versions avec alcool : prudence (grossesse, enfants) — préférer sans alcool.", usageNotes: "Quelques gouttes en cas de besoin, sous la langue." },
  { name: "Mimulus (fleurs de Bach)", category: "Fleur de Bach", properties: "Pour les peurs identifiées du quotidien (parler en public, rendez-vous…).", contraindications: "Aucune connue ; accompagnement émotionnel, ne remplace pas un suivi.", usageNotes: "4 gouttes, 4 fois par jour, en cure." },
];

/** Insère le catalogue global s'il est vide. Idempotent (best effort). */
export async function seedNaturalSolutionsIfEmpty(): Promise<void> {
  try {
    const count = await storage.countGlobalNaturalSolutions();
    if (count > 0) return;
    for (const s of DEFAULT_SOLUTIONS) {
      await storage.createNaturalSolution({ userId: null, ...s } as any);
    }
    console.log(`[seed] base de solutions naturelles : ${DEFAULT_SOLUTIONS.length} fiches globales créées`);
  } catch (e: any) {
    console.warn("[seed] seedNaturalSolutionsIfEmpty échoué (best-effort):", e?.message || e);
  }
}
