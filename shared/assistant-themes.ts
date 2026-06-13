// shared/assistant-themes.ts
// Thématiques prédéfinies de l'assistant (menu déroulant + catégorisation auto).
// « Autre… » reste en dernier : il déclenche la saisie libre côté UI.
export const THEME_OTHER = "Autre…";

export const ASSISTANT_THEMES: string[] = [
  "Sommeil & insomnie",
  "Digestion & intestin",
  "Stress, émotions & nervosité",
  "Immunité",
  "Détox & émonctoires",
  "Hormonal & cycle féminin",
  "Énergie & fatigue",
  "Peau",
  "Articulations & douleurs",
  "Poids & alimentation",
  "Circulation",
  "Respiratoire",
  THEME_OTHER,
];
