import { storage } from "./storage";

export const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const EMBED_MODEL = "mistralai/mistral-embed-2312"; // même modèle/espace vectoriel que l'historique « mistral-embed » (1024 dim), routé via OpenRouter
const EMBED_BATCH = 64; // chunks par requête embeddings (≤ 96, limite OpenRouter par requête)

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= CHUNK_SIZE) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const br = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (br > CHUNK_SIZE * 0.5) end = i + br + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return chunks.filter(Boolean);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY manquante");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.PUBLIC_URL || "https://app.ecole-naturo.fr",
        "X-Title": "Naturo Pro",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });
    if (!res.ok) throw new Error(`Embeddings OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    const vecs = [...data.data].sort((x: any, y: any) => x.index - y.index).map((d: any) => d.embedding as number[]);
    out.push(...vecs);
  }
  return out;
}

// Cache mémoire des vecteurs
let cache: { id: number; documentId: number; content: string; vec: number[] }[] | null = null;
export function invalidateVectorCache() { cache = null; }
async function loadCache() {
  if (cache) return cache;
  const rows = await storage.listAllKbChunks();
  cache = rows.map((r) => ({ id: r.id, documentId: r.documentId, content: r.content, vec: JSON.parse(r.embedding) as number[] }));
  return cache;
}

export interface RetrievedChunk { content: string; documentId: number; score: number; }
export async function retrieveRelevantChunks(question: string, topK = 5): Promise<RetrievedChunk[]> {
  const all = await loadCache();
  if (all.length === 0) return [];
  const [qVec] = await embedTexts([question]);
  return all
    .map((c) => ({ content: c.content, documentId: c.documentId, score: cosineSimilarity(qVec, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((c) => c.score > 0.2);
}
