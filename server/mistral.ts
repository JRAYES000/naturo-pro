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
const MAX_TOKENS = 4096; // marge confortable (~3000 mots) — évite les réponses coupées

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
  "- N'écris JAMAIS une réponse démesurée en un seul message. Pour une demande très large (programme complet, plan sur plusieurs semaines, tableau exhaustif), traite d'abord le plus important de façon synthétique, puis propose explicitement de continuer (« veux-tu que je détaille la suite ? ») au lieu de tout livrer d'un coup.",
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

const MAX_SEGMENTS = 4; // 1 réponse + jusqu'à 3 reprises automatiques
const CONTINUE_NUDGE =
  "Poursuis ta réponse précédente exactement là où elle s'est arrêtée (même au milieu d'une phrase ou d'un tableau), sans rien répéter, sans te resaluer et sans réintroduire le sujet.";

/**
 * Stream un seul appel Mistral à partir d'un tableau de messages prêt à l'emploi.
 * Émet les deltas de texte et RETOURNE le `finish_reason` (`"stop"` | `"length"` …).
 * Lève une erreur `.status` (502) si la requête échoue.
 */
async function* streamMistralSegment(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
): AsyncGenerator<string, string, unknown> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages,
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
  let finishReason = "stop";
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
      if (payload === "[DONE]") return finishReason;
      try {
        const j = JSON.parse(payload);
        const fr = j.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;
        const d = j.choices?.[0]?.delta?.content;
        if (typeof d === "string" && d) yield d;
      } catch {
        /* keep-alive / ligne partielle */
      }
    }
  }
  return finishReason;
}

/**
 * Variante streaming avec CONTINUATION AUTOMATIQUE : appelle Mistral en flux et,
 * si la réponse est coupée par manque de place (`finish_reason: "length"`),
 * relance automatiquement le modèle pour qu'il poursuive là où il s'est arrêté,
 * jusqu'à MAX_SEGMENTS. La réponse rendue est ainsi toujours complète, quelle que
 * soit la longueur, sans coupure visible côté utilisateur.
 *
 * Erreur `.status` (503 clé absente, 502 échec) propagée uniquement si le TOUT
 * PREMIER segment échoue ; au-delà, on conserve le texte déjà produit. Le system
 * prompt intègre instructions + contexte RAG via opts.
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
  const messages = buildMistralMessages(history, userMessage, opts);
  for (let seg = 0; seg < MAX_SEGMENTS; seg++) {
    const gen = streamMistralSegment(messages, apiKey);
    let segText = "";
    let finishReason = "stop";
    try {
      let r = await gen.next();
      while (!r.done) {
        segText += r.value;
        yield r.value;
        r = await gen.next();
      }
      finishReason = r.value;
    } catch (e) {
      if (seg === 0) throw e; // aucun texte fiable → laisser la route gérer l'erreur
      return; // une reprise a échoué → on s'arrête proprement avec le texte déjà produit
    }
    // Réponse terminée d'elle-même, ou plus de budget de reprise → on s'arrête.
    if (finishReason !== "length" || seg >= MAX_SEGMENTS - 1) return;
    // Coupée par la limite de tokens → on demande la suite et on enchaîne.
    messages.push({ role: "assistant", content: segText });
    messages.push({ role: "user", content: CONTINUE_NUDGE });
  }
}
