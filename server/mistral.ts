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
const MAX_TOKENS = 3000; // marge confortable (~2200 mots) — évite les réponses coupées

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
  "",
  "Style de réponse :",
  "- Va à l'essentiel : structure claire et points clés ciblés (vise 3 à 6 points), sans délayer ni empiler les sous-listes.",
  "- Donne d'abord le cœur de la réponse ; pour un sujet vaste, traite le plus important puis propose d'approfondir un point précis plutôt que de tout dérouler d'un seul message.",
  "- Termine toujours par une phrase complète, avec une courte conclusion ou une question d'ouverture.",
].join("\n");

/**
 * Construit le tableau de messages envoyé à Mistral : system prompt en tête,
 * historique tronqué aux MAX_HISTORY derniers tours, message utilisateur en fin.
 * Fonction PURE (testée unitairement).
 */
export function buildMistralMessages(
  history: ChatTurn[],
  userMessage: string,
  opts?: { customInstructions?: string; contextChunks?: string[] },
): Array<{ role: string; content: string }> {
  const recent = history.slice(-MAX_HISTORY);
  let system = SYSTEM_PROMPT;
  if (opts?.customInstructions?.trim()) {
    system += `\n\nConsignes spécifiques du formateur (à respecter) :\n${opts.customInstructions.trim()}`;
  }
  if (opts?.contextChunks?.length) {
    system +=
      `\n\nExtraits pertinents de tes supports de cours (appuie-toi dessus en priorité, sans rien inventer ; cite la source si pertinent) :\n` +
      opts.contextChunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
  }
  return [
    { role: "system", content: system },
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

/**
 * Variante streaming : appelle Mistral en `stream:true` et émet les deltas de
 * texte au fur et à mesure. Lève une erreur avec `.status` (503 si clé absente,
 * 502 sinon). Le system prompt intègre instructions + contexte RAG via opts.
 */
export async function* streamNaturoAssistant(
  history: ChatTurn[],
  userMessage: string,
  opts?: { customInstructions?: string; contextChunks?: string[] },
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    const e: any = new Error("MISTRAL_API_KEY manquante");
    e.status = 503;
    throw e;
  }
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: buildMistralMessages(history, userMessage, opts),
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const e: any = new Error(`Mistral ${res.status}`);
    e.status = 502;
    throw e;
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const j = JSON.parse(payload);
        const d = j.choices?.[0]?.delta?.content;
        if (typeof d === "string" && d) yield d;
      } catch {
        /* keep-alive / ligne partielle */
      }
    }
  }
}
