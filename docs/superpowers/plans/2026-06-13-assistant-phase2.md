# Assistant IA — Phase 2 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps en cases à cocher.

**Goal:** Rendu Markdown + UX (questions/copier/quota) puis streaming + instructions globales + RAG (mistral-embed) curaté par l'admin.

**Architecture:** 2 vagues déployables. Vague 1 = polish sur l'endpoint non-streaming existant. Vague 2 = reconstruction du flux chat en streaming + RAG. Composants indépendants (client, schéma, rag.ts, pdf.ts, admin) parallélisables ; le flux chat (`mistral.ts`/`chat.ts`) en une passe.

**Tech Stack:** Express+Drizzle (SQLite/MySQL, 3 schémas), React+Wouter+TanStack Query, react-markdown, unpdf, mistral-embed.

**Spec :** [docs/superpowers/specs/2026-06-13-assistant-phase2-design.md](../specs/2026-06-13-assistant-phase2-design.md)

**API vérifiées (empirique) :**
- Embeddings : `POST https://api.mistral.ai/v1/embeddings`, body `{model:"mistral-embed", input:[strings]}`, réponse `{data:[{embedding:[1024 floats], index}]}`.
- Chat streaming : `POST /v1/chat/completions` `{stream:true}` → SSE `data: {json}\n\n`, delta = `choices[0].delta.content`, fin `data: [DONE]`.
- unpdf (ESM-only) : `const {getDocumentProxy,extractText}=await import('unpdf'); const pdf=await getDocumentProxy(new Uint8Array(buf)); const {text}=await extractText(pdf,{mergePages:true})`.

---

# VAGUE 1 — Polish (déployable seul)

## Task 1 : Dépendance react-markdown

- [ ] **Step 1 :** `npm install react-markdown` → vérifie l'ajout dans `package.json` (dependencies).
- [ ] **Step 2 :** `npm run check` → 0 erreur.
- [ ] **Step 3 :** Commit `git add package.json package-lock.json && git commit -m "chore(assistant): dépendance react-markdown"` (+ trailer Co-Authored-By).

## Task 2 : Rendu Markdown + copier + questions suggérées (`client/src/pages/Chat.tsx`)

**Files:** Modify `client/src/pages/Chat.tsx`

- [ ] **Step 1 :** En tête, ajouter imports :
```tsx
import ReactMarkdown from "react-markdown";
import { Copy, Check } from "lucide-react";
```
- [ ] **Step 2 :** Remplacer le composant `Bubble` par une version qui rend le Markdown pour l'assistant, texte brut pour l'utilisateur, + bouton copier :
```tsx
function Bubble({ role, content, typing }: { role: string; content: string; typing?: boolean }) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} data-testid={`message-${role}`}>
      <div
        className={`group relative max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-secondary text-foreground"
        } ${typing ? "animate-pulse" : ""}`}
      >
        {isUser ? (
          content
        ) : (
          <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-pre:bg-muted prose-pre:text-foreground">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
        {!isUser && !typing && content && (
          <button
            onClick={copy}
            className="absolute -bottom-2 -right-2 opacity-0 group-hover:opacity-100 transition bg-card border border-border rounded-full p-1 shadow-sm"
            aria-label="Copier"
            data-testid="button-copy-message"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  );
}
```
- [ ] **Step 3 :** Dans l'état vide, sous le paragraphe d'exemple, ajouter des puces de questions cliquables. Remplacer le bloc `<p className="text-sm max-w-sm">…</p>` par ce paragraphe **suivi** de :
```tsx
              <div className="flex flex-wrap gap-2 justify-center mt-2 max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); setTimeout(submit, 0); }}
                    className="text-xs rounded-full border border-border bg-card px-3 py-1.5 hover:bg-secondary hover:text-primary transition"
                    data-testid="button-suggestion"
                  >
                    {s}
                  </button>
                ))}
              </div>
```
- [ ] **Step 4 :** Ajouter la constante en haut du fichier (après les imports) :
```tsx
const SUGGESTIONS = [
  "Quelles plantes pour accompagner un sommeil difficile ?",
  "Explique-moi le rôle du foie en naturopathie.",
  "Quels conseils d'hygiène de vie pour le stress ?",
  "Différence entre prébiotiques et probiotiques ?",
];
```
- [ ] **Step 5 :** `npm run check` → 0 erreur.
- [ ] **Step 6 :** Vérifier en preview (serveur `naturo-dev`, clé déjà dans `.env`) : poser une question → la réponse s'affiche **mise en forme** (titres/listes/gras), bouton copier au survol, puces de suggestion dans l'état vide.
- [ ] **Step 7 :** Commit `feat(assistant): rendu Markdown + questions suggérées + bouton copier`.

## Task 3 : max_tokens 1500 (`server/mistral.ts`)

- [ ] **Step 1 :** Dans `server/mistral.ts`, remplacer `const MAX_TOKENS = 800;` par `const MAX_TOKENS = 1500;`.
- [ ] **Step 2 :** `npm run check` → 0 erreur ; `npm test` → vert.
- [ ] **Step 3 :** Commit `feat(assistant): réponses plus complètes (max_tokens 1500)`.

## Task 4 : Quota d'usage (`ai_chat_usage`)

**Files:** `shared/schema.ts`, `shared/schema-mysql.ts`, `shared/schema-active.ts`, `shared/schema-drift.test.ts`, `server/storage.ts`, `server/routes/chat.ts`

- [ ] **Step 1 (SQLite)** `shared/schema.ts` — après `aiChatMessages` :
```typescript
export const aiChatUsage = sqliteTable("ai_chat_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  day: text("day").notNull(), // 'YYYY-MM-DD'
  count: integer("count").notNull().default(0),
});
```
+ insert schema `export const insertAiChatUsageSchema = createInsertSchema(aiChatUsage).omit({ id: true });`
+ types `export type AiChatUsage = typeof aiChatUsage.$inferSelect; export type InsertAiChatUsage = z.infer<typeof insertAiChatUsageSchema>;`
- [ ] **Step 2 (MySQL)** `shared/schema-mysql.ts` — après `aiChatMessages` :
```typescript
export const aiChatUsage = mysqlTable("ai_chat_usage", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  count: int("count").notNull().default(0),
});
```
+ même insert schema + types (mêmes noms).
- [ ] **Step 3 (active)** `shared/schema-active.ts` : `export const aiChatUsage = activeSchema.aiChatUsage;`, `export const insertAiChatUsageSchema = activeSchema.insertAiChatUsageSchema;`, ajouter `AiChatUsage, InsertAiChatUsage,` au re-export type.
- [ ] **Step 4 (drift)** `shared/schema-drift.test.ts` : ajouter `["aiChatUsage", sqlite.aiChatUsage, mysql.aiChatUsage],` à `TABLE_PAIRS`.
- [ ] **Step 5 (storage)** `server/storage.ts` : importer `aiChatUsage` + type `AiChatUsage` ; interface + impl :
```typescript
  // interface IStorage
  incrementAiChatUsage(userId: number, day: string): Promise<number>;
```
```typescript
  // classe DatabaseStorage
  async incrementAiChatUsage(userId: number, day: string): Promise<number> {
    const existing = await first<AiChatUsage>(
      db.select().from(aiChatUsage).where(and(eq(aiChatUsage.userId, userId), eq(aiChatUsage.day, day))),
    );
    if (existing) {
      await db.update(aiChatUsage).set({ count: existing.count + 1 })
        .where(eq(aiChatUsage.id, existing.id));
      return existing.count + 1;
    }
    await dbInsertReturning<AiChatUsage>(aiChatUsage, { userId, day, count: 1 });
    return 1;
  }
```
- [ ] **Step 6 (route)** `server/routes/chat.ts` — dans `POST /api/chat`, juste après la validation Zod, avant l'appel Mistral :
```typescript
    const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
    const day = new Date().toISOString().slice(0, 10);
    const used = await storage.incrementAiChatUsage(req.userId!, day);
    if (used > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} messages/jour). Réessaie demain.` });
    }
```
- [ ] **Step 7 (client)** `client/src/pages/Chat.tsx` — le `onError` de `sendMut` affiche déjà `e.message` ; le 429 remonte via `throwIfResNotOk`. Rien à changer (toast affiche le message du serveur).
- [ ] **Step 8 :** créer la table dev (db:push échoue → SQL direct) :
```bash
node -e "const D=require('better-sqlite3');const db=new D('./data.db');db.exec('CREATE TABLE IF NOT EXISTS ai_chat_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0)');db.close();console.log('ok')"
```
- [ ] **Step 9 :** `npm run check` + `npm test` (drift `aiChatUsage` vert).
- [ ] **Step 10 :** Commit `feat(assistant): quota quotidien par utilisatrice (ai_chat_usage)`.

## Task 5 : Migration prod + déploiement Vague 1

**Files:** Create `migrations/1.6-ai-chat-usage.sql`

- [ ] **Step 1 :** Créer `migrations/1.6-ai-chat-usage.sql` :
```sql
-- Migration 1.6 — table ai_chat_usage (quota quotidien assistant). Additif.
CREATE TABLE IF NOT EXISTS ai_chat_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  day VARCHAR(10) NOT NULL,
  count INT NOT NULL DEFAULT 0,
  INDEX idx_ai_usage_user_day (user_id, day)
);
```
- [ ] **Step 2 :** Commit migration + plier le spec/plan : `git add migrations/1.6-ai-chat-usage.sql docs/superpowers/specs/2026-06-13-assistant-phase2-design.md docs/superpowers/plans/2026-06-13-assistant-phase2.md && git commit -m "feat(assistant): migration ai_chat_usage + spec/plan phase 2"`.
- [ ] **Step 3 :** `npm run build` (vérifie `dist/index.cjs` + noter les nouveaux hash d'assets via `ls dist/public/assets`).
- [ ] **Step 4 :** Déploiement (alias `naturo-prod`, secrets via .env prod) :
```bash
# table prod
ssh naturo-prod 'bash -s' <<'REMOTE'
set -e
cd "$HOME/domains/app.ecole-naturo.fr/nodejs"
DB_USER=$(grep -E '^DB_USER=' .env|head -1|cut -d= -f2-|sed 's/^"//;s/"$//')
DB_PASSWORD=$(grep -E '^DB_PASSWORD=' .env|head -1|cut -d= -f2-|sed 's/^"//;s/"$//')
DB_NAME=$(grep -E '^DB_NAME=' .env|head -1|cut -d= -f2-|sed 's/^"//;s/"$//')
cp dist/index.cjs dist/index.cjs.bak.before-phase2-v1
mysql -u"$DB_USER" -p"$DB_PASSWORD" -h localhost "$DB_NAME" -e "CREATE TABLE IF NOT EXISTS ai_chat_usage (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, day VARCHAR(10) NOT NULL, count INT NOT NULL DEFAULT 0, INDEX idx_ai_usage_user_day (user_id, day));"
echo OK
REMOTE
# upload bundle + index.html + nouveaux assets (remplacer <JS>/<CSS> par les hash réels)
ssh naturo-prod 'cat > $HOME/domains/app.ecole-naturo.fr/nodejs/dist/index.cjs' < dist/index.cjs
ssh naturo-prod 'cat > $HOME/domains/app.ecole-naturo.fr/nodejs/dist/public/index.html' < dist/public/index.html
ssh naturo-prod 'cat > $HOME/domains/app.ecole-naturo.fr/nodejs/dist/public/assets/<JS>' < dist/public/assets/<JS>
ssh naturo-prod 'cat > $HOME/domains/app.ecole-naturo.fr/nodejs/dist/public/assets/<CSS>' < dist/public/assets/<CSS>
# restart + smoke
ssh naturo-prod 'touch $HOME/domains/app.ecole-naturo.fr/nodejs/tmp/restart.txt'
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://app.ecole-naturo.fr/
```
- [ ] **Step 5 :** Vérif md5 distant == local pour les 4 fichiers.

---

# VAGUE 2 — Streaming + instructions + RAG

## Task 6 : Dépendance unpdf + schéma RAG

**Files:** `package.json`, les 3 schémas, drift, `migrations/1.7-assistant-kb.sql`

- [ ] **Step 1 :** `npm install unpdf`.
- [ ] **Step 2 (SQLite)** `shared/schema.ts` — ajouter :
```typescript
export const assistantSettings = sqliteTable("assistant_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customInstructions: text("custom_instructions").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});
export const kbDocuments = sqliteTable("kb_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  filename: text("filename"),
  mimeType: text("mime_type"),
  charCount: integer("char_count").notNull().default(0),
  status: text("status").notNull().default("ready"), // 'ready' | 'error'
  error: text("error"),
  createdAt: integer("created_at").notNull(),
});
export const kbChunks = sqliteTable("kb_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(), // JSON array de floats
  createdAt: integer("created_at").notNull(),
});
```
+ insert schemas (`omit id`/timestamps) + types `AssistantSettings/KbDocument/KbChunk` (+ Insert*).
- [ ] **Step 3 (MySQL)** `shared/schema-mysql.ts` — équivalents : `assistant_settings` (`customInstructions` = `text` notNull, **pas de default sur TEXT en MySQL** → enlever `.default("")` côté MySQL, gérer le défaut applicativement), `kb_documents` (varchar pour title/filename/mime/status, `error` text, `char_count` int, `created_at` bigint), `kb_chunks` (`content` text, `embedding` `text` — type `longtext` si possible via `text("embedding")`… utiliser `text` ; 1024 floats ≈ 12 Ko, OK en `TEXT` 64 Ko). createdAt bigint. Mêmes noms d'exports.
  > ⚠️ MySQL `TEXT` n'accepte pas de DEFAULT non-null : pour `custom_instructions` et `embedding`, ne pas mettre `.default(...)`. Le drift test compare les **noms** de colonnes, pas les defaults → OK.
- [ ] **Step 4 (active + drift)** : re-exporter les 3 tables + insert schemas + types ; ajouter les 3 paires à `TABLE_PAIRS`.
- [ ] **Step 5 (dev)** créer les 3 tables en SQLite via `node -e` (CREATE TABLE IF NOT EXISTS, colonnes ci-dessus).
- [ ] **Step 6 :** `migrations/1.7-assistant-kb.sql` (MySQL) : `assistant_settings`, `kb_documents`, `kb_chunks` (avec `INDEX (document_id)`).
- [ ] **Step 7 :** `npm run check` + `npm test` (drift vert). Commit `feat(assistant): schéma RAG (assistant_settings, kb_documents, kb_chunks) + unpdf`.

## Task 7 : Storage RAG + instructions

**Files:** `server/storage.ts`

- [ ] **Step 1 :** Importer les 3 tables + types. Interface + impl :
```typescript
  getAssistantInstructions(): Promise<string>;
  setAssistantInstructions(text: string): Promise<void>;
  listKbDocuments(): Promise<KbDocument[]>;
  createKbDocument(d: { title: string; filename: string | null; mimeType: string | null; charCount: number; status: string; error: string | null }): Promise<KbDocument>;
  deleteKbDocument(id: number): Promise<void>;
  insertKbChunks(rows: { documentId: number; chunkIndex: number; content: string; embedding: string }[]): Promise<void>;
  listAllKbChunks(): Promise<KbChunk[]>;
```
Impl notable :
```typescript
  async getAssistantInstructions(): Promise<string> {
    const row = await first<AssistantSettings>(db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)));
    return row?.customInstructions ?? "";
  }
  async setAssistantInstructions(text: string): Promise<void> {
    const row = await first<AssistantSettings>(db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)));
    if (row) await db.update(assistantSettings).set({ customInstructions: text, updatedAt: Date.now() }).where(eq(assistantSettings.id, row.id));
    else await dbInsertReturning<AssistantSettings>(assistantSettings, { customInstructions: text, updatedAt: Date.now() });
  }
  async deleteKbDocument(id: number): Promise<void> {
    await db.delete(kbChunks).where(eq(kbChunks.documentId, id));
    await db.delete(kbDocuments).where(eq(kbDocuments.id, id));
  }
  async insertKbChunks(rows): Promise<void> { for (const r of rows) await dbInsertReturning<KbChunk>(kbChunks, { ...r, createdAt: Date.now() }); }
  async listAllKbChunks(): Promise<KbChunk[]> { return db.select().from(kbChunks); }
```
- [ ] **Step 2 :** `npm run check`. Commit `feat(assistant): storage RAG + instructions`.

## Task 8 : `server/rag.ts` (TDD sur fonctions pures)

**Files:** Create `server/rag.ts`, `server/rag.test.ts`

- [ ] **Step 1 (test d'abord)** `server/rag.test.ts` :
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cosineSimilarity, CHUNK_SIZE } from "./rag";

test("cosineSimilarity — vecteurs identiques = 1", () => {
  assert.ok(Math.abs(cosineSimilarity([1,2,3],[1,2,3]) - 1) < 1e-9);
});
test("cosineSimilarity — orthogonaux = 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1,0],[0,1])) < 1e-9);
});
test("chunkText — ne perd pas de contenu et borne la taille", () => {
  const txt = "Phrase une. ".repeat(500);
  const chunks = chunkText(txt);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= CHUNK_SIZE + 200));
  assert.ok(chunks.join(" ").includes("Phrase une."));
});
test("chunkText — texte court = 1 chunk", () => {
  assert.deepEqual(chunkText("court"), ["court"]);
});
```
- [ ] **Step 2 :** Lancer → échoue (module absent).
- [ ] **Step 3 :** `server/rag.ts` :
```typescript
import { storage } from "./storage";

export const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const EMBED_MODEL = "mistral-embed";

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
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY manquante");
  const res = await fetch("https://api.mistral.ai/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Embeddings Mistral ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return [...data.data].sort((x, y) => x.index - y.index).map((d: any) => d.embedding as number[]);
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
```
- [ ] **Step 4 :** Lancer le test → vert. `npm run check`.
- [ ] **Step 5 :** Commit `feat(assistant): rag.ts (chunk, cosine, embed, retrieval + cache) + tests`.

## Task 9 : `server/pdf.ts` (unpdf, ESM dans bundle CJS)

**Files:** Create `server/pdf.ts`

- [ ] **Step 1 :** `server/pdf.ts` :
```typescript
/** Extraction de texte des supports de cours. unpdf est ESM-only → import() dynamique. */
export async function extractText(buffer: Buffer, mimeType: string | null, filename: string): Promise<string> {
  const isPdf = (mimeType && mimeType.includes("pdf")) || filename.toLowerCase().endsWith(".pdf");
  if (!isPdf) return buffer.toString("utf-8"); // .txt / .md
  const { getDocumentProxy, extractText: extractPdf } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractPdf(pdf, { mergePages: true });
  const out = (text || "").trim();
  if (!out) throw new Error("PDF sans texte extractible (scanné ?)");
  return out;
}
```
- [ ] **Step 2 (build) :** `npm run build`. Si esbuild échoue sur unpdf (ESM), marquer `unpdf` en **external** dans `script/build.ts` (ajouter à `external: [...]`) et s'assurer qu'il est dans les `dependencies` (donc présent dans node_modules prod). Re-build → succès. Documenter le choix.
- [ ] **Step 3 :** Test fumée local : `node -e "import('./server/pdf.js').catch(()=>import('./server/pdf.ts'))..."` n'est pas trivial en TS ; à la place vérifier l'extraction via l'upload réel en Task 11 (preview). `npm run check`.
- [ ] **Step 4 :** Commit `feat(assistant): pdf.ts (extraction unpdf, .txt/.md direct)`.

## Task 10 : Routes admin (`server/routes/assistant-admin.ts`)

**Files:** Create `server/routes/assistant-admin.ts`, modify `server/routes/index.ts`

- [ ] **Step 1 :** `server/routes/assistant-admin.ts` :
```typescript
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireAdmin, type AuthedRequest } from "../auth";
import { extractText } from "../pdf";
import { chunkText, embedTexts, invalidateVectorCache } from "../rag";

const MAX_BASE64 = 7_000_000;
const instrSchema = z.object({ instructions: z.string().max(20000) });
const docSchema = z.object({
  title: z.string().min(1).max(255),
  filename: z.string().max(255).nullable().optional(),
  mimeType: z.string().max(127).nullable().optional(),
  dataBase64: z.string().max(MAX_BASE64).optional(),
  text: z.string().max(2_000_000).optional(),
});

export function registerAssistantAdminRoutes(app: Express): void {
  app.get("/api/admin/assistant/instructions", requireAuth, requireAdmin, async (_req, res) => {
    res.json({ instructions: await storage.getAssistantInstructions() });
  });
  app.put("/api/admin/assistant/instructions", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const p = instrSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    await storage.setAssistantInstructions(p.data.instructions);
    res.json({ ok: true });
  });
  app.get("/api/admin/assistant/documents", requireAuth, requireAdmin, async (_req, res) => {
    res.json(await storage.listKbDocuments());
  });
  app.post("/api/admin/assistant/documents", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const p = docSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides", errors: p.error.errors });
    const { title, filename, mimeType, dataBase64, text } = p.data;
    let raw = "";
    try {
      if (text) raw = text;
      else if (dataBase64) raw = await extractText(Buffer.from(dataBase64, "base64"), mimeType ?? null, filename ?? title);
      else return res.status(400).json({ message: "Fournir un texte ou un fichier." });
    } catch (e: any) {
      const doc = await storage.createKbDocument({ title, filename: filename ?? null, mimeType: mimeType ?? null, charCount: 0, status: "error", error: e?.message || "Extraction échouée" });
      return res.status(422).json({ message: doc.error, document: doc });
    }
    const chunks = chunkText(raw);
    let vectors: number[][] = [];
    try { vectors = chunks.length ? await embedTexts(chunks) : []; }
    catch (e: any) {
      const doc = await storage.createKbDocument({ title, filename: filename ?? null, mimeType: mimeType ?? null, charCount: raw.length, status: "error", error: e?.message || "Embeddings échoués" });
      return res.status(502).json({ message: doc.error, document: doc });
    }
    const doc = await storage.createKbDocument({ title, filename: filename ?? null, mimeType: mimeType ?? null, charCount: raw.length, status: "ready", error: null });
    await storage.insertKbChunks(chunks.map((c, i) => ({ documentId: doc.id, chunkIndex: i, content: c, embedding: JSON.stringify(vectors[i]) })));
    invalidateVectorCache();
    res.json({ document: doc, chunks: chunks.length });
  });
  app.delete("/api/admin/assistant/documents/:id", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    await storage.deleteKbDocument(Number(req.params.id));
    invalidateVectorCache();
    res.json({ ok: true });
  });
}
```
- [ ] **Step 2 :** `server/routes/index.ts` — import + `registerAssistantAdminRoutes(app);` (après `registerChatRoutes(app);`).
- [ ] **Step 3 :** `npm run check`. Commit `feat(assistant): routes admin instructions + base de connaissances`.

## Task 11 : Flux chat — streaming + instructions + RAG (passe unique)

**Files:** `server/mistral.ts`, `server/routes/chat.ts`, `client/src/pages/Chat.tsx`

- [ ] **Step 1 (mistral.ts)** étendre `buildMistralMessages` pour accepter un 3e arg optionnel et ajouter `streamNaturoAssistant` :
```typescript
export function buildMistralMessages(
  history: ChatTurn[],
  userMessage: string,
  opts?: { customInstructions?: string; contextChunks?: string[] },
): Array<{ role: string; content: string }> {
  const recent = history.slice(-MAX_HISTORY);
  let system = SYSTEM_PROMPT;
  if (opts?.customInstructions?.trim()) system += `\n\nConsignes spécifiques du formateur :\n${opts.customInstructions.trim()}`;
  if (opts?.contextChunks?.length) {
    system += `\n\nExtraits pertinents de tes supports de cours (appuie-toi dessus en priorité, sans inventer) :\n` +
      opts.contextChunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
  }
  return [
    { role: "system", content: system },
    ...recent.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];
}

export async function* streamNaturoAssistant(
  history: ChatTurn[], userMessage: string,
  opts?: { customInstructions?: string; contextChunks?: string[] },
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) { const e: any = new Error("MISTRAL_API_KEY manquante"); e.status = 503; throw e; }
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MISTRAL_MODEL, messages: buildMistralMessages(history, userMessage, opts), max_tokens: MAX_TOKENS, temperature: 0.3, stream: true }),
  });
  if (!res.ok || !res.body) { const e: any = new Error(`Mistral ${res.status}`); e.status = 502; throw e; }
  const reader = res.body.getReader();
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
      try { const j = JSON.parse(payload); const d = j.choices?.[0]?.delta?.content; if (d) yield d; } catch { /* keep-alive */ }
    }
  }
}
```
- [ ] **Step 2 (chat.ts)** réécrire `POST /api/chat` en streaming (garder GET/DELETE) :
```typescript
import { askNaturoAssistant, streamNaturoAssistant, type ChatTurn } from "../mistral";
import { retrieveRelevantChunks } from "../rag";
// ...
  app.post("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    const userMessage = parsed.data.message;

    const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
    const day = new Date().toISOString().slice(0, 10);
    if (await storage.incrementAiChatUsage(req.userId!, day) > AI_DAILY_LIMIT)
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT}/jour). Réessaie demain.` });

    const recent = await storage.listAiChatMessages(req.userId!, CONTEXT_LIMIT);
    const history: ChatTurn[] = recent.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    const instructions = await storage.getAssistantInstructions();
    let retrieved: { content: string; documentId: number }[] = [];
    try { retrieved = await retrieveRelevantChunks(userMessage); } catch { retrieved = []; }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    let full = "";
    try {
      for await (const delta of streamNaturoAssistant(history, userMessage, { customInstructions: instructions, contextChunks: retrieved.map((r) => r.content) })) {
        full += delta;
        res.write(delta);
      }
    } catch (e: any) {
      if (!full) {
        res.statusCode = e?.status === 503 ? 503 : 502;
        return res.end(e?.status === 503 ? "L'assistant n'est pas encore disponible." : "L'assistant n'a pas pu répondre, réessaie.");
      }
    }
    // sources (titres distincts) en ligne sentinelle
    if (retrieved.length) {
      const titles = [...new Set(retrieved.map((r) => r.documentId))];
      const docs = await storage.listKbDocuments();
      const names = titles.map((id) => docs.find((d) => d.id === id)?.title).filter(Boolean);
      if (names.length) res.write(`\n SOURCES:${JSON.stringify(names)}`);
    }
    await storage.createAiChatMessage({ userId: req.userId!, role: "user", content: userMessage });
    await storage.createAiChatMessage({ userId: req.userId!, role: "assistant", content: full });
    res.end();
  });
```
  > Le marqueur ` SOURCES:` (NUL) est retiré côté client avant rendu et persistance n'inclut pas la ligne sources (on persiste `full` seul).
- [ ] **Step 3 (client)** `Chat.tsx` — `sendMut` lit le flux :
```tsx
  const [streamText, setStreamText] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const sendMut = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/chat", { message });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      setStreamText(""); setSources([]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const nul = acc.indexOf(" SOURCES:");
        if (nul >= 0) {
          try { setSources(JSON.parse(acc.slice(nul + 9))); } catch {}
          acc = acc.slice(0, nul);
        }
        setStreamText(acc);
      }
    },
    onSuccess: async () => { setPending(null); setStreamText(""); await queryClient.invalidateQueries({ queryKey: ["/api/chat"] }); },
    onError: (e: any) => { setPending(null); setStreamText(""); toast({ title: "Erreur", description: e?.message || "L'assistant n'a pas pu répondre.", variant: "destructive" }); },
  });
```
  - Dans le rendu : pendant `sendMut.isPending`, afficher une bulle assistant avec `streamText` (rendu Markdown) au lieu du `…` typing ; afficher `sources` sous la réponse en cours (`<p className="text-xs text-muted-foreground mt-1">Sources : {sources.join(", ")}</p>`).
- [ ] **Step 4 :** `npm run check` + `npm test` (buildMistralMessages : ajouter 2 tests — injection instructions + contextChunks).
- [ ] **Step 5 (preview)** : poser une question → réponse **en streaming**, mise en forme Markdown ; tester l'upload d'un .md dans `/#/admin/assistant` puis une question liée → la réponse s'appuie dessus + « Sources ».
- [ ] **Step 6 :** Commit `feat(assistant): streaming + instructions globales + RAG dans le flux chat`.

## Task 12 : Page admin (`client/src/pages/admin/AssistantAdmin.tsx`)

**Files:** Create `client/src/pages/admin/AssistantAdmin.tsx`, modify `client/src/App.tsx`, `client/src/components/AppLayout.tsx`

- [ ] **Step 1 :** Page : `useQuery(['/api/admin/assistant/instructions'])` + textarea + save (`PUT`) ; `useQuery(['/api/admin/assistant/documents'])` + zone upload (input file → `FileReader.readAsDataURL` → base64 ; ou textarea « coller du texte ») → `POST` ; liste avec statut + bouton supprimer (`DELETE`). `AppLayout` + `PageHeader` + invalidations. Réutiliser le pattern base64 de `client/src/pages/ClientDetail.tsx` (documents). `data-testid` conventionnels.
- [ ] **Step 2 :** `App.tsx` : import + `<Route path="/admin/assistant" component={() => <ProtectedRoute><AssistantAdmin /></ProtectedRoute>} />`.
- [ ] **Step 3 :** `AppLayout.tsx` : dans le bloc admin (`isAdmin`), ajouter un lien « Assistant (admin) » vers `/admin/assistant` (icône `Sparkles` déjà importée, ou `BookOpen`).
- [ ] **Step 4 :** `npm run check` + preview (éditer instructions, uploader un support, vérifier la liste + suppression).
- [ ] **Step 5 :** Commit `feat(assistant): page admin instructions + base de connaissances`.

## Task 13 : Migration prod + déploiement Vague 2

- [ ] **Step 1 :** `npm run build` (noter nouveaux hash assets).
- [ ] **Step 2 :** Sur prod : `cp` backup bundle `before-phase2-v2` ; exécuter `migrations/1.7-assistant-kb.sql` via `mysql` (creds depuis .env) ; vérifier `SHOW TABLES LIKE 'kb_%'` + `assistant_settings`.
- [ ] **Step 3 :** Si `unpdf` external : sur prod `npm install unpdf` dans le dossier app (node_modules prod) — sinon (bundlé) rien à faire.
- [ ] **Step 4 :** Upload `dist/index.cjs` + `index.html` + nouveaux assets via `ssh … cat` ; vérif md5 ; `touch tmp/restart.txt`.
- [ ] **Step 5 :** Smoke : `GET /` 200 ; `GET /api/admin/assistant/documents` sans cookie → 401 ; test E2E (session temporaire admin) : `PUT instructions`, upload .md, `POST /api/chat` streaming renvoie du texte + nettoyage.

---

## Auto-revue (couverture spec)
- ✅ Markdown (T2), max_tokens (T3), suggestions+copier (T2), quota (T4/T5)
- ✅ Streaming (T11), instructions globales (T7/T10/T11/T12), RAG embed+chunk+cosine+cache (T8), PDF unpdf (T9), admin (T10/T12), sources (T11)
- ✅ Schéma ×3 + drift + migrations (T4/T6), dégradation (T8/T11), tests purs (T8/T11)
- ✅ Déploiements (T5, T13)
