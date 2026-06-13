/**
 * server/mistral.ts — Client mince de l'API Mistral pour l'assistant naturopathie.
 *
 * Seule responsabilité : construire les messages (system prompt + historique tronqué)
 * et appeler l'API REST de Mistral via fetch natif. Aucune dépendance à Express/DB.
 * La clé est lue dans process.env.MISTRAL_API_KEY (jamais exposée au client).
 */

export type ChatRole = "user" | "assistant";
export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export const MISTRAL_MODEL = "mistral-small-latest";
export const MAX_HISTORY = 15; // nb de tours d'historique envoyés (borne coût + contexte)
const MAX_TOKENS = 800;

export const SYSTEM_PROMPT = [
  "Tu es un formateur expérimenté en naturopathie qui accompagne des stagiaires et des praticiennes.",
  "Tu réponds TOUJOURS en français, de façon claire, pédagogique et structurée.",
  "Ton rôle est ÉDUCATIF : tu expliques les concepts, les plantes, les principes d'hygiène de vie et les fondements de la naturopathie.",
  "",
  "Règles impératives :",
  "- Tu n'établis JAMAIS de diagnostic médical et tu ne prescris JAMAIS de traitement pour une personne précise.",
  "- Si on te décrit des symptômes inquiétants ou une urgence, tu invites à consulter un professionnel de santé sans tarder.",
  "- Tu rappelles, quand c'est pertinent, que la naturopathie est complémentaire et ne remplace pas un avis ou un suivi médical.",
  "- Tu restes dans le domaine de la naturopathie et du bien-être ; tu déclines poliment les sujets hors de ce champ.",
  "- En cas de doute ou d'information incertaine, tu le dis honnêtement plutôt que d'inventer.",
].join("\n");

/**
 * Construit le tableau de messages envoyé à Mistral : system prompt en tête,
 * historique tronqué aux MAX_HISTORY derniers tours, message utilisateur en fin.
 * Fonction PURE (testée unitairement).
 */
export function buildMistralMessages(
  history: ChatTurn[],
  userMessage: string,
): Array<{ role: string; content: string }> {
  const recent = history.slice(-MAX_HISTORY);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...recent.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];
}

export type AssistantResult =
  | { ok: true; reply: string }
  | { ok: false; status: number; error: string };

/**
 * Appelle l'API Mistral et renvoie la réponse de l'assistant.
 * Dégradation propre :
 *   - clé absente  → { ok:false, status:503 }
 *   - erreur réseau / réponse non-2xx / vide → { ok:false, status:502 }
 */
export async function askNaturoAssistant(
  history: ChatTurn[],
  userMessage: string,
): Promise<AssistantResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "MISTRAL_API_KEY manquante" };
  }

  const messages = buildMistralMessages(history, userMessage);

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: 502, error: `Mistral ${res.status}: ${body.slice(0, 300)}` };
    }

    const data: any = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply || typeof reply !== "string") {
      return { ok: false, status: 502, error: "Réponse Mistral vide" };
    }
    return { ok: true, reply: reply.trim() };
  } catch (e: any) {
    return { ok: false, status: 502, error: e?.message || String(e) };
  }
}
