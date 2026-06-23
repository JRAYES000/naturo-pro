/**
 * server/social-content.ts — Studio contenu : persona marketing + templates de
 * formats + construction du CTA/lien de réservation + classement des thèmes.
 *
 * Le streaming réutilise la mécanique de server/mistral.ts (streamCompletion).
 * Fonctions PURES testées : buildContentMessages, buildBookingCta, rankThemes,
 * buildAnglesPrompt, FORMAT_TEMPLATES.
 */
import { streamCompletion, LLM_MODEL } from "./mistral";

export type Channel = "instagram" | "facebook";
export type ContentFormat = "carrousel" | "reel" | "story" | "post_groupe" | "legende";
export type TopicType = "client_theme" | "theme" | "libre";

export interface ContentVoice {
  name: string;
  specialties?: string | null; // JSON array string
  city?: string | null;
  marketingTone?: string | null;
  marketingAudience?: string | null;
  slug?: string | null;
  publicPageEnabled?: boolean | null;
}

export const CONTENT_SYSTEM_PROMPT = [
  "Tu es un expert en communication digitale spécialisé dans l'accompagnement des praticiennes en naturopathie qui débutent leur activité.",
  "Ta mission : rédiger pour elles des contenus de réseaux sociaux PRÊTS À PUBLIER, qui attirent des clientes et inspirent confiance.",
  "Tu réponds TOUJOURS en français.",
  "",
  "Règles de conformité IMPÉRATIVES (santé / cadre légal) :",
  "- N'écris JAMAIS d'allégation thérapeutique : pas de « soigne », « guérit », « traite », « remède contre [maladie] », ni de promesse de résultat médical.",
  "- Emploie un langage prudent et bien-être : « accompagner », « soutenir le terrain », « favoriser l'équilibre », « hygiène de vie », « mieux-être ».",
  "- Pas de diagnostic ni de conseil pour une personne précise ; tu t'adresses à une audience générale.",
  "- N'invente pas de faits ; en cas de doute, reste général et prudent.",
  "",
  "Style :",
  "- Accroche forte dès la première ligne (le scroll s'arrête en 2 secondes).",
  "- Une seule idée par publication, claire et actionnable.",
  "- Ton incarné ; émojis avec parcimonie (jamais d'excès).",
  "- Termine par un appel à l'action vers la prise de rendez-vous, en intégrant le lien fourni s'il existe.",
  "- Fournis le contenu DIRECTEMENT, prêt à copier-coller, sans méta-commentaire ni introduction du type « Voici… ».",
].join("\n");

export const FORMAT_TEMPLATES: Record<ContentFormat, string> = {
  carrousel:
    "Format = CARROUSEL Instagram. Structure :\n" +
    "- Slide 1 : une accroche courte et percutante (≤ 8 mots) qui arrête le scroll.\n" +
    "- Slides 2 à 6 : une seule idée par slide, phrase courte + 1 à 2 lignes d'explication concrète.\n" +
    "- Dernière slide : un appel à l'action clair vers la prise de rendez-vous.\n" +
    "Numérote clairement chaque slide (Slide 1, Slide 2, …).\n" +
    "Puis, sous le carrousel : une LÉGENDE engageante (3 à 5 lignes) et 8 à 12 hashtags pertinents.",
  reel:
    "Format = SCRIPT DE REEL (vidéo courte 20–40 s). Structure :\n" +
    "- HOOK (3 premières secondes) : une phrase choc à dire face caméra.\n" +
    "- SCRIPT parlé : 3 à 5 étapes courtes, rythmées, faciles à dire.\n" +
    "- TEXTES À L'ÉCRAN : propose les incrustations clés.\n" +
    "- CTA final vers la prise de rendez-vous.\n" +
    "Puis une LÉGENDE courte + 5 à 8 hashtags.",
  story:
    "Format = SÉQUENCE DE STORIES Instagram (2 à 4 frames). Structure :\n" +
    "- Frame 1 : accroche / question qui interpelle.\n" +
    "- Frames intermédiaires : 1 idée simple par frame, texte court.\n" +
    "- Propose un sticker interactif (sondage ou question) sur une frame.\n" +
    "- Dernière frame : invite à réserver (mention « lien en bio » ou swipe).",
  post_groupe:
    "Format = POST pour un GROUPE FACEBOOK LOCAL. Contraintes :\n" +
    "- Ton communautaire, humain, NON publicitaire (les groupes rejettent la pub frontale).\n" +
    "- Ancrage local : évoque la ville / la proximité.\n" +
    "- Apporte d'abord de la valeur (1 conseil concret), puis un CTA discret vers la prise de rendez-vous en fin.\n" +
    "- Pas de hashtags (inutiles dans les groupes Facebook).",
  legende:
    "Format = LÉGENDE seule (pour une photo déjà prête). Structure :\n" +
    "- 1re ligne = accroche forte.\n" +
    "- 3 à 6 lignes de valeur, aérées.\n" +
    "- CTA vers la prise de rendez-vous.\n" +
    "- 8 à 12 hashtags pertinents en fin.",
};

/** Construit le CTA + lien de réservation, avec repli si la page publique n'est pas active. */
export function buildBookingCta(user: { slug?: string | null; publicPageEnabled?: boolean | null }): string {
  const base = process.env.PUBLIC_URL || "http://localhost:5000";
  if (user.slug && user.publicPageEnabled) {
    return `Pour un accompagnement personnalisé, réserve ta séance découverte 👉 ${base}/p/${user.slug}`;
  }
  return "Invite chaleureusement à réserver une séance découverte (n'invente PAS de lien : la praticienne doit activer sa page publique de réservation pour insérer son lien automatiquement).";
}

/** Construit les messages LLM pour la génération de contenu. Fonction PURE. */
export function buildContentMessages(params: {
  channel: Channel;
  format: ContentFormat;
  topic: string;
  voice: ContentVoice;
  contextChunks?: string[];
}): Array<{ role: string; content: string }> {
  const { channel, format, topic, voice, contextChunks } = params;
  let specialties = "";
  try {
    const arr = JSON.parse(voice.specialties || "[]");
    if (Array.isArray(arr)) specialties = arr.filter(Boolean).join(", ");
  } catch { /* ignore */ }
  const tone = voice.marketingTone?.trim() || "chaleureux, accessible et incarné";
  const audience = voice.marketingAudience?.trim() || "des femmes qui cherchent à retrouver énergie et équilibre au naturel";
  const channelLabel = channel === "instagram" ? "Instagram" : "Facebook";

  let system = CONTENT_SYSTEM_PROMPT;
  system += "\n\nProfil de la praticienne (adapte le contenu à elle) :\n" +
    `- Nom : ${voice.name}\n` +
    (specialties ? `- Spécialités : ${specialties}\n` : "") +
    (voice.city?.trim() ? `- Ville : ${voice.city.trim()}\n` : "") +
    `- Ton souhaité : ${tone}\n` +
    `- Audience cible : ${audience}`;
  system += `\n\n${FORMAT_TEMPLATES[format]}`;
  system += `\n\nAppel à l'action à intégrer en fin de contenu :\n${buildBookingCta(voice)}`;
  if (contextChunks?.length) {
    system += "\n\nÉléments naturo issus des supports de cours (appuie-toi dessus pour rester juste, sans recopier, sans citer de source) :\n" +
      contextChunks.map((c) => `- ${c}`).join("\n\n");
  }
  const userMsg = `Rédige un contenu pour ${channelLabel} sur le thème suivant : « ${topic} ». Donne-le prêt à publier.`;
  return [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];
}

/** Classe les thèmes par fréquence : filtre les vides, trie décroissant, limite. PURE. */
export function rankThemes(
  rows: Array<{ theme: string | null; count: number }>,
  limit = 5,
): Array<{ theme: string; count: number }> {
  return rows
    .filter((r): r is { theme: string; count: number } => !!r.theme && r.theme.trim().length > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Prompt (PUR) pour proposer 5 angles de posts à partir des thèmes récurrents. */
export function buildAnglesPrompt(themes: string[], voice: { name: string }): string {
  return (
    `Tu aides ${voice.name}, praticienne en naturopathie, à trouver des idées de posts pour Instagram/Facebook.\n` +
    `Thèmes qui reviennent souvent chez ses clientes : ${themes.join(", ")}.\n` +
    "Propose 5 ANGLES de posts concrets et variés (pas de généralités).\n" +
    "Pour chacun : un \"title\" court, un \"hook\" (1re phrase qui arrête le scroll) et un \"suggestedFormat\" parmi : carrousel, reel, story, post_groupe, legende.\n" +
    "Réponds UNIQUEMENT en JSON compact : {\"angles\":[{\"title\":\"...\",\"hook\":\"...\",\"suggestedFormat\":\"carrousel\"}]}"
  );
}

export interface Angle { title: string; hook: string; suggestedFormat: ContentFormat; }
const FORMATS: ContentFormat[] = ["carrousel", "reel", "story", "post_groupe", "legende"];

/** Génère 5 angles via un appel LLM court (non-stream). Repli déterministe si indispo. */
export async function suggestContentAngles(themes: string[], voice: { name: string }): Promise<Angle[]> {
  const fallback: Angle[] = themes.slice(0, 5).map((t) => ({
    title: `Idée de post : ${t}`,
    hook: `Et si on parlait de ${t.toLowerCase()} ?`,
    suggestedFormat: "carrousel",
  }));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || themes.length === 0) return fallback;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.PUBLIC_URL || "https://app.ecole-naturo.fr",
        "X-Title": "Naturo Pro",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "user", content: buildAnglesPrompt(themes, voice) }],
        max_tokens: 500, temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return fallback;
    const data: any = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    const angles = Array.isArray(parsed.angles) ? parsed.angles : [];
    const clean: Angle[] = angles
      .filter((a: any) => a && typeof a.title === "string" && typeof a.hook === "string")
      .map((a: any) => ({
        title: String(a.title).slice(0, 120),
        hook: String(a.hook).slice(0, 200),
        suggestedFormat: FORMATS.includes(a.suggestedFormat) ? a.suggestedFormat : "carrousel",
      }));
    return clean.length ? clean.slice(0, 5) : fallback;
  } catch { return fallback; }
}

/** Stream un contenu prêt à publier (réutilise la continuation automatique de Mistral). */
export async function* streamContentStudio(params: {
  channel: Channel;
  format: ContentFormat;
  topic: string;
  voice: ContentVoice;
  contextChunks?: string[];
}): AsyncGenerator<string, void, unknown> {
  const messages = buildContentMessages(params);
  yield* streamCompletion(messages);
}
