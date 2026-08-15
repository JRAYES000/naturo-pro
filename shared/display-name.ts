/**
 * shared/display-name.ts — normalisation de la casse d'un nom saisi librement.
 *
 * Partagé serveur/client à dessein (audit SEO du 15/08/2026, A4) : le serveur
 * pré-rend le <title> et l'annuaire, le client réécrit le title après hydratation
 * et affiche le H1. Si les deux ne normalisent pas de la même façon, Google —
 * qui indexe le DOM APRÈS exécution du JS — retient la version client, et le
 * travail fait côté serveur ne sert qu'aux crawlers sans JS.
 *
 * Relevé en production le 15/08/2026 : « RAYES », « nourmo », « Eliane arnal »,
 * « ST LEGER AUX BOIS ». Un titre tout en majuscules ou tout en minuscules
 * dégrade le taux de clic dans les résultats de recherche.
 */

/**
 * « RAYES » → « Rayes », « nourmo » → « Nourmo », « ST LEGER AUX BOIS » → « St Leger Aux Bois ».
 *
 * Une casse DÉJÀ mixte est laissée telle quelle : « Paret-Solet », « McDonald »,
 * « Vanessa DESWERT » sont probablement voulus ainsi, et deviner mieux que la
 * personne concernée ferait plus de dégâts que le problème traité. Les données
 * stockées ne sont jamais modifiées — la normalisation est un effet d'affichage.
 */
export function titleCase(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed !== trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.replace(/[^\s'-]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
