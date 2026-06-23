/**
 * server/openrouter-image.ts — Génération d'images via OpenRouter.
 *
 * Responsabilité unique : produire une image de fond à partir d'un prompt, via
 * l'API OpenRouter (compatible OpenAI). Contrat confirmé par spike (2026-06-23) :
 *   POST /api/v1/chat/completions
 *   { model, messages, modalities:["image"], image_config:{ aspect_ratio } }
 *   → choices[0].message.images[0].image_url.url = data-URL base64.
 * ⚠️ modalities DOIT être ["image"] seul (avec "text" → 404 sur les modèles image-only).
 *
 * La clé est lue dans process.env.OPENROUTER_API_KEY. Dégradation propre : toute
 * erreur (clé absente, réseau, non-2xx, réponse vide) renvoie `null` pour laisser
 * l'appelant retomber sur un fond de marque.
 */

const IMAGE_MODEL = "sourceful/riverflow-v2-fast";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Génère une image de fond et la renvoie en data-URL base64, ou `null` en cas d'échec.
 * @param prompt Description de l'image (doit interdire tout texte dans l'image).
 */
export async function generateBackgroundImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.PUBLIC_URL || "https://app.ecole-naturo.fr",
        "X-Title": "Naturo Pro",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image"],
        image_config: { aspect_ratio: "4:5" },
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    return typeof url === "string" && url.startsWith("data:") ? url : null;
  } catch {
    return null;
  }
}
