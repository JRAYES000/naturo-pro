/**
 * server/solutions-ai.ts — brouillon de fiche pré-rempli par l'IA (OpenRouter)
 *
 * La praticienne saisit un nom et une catégorie ; l'IA propose propriétés,
 * usage, précautions (texte + drapeaux), forme et durée de cure. Le brouillon
 * n'est jamais enregistré tel quel : il remplit le formulaire, marqué « à relire ».
 * Pas de sources demandées : un modèle invente volontiers des références.
 */

import { SAFETY_CRITERIA, SAFETY_KEYS, deriveSafety, type Safety } from "@shared/solutions";

export interface SolutionDraft {
  properties: string;
  usageNotes: string;
  contraindications: string;
  form: string;
  cureDuration: string;
  safety: Safety;
}

export function buildSolutionDraftMessages(name: string, category: string): Array<{ role: string; content: string }> {
  const criteria = SAFETY_CRITERIA.map((c) => `"${c.key}" (${c.label})`).join(", ");
  return [
    {
      role: "system",
      content: [
        "Tu rédiges des fiches de référence pour des naturopathes francophones (hygiène de vie, pas d'avis médical).",
        "Réponds UNIQUEMENT par un objet JSON avec les clés : properties, usageNotes, contraindications, form, cureDuration, safety.",
        "- properties : propriétés et indications traditionnelles, 1 à 2 phrases sobres, sans promesse de guérison.",
        "- usageNotes : forme d'usage et posologie usuelle chez l'adulte, 1 à 2 phrases.",
        "- contraindications : précautions et contre-indications connues, interactions médicamenteuses comprises, 1 à 3 phrases. Si tu n'es pas sûr, dis « données insuffisantes : avis requis ».",
        "- form : forme(s) galénique(s) usuelle(s), quelques mots.",
        "- cureDuration : durée de cure usuelle, quelques mots, ou chaîne vide.",
        `- safety : objet dont les clés sont parmi ${criteria} et les valeurs "ci" (contre-indiqué) ou "prudence". N'inclus que les critères réellement concernés.`,
        "Écris en français, phrases courtes. Aucune source, aucune référence bibliographique.",
      ].join("\n"),
    },
    { role: "user", content: `Fiche à préparer : « ${name} » (catégorie : ${category}).` },
  ];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Valide la réponse du modèle ; null si inexploitable. */
export function parseSolutionDraft(raw: string): SolutionDraft | null {
  let obj: any;
  try {
    obj = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const draft: SolutionDraft = {
    properties: str(obj.properties, 2000),
    usageNotes: str(obj.usageNotes, 2000),
    contraindications: str(obj.contraindications, 2000),
    form: str(obj.form, 255),
    cureDuration: str(obj.cureDuration, 255),
    safety: {},
  };
  if (!draft.properties && !draft.usageNotes && !draft.contraindications) return null;
  if (obj.safety && typeof obj.safety === "object") {
    for (const k of SAFETY_KEYS) {
      const v = obj.safety[k];
      if (v === "ci" || v === "prudence") draft.safety[k] = v;
    }
  }
  // Filet : un critère cité dans le texte des précautions mais oublié dans les drapeaux.
  const fromText = deriveSafety(draft.contraindications);
  for (const k of SAFETY_KEYS) if (fromText[k] && !draft.safety[k]) draft.safety[k] = fromText[k];
  return draft;
}
