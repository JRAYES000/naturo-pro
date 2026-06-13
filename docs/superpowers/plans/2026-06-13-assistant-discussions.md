# Discussions de l'assistant IA — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer l'assistant IA (fil unique par praticienne) en discussions multiples, catégorisées par cliente ou par thématique, avec injection de la fiche cliente et catégorisation automatique.

**Architecture:** Nouvelle table `ai_discussions` (cliente OU thématique) ; `ai_chat_messages` gagne `discussionId`. Routes `/api/discussions(/:id/messages)` remplacent `/api/chat` et réutilisent la chaîne de streaming existante (`streamNaturoAssistant`, RAG, quota). Frontend : `/app/chat` devient un layout deux panneaux (sidebar de discussions groupées + conversation), relié à la page Clients.

**Tech Stack:** Express + Drizzle (3 schémas SQLite/MySQL + `schema-active.ts` + `schema-drift.test.ts`), React 18 + Wouter (hash routing) + TanStack Query v5, tests `node:test` (`npm test`), build esbuild, déploiement Hostinger SSH.

**Conventions clés (rappel) :** tous les appels client via `apiRequest`/`queryClient` ; query keys en tableau ; invalider après mutation ; Drizzle better-sqlite3 synchrone (`.get/.all/.run`, ne pas déstructurer) ; tout passe par `storage` ; Zod sur les bodies ; UI en français ; ajouter une table = la mettre dans `schema.ts` + `schema-mysql.ts` + `schema-active.ts`.

---

## Structure de fichiers

**Créés :**
- `shared/assistant-themes.ts` — constante des thématiques prédéfinies (partagée front/back).
- `shared/assistant-themes.test.ts` — test unitaire de la constante.
- `server/routes/discussions.ts` — routes CRUD discussions + envoi/streaming (remplace `chat.ts`).
- `client/src/components/assistant/DiscussionSidebar.tsx` — panneau gauche (groupes cliente/thématique, filtre, bouton nouvelle discussion).
- `client/src/components/assistant/NewDiscussionDialog.tsx` — modale de création (choix cliente / thématique).

**Modifiés :**
- `shared/schema.ts` — table `aiDiscussions` + colonne `discussionId` sur `aiChatMessages`.
- `shared/schema-mysql.ts` — idem (MySQL).
- `shared/schema-active.ts` — export `aiDiscussions`.
- `shared/schema-drift.test.ts` — paire `aiDiscussions`.
- `server/storage.ts` — migration DDL + backfill + méthodes discussions + messages scopés `discussionId` + détacher les discussions à la suppression d'une cliente.
- `server/mistral.ts` — `opts.clientContext` dans `buildMistralMessages` + `generateDiscussionMeta`.
- `server/mistral.test.ts` — test `clientContext`.
- `server/routes/index.ts` — registre `registerDiscussionRoutes` à la place de `registerChatRoutes`.
- `server/routes/clients.ts` — détacher les discussions quand une cliente est supprimée.
- `client/src/pages/Chat.tsx` — réécriture en layout deux panneaux.
- `client/src/pages/ClientDetail.tsx` — section « Discussions avec l'assistant » + bouton.
- `client/src/App.tsx` — route `/app/chat/:discussionId?`.

**Supprimé :**
- `server/routes/chat.ts` — remplacé par `discussions.ts`.

---

## Task 1 : Constante des thématiques (partagée)

**Files:**
- Create: `shared/assistant-themes.ts`
- Test: `shared/assistant-themes.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// shared/assistant-themes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSISTANT_THEMES, THEME_OTHER } from "./assistant-themes";

test("ASSISTANT_THEMES — liste non vide, libellés uniques, contient 'Autre…'", () => {
  assert.ok(ASSISTANT_THEMES.length >= 10);
  assert.equal(new Set(ASSISTANT_THEMES).size, ASSISTANT_THEMES.length);
  assert.ok(ASSISTANT_THEMES.includes(THEME_OTHER));
  assert.equal(ASSISTANT_THEMES[ASSISTANT_THEMES.length - 1], THEME_OTHER);
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npm test`
Expected: FAIL (`Cannot find module './assistant-themes'`).

- [ ] **Step 3: Créer la constante**

```ts
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
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/assistant-themes.ts shared/assistant-themes.test.ts
git commit -m "feat(assistant): constante des thématiques prédéfinies"
```

---

## Task 2 : Modèle de données (3 schémas + drift)

**Files:**
- Modify: `shared/schema.ts` (après `aiChatMessages`, ~ligne 317 ; et ajout colonne sur `aiChatMessages`)
- Modify: `shared/schema-mysql.ts` (zones équivalentes)
- Modify: `shared/schema-active.ts:42-46`
- Modify: `shared/schema-drift.test.ts:30-35`

- [ ] **Step 1: Ajouter `discussionId` à `aiChatMessages` (SQLite)**

Dans `shared/schema.ts`, table `aiChatMessages` — ajouter la colonne (juste avant `createdAt`) :

```ts
  discussionId: integer("discussion_id"), // null = legacy (backfillé en « Discussion générale »)
```

- [ ] **Step 2: Ajouter la table `aiDiscussions` (SQLite)**

Dans `shared/schema.ts`, juste après la table `aiChatMessages` :

```ts
// Assistant IA — discussions (fil par sujet) rattachées à une cliente OU à une thématique.
export const aiDiscussions = sqliteTable("ai_discussions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  clientId: integer("client_id"),         // non-null = discussion-cliente
  theme: text("theme"),                    // thématique (prédéfinie ou libre) si clientId null
  title: text("title").notNull().default("Nouvelle discussion"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

- [ ] **Step 3: Ajouter le type exporté (SQLite)**

Dans `shared/schema.ts`, près des autres `export type` (section « Types ») :

```ts
export type AiDiscussion = typeof aiDiscussions.$inferSelect;
```

- [ ] **Step 4: Répliquer en MySQL**

Dans `shared/schema-mysql.ts` : ajouter `discussionId: int("discussion_id")` à `aiChatMessages` (avant `createdAt`), puis la table :

```ts
export const aiDiscussions = mysqlTable("ai_discussions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  clientId: int("client_id"),
  theme: varchar("theme", { length: 120 }),
  title: varchar("title", { length: 255 }).notNull().default("Nouvelle discussion"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
```

Et le type (section types de `schema-mysql.ts`) :

```ts
export type AiDiscussion = typeof aiDiscussions.$inferSelect;
```

- [ ] **Step 5: Exporter dans `schema-active.ts`**

Dans `shared/schema-active.ts`, après la ligne `aiChatMessages` (l.42) :

```ts
export const aiDiscussions = activeSchema.aiDiscussions;
```

- [ ] **Step 6: Ajouter la paire au drift test**

Dans `shared/schema-drift.test.ts`, ajouter dans `TABLE_PAIRS` (après `aiChatMessages`) :

```ts
  ["aiDiscussions",        sqlite.aiDiscussions,        mysql.aiDiscussions],
```

- [ ] **Step 7: Vérifier types + drift**

Run: `npm run check && npm test`
Expected: `tsc` OK ; tests PASS dont `drift — colonnes de la table "aiDiscussions"` et `aiChatMessages` (les deux schémas exposent `discussion_id`).

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts shared/schema-mysql.ts shared/schema-active.ts shared/schema-drift.test.ts
git commit -m "feat(assistant): schéma ai_discussions + discussionId sur les messages"
```

---

## Task 3 : Migration MySQL + backfill du fil existant

**Files:**
- Modify: `server/storage.ts` (boucle `runMysqlMigrations`, ~l.504 ; nouvelle fonction de backfill appelée par `migrationsReady`)

- [ ] **Step 1: Ajouter le DDL MySQL best-effort**

Dans `server/storage.ts`, boucle DDL de `runMysqlMigrations` (juste après la ligne `ALTER TABLE kb_documents ADD COLUMN folder ...`) :

```ts
      // Assistant IA — discussions (fil par sujet)
      `CREATE TABLE IF NOT EXISTS ai_discussions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id INT NULL,
        theme VARCHAR(120) NULL,
        title VARCHAR(255) NOT NULL DEFAULT 'Nouvelle discussion',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      "ALTER TABLE ai_chat_messages ADD COLUMN discussion_id INT NULL",
```

- [ ] **Step 2: Écrire le backfill (dual-driver, idempotent)**

Dans `server/storage.ts`, ajouter une fonction exportée appelée après les migrations. Elle regroupe les messages sans `discussionId` par `userId`, crée une discussion « Discussion générale » et rattache les messages. Fonctionne SQLite et MySQL via `storage`.

```ts
// Backfill : rattache les messages legacy (discussion_id NULL) à une discussion
// « Discussion générale » par praticienne. Idempotent : ne fait rien si tout est rattaché.
export async function backfillLegacyDiscussions(): Promise<void> {
  try {
    const orphans = await storage.listLegacyChatUserIds(); // userIds ayant des messages sans discussionId
    for (const userId of orphans) {
      const now = Date.now();
      const disc = await storage.createDiscussion({
        userId, clientId: null, theme: null, title: "Discussion générale",
      });
      await storage.assignLegacyMessagesToDiscussion(userId, disc.id);
    }
    if (orphans.length) console.log(`[db][backfill] ${orphans.length} fil(s) legacy → « Discussion générale »`);
  } catch (e: any) {
    console.warn("[db][backfill] discussions legacy (best-effort) :", e?.message || e);
  }
}
```

(Les méthodes `listLegacyChatUserIds`, `createDiscussion`, `assignLegacyMessagesToDiscussion` sont définies en Task 4.)

- [ ] **Step 3: Brancher le backfill après les migrations**

Dans `server/storage.ts`, modifier l'export `migrationsReady` pour chaîner le backfill (il a besoin des méthodes storage, qui existent déjà au runtime) :

```ts
export const migrationsReady: Promise<void> =
  (DB_DRIVER === "mysql" ? runMysqlMigrations() : Promise.resolve()).then(() =>
    backfillLegacyDiscussions(),
  );
```

- [ ] **Step 4: Vérifier types**

Run: `npm run check`
Expected: échec attendu sur `storage.listLegacyChatUserIds` / `createDiscussion` / `assignLegacyMessagesToDiscussion` (définis en Task 4). On enchaîne Task 4 avant de committer.

> Note : pas de commit isolé ici — Task 3 + Task 4 forment un tout cohérent (le backfill dépend des méthodes storage). Commit à la fin de Task 4.

---

## Task 4 : Méthodes storage (discussions + messages scopés)

**Files:**
- Modify: `server/storage.ts` (interface `IStorage` ~l.722 ; implémentation ~l.1410 ; import des tables/types)

- [ ] **Step 1: Importer table + type**

En haut de `server/storage.ts`, ajouter `aiDiscussions` à l'import depuis `@shared/schema-active` (liste des tables) et `AiDiscussion` à l'import de types depuis `@shared/schema`.

- [ ] **Step 2: Déclarer les méthodes dans l'interface**

Dans `IStorage`, section « Assistant IA » (remplacer le bloc `listAiChatMessages/createAiChatMessage/deleteAiChatMessages` par) :

```ts
  // Assistant IA — discussions
  listDiscussions(userId: number): Promise<AiDiscussion[]>;
  getDiscussion(id: number): Promise<AiDiscussion | undefined>;
  createDiscussion(d: { userId: number; clientId: number | null; theme: string | null; title?: string }): Promise<AiDiscussion>;
  updateDiscussion(id: number, patch: Partial<{ title: string; theme: string | null; clientId: number | null }>): Promise<AiDiscussion | undefined>;
  touchDiscussion(id: number): Promise<void>;
  deleteDiscussion(id: number): Promise<void>;
  detachClientFromDiscussions(clientId: number): Promise<void>;
  // Assistant IA — messages (scopés par discussion)
  listDiscussionMessages(discussionId: number, limit?: number): Promise<AiChatMessage[]>;
  createDiscussionMessage(d: { discussionId: number; userId: number; role: string; content: string }): Promise<AiChatMessage>;
  // Backfill legacy
  listLegacyChatUserIds(): Promise<number[]>;
  assignLegacyMessagesToDiscussion(userId: number, discussionId: number): Promise<void>;
  // Quota (inchangé)
  incrementAiChatUsage(userId: number, day: string): Promise<number>;
```

- [ ] **Step 3: Implémenter les méthodes**

Dans la classe storage, remplacer l'ancien bloc `listAiChatMessages/createAiChatMessage/deleteAiChatMessages` par :

```ts
  // ── Assistant IA — discussions ───────────────────────────────────────────────
  async listDiscussions(userId: number): Promise<AiDiscussion[]> {
    return db.select().from(aiDiscussions)
      .where(eq(aiDiscussions.userId, userId))
      .orderBy(desc(aiDiscussions.updatedAt), desc(aiDiscussions.id));
  }
  async getDiscussion(id: number): Promise<AiDiscussion | undefined> {
    return first(db.select().from(aiDiscussions).where(eq(aiDiscussions.id, id)));
  }
  async createDiscussion(d: { userId: number; clientId: number | null; theme: string | null; title?: string }): Promise<AiDiscussion> {
    const now = Date.now();
    return dbInsertReturning<AiDiscussion>(aiDiscussions, {
      userId: d.userId, clientId: d.clientId, theme: d.theme,
      title: d.title ?? "Nouvelle discussion", createdAt: now, updatedAt: now,
    });
  }
  async updateDiscussion(id: number, patch: Partial<{ title: string; theme: string | null; clientId: number | null }>): Promise<AiDiscussion | undefined> {
    await db.update(aiDiscussions).set({ ...patch, updatedAt: Date.now() }).where(eq(aiDiscussions.id, id));
    return this.getDiscussion(id);
  }
  async touchDiscussion(id: number): Promise<void> {
    await db.update(aiDiscussions).set({ updatedAt: Date.now() }).where(eq(aiDiscussions.id, id));
  }
  async deleteDiscussion(id: number): Promise<void> {
    await db.delete(aiChatMessages).where(eq(aiChatMessages.discussionId, id));
    await db.delete(aiDiscussions).where(eq(aiDiscussions.id, id));
  }
  async detachClientFromDiscussions(clientId: number): Promise<void> {
    await db.update(aiDiscussions).set({ clientId: null }).where(eq(aiDiscussions.clientId, clientId));
  }
  // ── Assistant IA — messages ──────────────────────────────────────────────────
  async listDiscussionMessages(discussionId: number, limit = 200): Promise<AiChatMessage[]> {
    const rows = await db.select().from(aiChatMessages)
      .where(eq(aiChatMessages.discussionId, discussionId))
      .orderBy(desc(aiChatMessages.createdAt), desc(aiChatMessages.id))
      .limit(limit);
    return rows.reverse();
  }
  async createDiscussionMessage(d: { discussionId: number; userId: number; role: string; content: string }): Promise<AiChatMessage> {
    return dbInsertReturning<AiChatMessage>(aiChatMessages, { ...d, createdAt: Date.now() });
  }
  // ── Backfill legacy ──────────────────────────────────────────────────────────
  async listLegacyChatUserIds(): Promise<number[]> {
    const rows = await db.selectDistinct({ userId: aiChatMessages.userId })
      .from(aiChatMessages).where(isNull(aiChatMessages.discussionId));
    return rows.map((r) => r.userId);
  }
  async assignLegacyMessagesToDiscussion(userId: number, discussionId: number): Promise<void> {
    await db.update(aiChatMessages).set({ discussionId })
      .where(and(eq(aiChatMessages.userId, userId), isNull(aiChatMessages.discussionId)));
  }
```

> Import requis : ajouter `isNull` à l'import `drizzle-orm` de `server/storage.ts:37` (actuellement `import { eq, and, gte, lte, desc, like, or, sql } from "drizzle-orm";` → ajouter `isNull`). `and`, `eq`, `desc` y sont déjà.

- [ ] **Step 4: Vérifier types + tests**

Run: `npm run check && npm test`
Expected: `tsc` OK (Task 3 résolu) ; tests PASS.

- [ ] **Step 5: Démarrer le dev pour exécuter le backfill SQLite**

Sur une base dev `data.db` existante, ajouter la colonne manquante puis vérifier le boot (le backfill crée la « Discussion générale ») :

```bash
node -e "const D=require('better-sqlite3');const db=new D('data.db');try{db.exec('ALTER TABLE ai_chat_messages ADD COLUMN discussion_id INTEGER');}catch(e){console.log(e.message);} db.exec(\"CREATE TABLE IF NOT EXISTS ai_discussions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, client_id INTEGER, theme TEXT, title TEXT NOT NULL DEFAULT 'Nouvelle discussion', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)\"); console.log('dev schema ok');"
```

(En prod, le DDL + backfill s'appliquent automatiquement au boot via `migrationsReady`.)

- [ ] **Step 6: Commit (Task 3 + 4)**

```bash
git add server/storage.ts
git commit -m "feat(assistant): storage discussions + backfill du fil legacy"
```

---

## Task 5 : `mistral.ts` — fiche cliente + génération titre/thème

**Files:**
- Modify: `server/mistral.ts` (`buildMistralMessages` ~l.37 ; nouvelle fonction `generateDiscussionMeta`)
- Modify: `server/mistral.test.ts` (nouveau test)

- [ ] **Step 1: Écrire le test `clientContext` qui échoue**

Ajouter à `server/mistral.test.ts` :

```ts
test("buildMistralMessages — injecte la fiche cliente dans le system", () => {
  const msgs = buildMistralMessages([], "Q", { clientContext: "Fiche de la cliente : Marie, 42 ans." });
  assert.equal(msgs[0].role, "system");
  assert.ok(msgs[0].content.includes("Marie, 42 ans"));
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npm test`
Expected: FAIL (la fiche n'apparaît pas — `clientContext` non géré).

- [ ] **Step 3: Gérer `clientContext` dans `buildMistralMessages`**

Dans `server/mistral.ts`, étendre la signature et l'injection :

```ts
export function buildMistralMessages(
  history: ChatTurn[],
  userMessage: string,
  opts?: { customInstructions?: string; contextChunks?: string[]; clientContext?: string },
): Array<{ role: string; content: string }> {
  const recent = history.slice(-MAX_HISTORY);
  let system = SYSTEM_PROMPT;
  if (opts?.customInstructions?.trim()) {
    system += `\n\nConsignes spécifiques du formateur (à respecter) :\n${opts.customInstructions.trim()}`;
  }
  if (opts?.clientContext?.trim()) {
    system += `\n\n${opts.clientContext.trim()}`;
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
```

- [ ] **Step 4: Lancer → succès**

Run: `npm test`
Expected: PASS (tous, dont le nouveau).

- [ ] **Step 5: Ajouter `generateDiscussionMeta`**

À la fin de `server/mistral.ts` :

```ts
import { ASSISTANT_THEMES, THEME_OTHER } from "@shared/assistant-themes";

// Génère un titre court + une thématique (parmi ASSISTANT_THEMES) depuis la 1re question.
// Appel non-streaming, court. Fallback robuste : titre tronqué + « Autre… ».
export async function generateDiscussionMeta(firstQuestion: string): Promise<{ title: string; theme: string }> {
  const fallback = {
    title: firstQuestion.trim().replace(/\s+/g, " ").slice(0, 50) || "Nouvelle discussion",
    theme: THEME_OTHER,
  };
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return fallback;
  const prompt =
    `Question d'une praticienne en naturopathie : « ${firstQuestion.slice(0, 500)} »\n` +
    `Donne un titre court (3 à 6 mots, sans guillemets) et LA thématique la plus adaptée, ` +
    `choisie STRICTEMENT dans cette liste : ${ASSISTANT_THEMES.join(" | ")}.\n` +
    `Réponds uniquement en JSON compact : {"title":"...","theme":"..."}`;
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80, temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return fallback;
    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);
    const title = String(parsed.title || "").trim().slice(0, 80) || fallback.title;
    const theme = ASSISTANT_THEMES.includes(parsed.theme) ? parsed.theme : THEME_OTHER;
    return { title, theme };
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 6: Vérifier types + tests + commit**

```bash
npm run check && npm test
git add server/mistral.ts server/mistral.test.ts
git commit -m "feat(assistant): fiche cliente (clientContext) + génération titre/thème"
```

---

## Task 6 : Routes `discussions.ts` (remplacent `chat.ts`)

**Files:**
- Create: `server/routes/discussions.ts`
- Delete: `server/routes/chat.ts`
- Modify: `server/routes/index.ts:40` et `:139`

- [ ] **Step 1: Écrire `server/routes/discussions.ts`**

```ts
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { streamNaturoAssistant, generateDiscussionMeta, type ChatTurn } from "../mistral";
import { retrieveRelevantChunks } from "../rag";
import type { Client } from "@shared/schema";

const CONTEXT_LIMIT = 30;
const createSchema = z.object({
  clientId: z.number().int().positive().nullable().optional(),
  theme: z.string().max(120).nullable().optional(),
});
const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  theme: z.string().max(120).nullable().optional(),
  clientId: z.number().int().positive().nullable().optional(),
});
const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) });

// Construit le bloc « fiche cliente » injecté dans le contexte (champs santé seulement).
function buildClientContext(c: Client): string {
  const lines: string[] = [];
  lines.push(`- Prénom : ${c.firstName}`);
  if (c.dateOfBirth) {
    const age = Math.floor((Date.now() - new Date(c.dateOfBirth).getTime()) / 3.15576e10);
    if (Number.isFinite(age) && age > 0 && age < 120) lines.push(`- Âge : ${age} ans`);
  }
  if (c.antecedents?.trim()) lines.push(`- Antécédents : ${c.antecedents.trim()}`);
  if (c.allergies?.trim()) lines.push(`- Allergies : ${c.allergies.trim()}`);
  if (c.lifestyleNotes?.trim()) lines.push(`- Hygiène de vie : ${c.lifestyleNotes.trim()}`);
  if (c.penseBete?.trim()) lines.push(`- Notes : ${c.penseBete.trim()}`);
  return `Fiche de la cliente concernée (confidentiel, à prendre en compte) :\n${lines.join("\n")}`;
}

// Vérifie que la discussion existe et appartient à la praticienne.
async function ownDiscussion(req: AuthedRequest, id: number) {
  const d = await storage.getDiscussion(id);
  if (!d || d.userId !== req.userId) return null;
  return d;
}

export function registerDiscussionRoutes(app: Express): void {
  app.get("/api/discussions", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listDiscussions(req.userId!));
  });

  app.post("/api/discussions", requireAuth, async (req: AuthedRequest, res) => {
    const p = createSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    let clientId = p.data.clientId ?? null;
    if (clientId != null) {
      const c = await storage.getClient(clientId);
      if (!c || c.userId !== req.userId) return res.status(403).json({ message: "Cliente introuvable" });
    }
    const disc = await storage.createDiscussion({ userId: req.userId!, clientId, theme: p.data.theme ?? null });
    res.json(disc);
  });

  app.patch("/api/discussions/:id", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    const p = patchSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    if (p.data.clientId != null) {
      const c = await storage.getClient(p.data.clientId);
      if (!c || c.userId !== req.userId) return res.status(403).json({ message: "Cliente introuvable" });
    }
    res.json(await storage.updateDiscussion(d.id, p.data));
  });

  app.delete("/api/discussions/:id", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    await storage.deleteDiscussion(d.id);
    res.json({ ok: true });
  });

  app.get("/api/discussions/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    res.json(await storage.listDiscussionMessages(d.id));
  });

  app.post("/api/discussions/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
    const d = await ownDiscussion(req, Number(req.params.id));
    if (!d) return res.status(404).json({ message: "Discussion introuvable" });
    const p = messageSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    const userMessage = p.data.message;

    const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
    const day = new Date().toISOString().slice(0, 10);
    if ((await storage.incrementAiChatUsage(req.userId!, day)) > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} messages/jour). Réessaie demain.` });
    }

    const prior = await storage.listDiscussionMessages(d.id, CONTEXT_LIMIT);
    const history: ChatTurn[] = prior.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    const isFirstExchange = prior.length === 0;
    const instructions = await storage.getAssistantInstructions();

    let clientContext: string | undefined;
    if (d.clientId != null) {
      const c = await storage.getClient(d.clientId);
      if (c && c.userId === req.userId) clientContext = buildClientContext(c);
    }
    let retrieved: { content: string; documentId: number }[] = [];
    try { retrieved = await retrieveRelevantChunks(userMessage); } catch { retrieved = []; }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    let full = "";
    try {
      for await (const delta of streamNaturoAssistant(history, userMessage, {
        customInstructions: instructions,
        contextChunks: retrieved.map((r) => r.content),
        clientContext,
      })) {
        full += delta;
        res.write(delta);
      }
    } catch (e: any) {
      if (!full) {
        res.statusCode = e?.status === 503 ? 503 : 502;
        return res.end(e?.status === 503
          ? "L'assistant n'est pas encore disponible. Réessaie plus tard."
          : "L'assistant n'a pas pu répondre, réessaie dans un instant.");
      }
    }

    if (retrieved.length) {
      const ids = Array.from(new Set(retrieved.map((r) => r.documentId)));
      const docs = await storage.listKbDocuments();
      const names = ids.map((id) => docs.find((doc) => doc.id === id)?.title).filter(Boolean);
      if (names.length) res.write(`\n@@SOURCES@@:${JSON.stringify(names)}`);
    }

    await storage.createDiscussionMessage({ discussionId: d.id, userId: req.userId!, role: "user", content: userMessage });
    await storage.createDiscussionMessage({ discussionId: d.id, userId: req.userId!, role: "assistant", content: full });
    await storage.touchDiscussion(d.id);
    res.end();

    // Après la réponse : génère titre (+ thème si discussion thématique sans thème).
    if (isFirstExchange) {
      try {
        const meta = await generateDiscussionMeta(userMessage);
        const patch: { title: string; theme?: string } = { title: meta.title };
        if (d.clientId == null && !d.theme) patch.theme = meta.theme;
        await storage.updateDiscussion(d.id, patch);
      } catch { /* best-effort */ }
    }
  });
}
```

> `storage.getClient` existe déjà (utilisé par les routes clients) ; vérifier le nom exact (sinon `getClient`). `storage.getAssistantInstructions` et `storage.listKbDocuments` existent (assistant-admin).

- [ ] **Step 2: Remplacer l'enregistrement dans `index.ts`**

`server/routes/index.ts` : remplacer l.40 `import { registerChatRoutes } from "./chat";` par `import { registerDiscussionRoutes } from "./discussions";` et l.139 `registerChatRoutes(app);` par `registerDiscussionRoutes(app);`.

- [ ] **Step 3: Supprimer l'ancien fichier**

```bash
git rm server/routes/chat.ts
```

- [ ] **Step 4: Vérifier types**

Run: `npm run check`
Expected: OK. Si erreur sur `getClient`, aligner sur le nom réel de la méthode storage (`grep -n "getClient" server/storage.ts`).

- [ ] **Step 5: Commit**

```bash
git add server/routes/discussions.ts server/routes/index.ts
git commit -m "feat(assistant): routes /api/discussions (remplacent /api/chat)"
```

---

## Task 7 : Détacher les discussions à la suppression d'une cliente

**Files:**
- Modify: `server/routes/clients.ts` (handler `DELETE /api/clients/:id`)

- [ ] **Step 1: Localiser la suppression de cliente**

Run: `grep -n "delete.*client\|deleteClient\|api/clients/:id" server/routes/clients.ts`

- [ ] **Step 2: Détacher avant/après suppression**

Dans le handler `DELETE`, juste avant l'appel à `storage.deleteClient(...)`, ajouter :

```ts
    await storage.detachClientFromDiscussions(id); // les discussions deviennent « Non classé », les échanges restent
```

(`id` = identifiant numérique de la cliente déjà résolu dans le handler.)

- [ ] **Step 3: Vérifier types + commit**

```bash
npm run check
git add server/routes/clients.ts
git commit -m "feat(assistant): détacher les discussions quand une cliente est supprimée"
```

---

## Task 8 : Modale « Nouvelle discussion »

**Files:**
- Create: `client/src/components/assistant/NewDiscussionDialog.tsx`

- [ ] **Step 1: Écrire le composant**

Réutilise les primitives shadcn présentes (`Dialog`, `Select`, `Input`, `Button`). Vérifier les chemins exacts (`grep -rn "components/ui/dialog\|components/ui/select" client/src`).

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ASSISTANT_THEMES, THEME_OTHER } from "@shared/assistant-themes";
import type { Client, AiDiscussion } from "@shared/schema";

export function NewDiscussionDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (d: AiDiscussion) => void }) {
  const [mode, setMode] = useState<"client" | "theme">("theme");
  const [clientId, setClientId] = useState<string>("");
  const [theme, setTheme] = useState<string>(ASSISTANT_THEMES[0]);
  const [customTheme, setCustomTheme] = useState("");
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"], enabled: open });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/discussions", body),
    onSuccess: async (res) => {
      const d = (await res.json()) as AiDiscussion;
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] });
      onOpenChange(false);
      onCreated(d);
    },
  });

  function submit() {
    if (mode === "client") {
      if (!clientId) return;
      createMut.mutate({ clientId: Number(clientId) });
    } else {
      const t = theme === THEME_OTHER ? customTheme.trim() : theme;
      createMut.mutate({ theme: t || null });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle discussion</DialogTitle></DialogHeader>
        <div className="flex gap-2 mb-4">
          <Button variant={mode === "theme" ? "default" : "secondary"} onClick={() => setMode("theme")} className="flex-1">Thématique</Button>
          <Button variant={mode === "client" ? "default" : "secondary"} onClick={() => setMode("client")} className="flex-1">Pour une cliente</Button>
        </div>
        {mode === "client" ? (
          <div>
            <Label>Cliente</Label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full border border-border rounded-[12px] h-10 px-3 mt-1" data-testid="select-client">
              <option value="">Choisir…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Thématique</Label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full border border-border rounded-[12px] h-10 px-3" data-testid="select-theme">
              {ASSISTANT_THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {theme === THEME_OTHER && (
              <Input value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} placeholder="Précise la thématique" data-testid="input-custom-theme" />
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={createMut.isPending} className="rounded-[12px]" data-testid="button-create-discussion">Créer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Vérifier types (sera consommé en Task 9 ; pas de commit isolé)**

Run: `npm run check`
Expected: OK (le composant n'est pas encore importé — pas d'erreur).

---

## Task 9 : Réécriture de `Chat.tsx` (layout deux panneaux) + sidebar

**Files:**
- Create: `client/src/components/assistant/DiscussionSidebar.tsx`
- Modify: `client/src/pages/Chat.tsx`
- Modify: `client/src/App.tsx:81` (route param)

- [ ] **Step 1: Route avec paramètre**

`client/src/App.tsx` l.81 — remplacer par :

```tsx
      <Route path="/app/chat/:discussionId?" component={() => <ProtectedRoute><Chat /></ProtectedRoute>} />
```

- [ ] **Step 2: Écrire `DiscussionSidebar.tsx`**

```tsx
import { useMemo } from "react";
import { Link } from "wouter";
import { Plus, User, Tag, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Client, AiDiscussion } from "@shared/schema";

export function DiscussionSidebar({
  discussions, clients, selectedId, onNew, filter, setFilter,
}: {
  discussions: AiDiscussion[]; clients: Client[]; selectedId: number | null;
  onNew: () => void; filter: string; setFilter: (v: string) => void;
}) {
  const clientName = useMemo(() => {
    const m = new Map<number, string>();
    clients.forEach((c) => m.set(c.id, `${c.firstName} ${c.lastName}`));
    return m;
  }, [clients]);

  const f = filter.trim().toLowerCase();
  const match = (d: AiDiscussion) =>
    !f || d.title.toLowerCase().includes(f) || (d.theme || "").toLowerCase().includes(f) ||
    (d.clientId != null && (clientName.get(d.clientId) || "").toLowerCase().includes(f));

  const byClient = new Map<number, AiDiscussion[]>();
  const byTheme = new Map<string, AiDiscussion[]>();
  for (const d of discussions.filter(match)) {
    if (d.clientId != null) {
      if (!byClient.has(d.clientId)) byClient.set(d.clientId, []);
      byClient.get(d.clientId)!.push(d);
    } else {
      const key = d.theme || "Non classé";
      if (!byTheme.has(key)) byTheme.set(key, []);
      byTheme.get(key)!.push(d);
    }
  }

  function item(d: AiDiscussion) {
    const active = d.id === selectedId;
    return (
      <Link key={d.id} href={`/app/chat/${d.id}`} data-testid={`discussion-${d.id}`}
        className={`block truncate text-sm rounded-[10px] px-2 py-1.5 ml-5 ${active ? "bg-secondary text-primary font-medium" : "text-muted-foreground hover:bg-secondary/60"}`}>
        {d.title}
      </Link>
    );
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border flex flex-col gap-4 p-3 overflow-y-auto">
      <Button onClick={onNew} className="rounded-[12px] w-full justify-center" data-testid="button-new-discussion">
        <Plus className="h-4 w-4 mr-1" /> Nouvelle discussion
      </Button>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…"
        className="h-9 rounded-[10px] border border-border px-3 text-sm" data-testid="input-filter-discussions" />

      <div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><User className="h-3.5 w-3.5" /> Par cliente</p>
        {[...byClient.entries()].map(([cid, list]) => (
          <div key={cid} className="mb-1">
            <p className="text-sm font-medium px-1 truncate">{clientName.get(cid) || "Cliente"}</p>
            {list.map(item)}
          </div>
        ))}
        {byClient.size === 0 && <p className="text-xs text-muted-foreground/70 px-1">Aucune</p>}
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Tag className="h-3.5 w-3.5" /> Par thématique</p>
        {[...byTheme.entries()].map(([theme, list]) => (
          <div key={theme} className="mb-1">
            <p className="text-sm font-medium px-1 truncate">{theme}</p>
            {list.map(item)}
          </div>
        ))}
        {byTheme.size === 0 && <p className="text-xs text-muted-foreground/70 px-1">Aucune</p>}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Réécrire `Chat.tsx`**

Le `Bubble` (rendu Markdown + copier) est conservé tel quel. Le corps gère : sélection de discussion via `useParams`, chargement des messages de la discussion sélectionnée, envoi en flux vers `/api/discussions/:id/messages`, en-tête (titre éditable + bandeau RGPD discret + suppression), modale nouvelle discussion.

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Trash2, Sparkles, Info, Copy, Check, Pencil, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { NewDiscussionDialog } from "@/components/assistant/NewDiscussionDialog";
import { DiscussionSidebar } from "@/components/assistant/DiscussionSidebar";
import type { AiChatMessage, AiDiscussion, Client } from "@shared/schema";

// Bubble : composant inchangé — reprendre tel quel l'actuel client/src/pages/Chat.tsx:30-66.

export default function Chat() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, navigate] = useLocation();
  const params = useParams();
  const selectedId = params.discussionId ? Number(params.discussionId) : null;

  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: discussions = [] } = useQuery<AiDiscussion[]>({ queryKey: ["/api/discussions"] });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const selected = discussions.find((d) => d.id === selectedId) || null;
  const { data: messages = [], isLoading } = useQuery<AiChatMessage[]>({
    queryKey: ["/api/discussions", selectedId, "messages"],
    enabled: selectedId != null,
  });

  // Sélection auto de la discussion la plus récente si aucune dans l'URL.
  useEffect(() => {
    if (selectedId == null && discussions.length) navigate(`/app/chat/${discussions[0].id}`);
  }, [selectedId, discussions, navigate]);

  const sendMut = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/discussions/${selectedId}/messages`, { message });
      setStreamText(""); setSources([]);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const sep = acc.indexOf("@@SOURCES@@:");
        if (sep >= 0) {
          try { setSources(JSON.parse(acc.slice(sep + "@@SOURCES@@:".length))); } catch { /* partiel */ }
          setStreamText(acc.slice(0, sep).replace(/\n$/, ""));
        } else setStreamText(acc);
      }
    },
    onSuccess: async () => {
      setPending(null); setStreamText(""); setSources([]);
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions", selectedId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] }); // titre auto + updatedAt
    },
    onError: (e: any) => {
      setPending(null); setStreamText(""); setSources([]);
      toast({ title: "Erreur", description: e?.message || "L'assistant n'a pas pu répondre.", variant: "destructive" });
    },
  });

  const renameMut = useMutation({
    mutationFn: (title: string) => apiRequest("PATCH", `/api/discussions/${selectedId}`, { title }),
    onSuccess: async () => { setEditing(false); await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] }); },
  });
  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/discussions/${selectedId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] });
      navigate("/app/chat");
      toast({ title: "Discussion supprimée", variant: "success" });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, streamText, sources, sendMut.isPending]);

  function submit(text?: string) {
    const t = (text ?? input).trim();
    if (!t || sendMut.isPending || selectedId == null) return;
    setPending(t); setInput(""); sendMut.mutate(t);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }
  async function del() {
    const ok = await confirm({ title: "Supprimer cette discussion ?", description: "Les échanges seront effacés. Action irréversible.", confirmLabel: "Supprimer", destructive: true });
    if (ok) deleteMut.mutate();
  }

  return (
    <AppLayout>
      <PageHeader title="Assistant IA" subtitle="Ton formateur en naturopathie, disponible à tout moment." icon={Sparkles} />

      <div className="rounded-[15px] border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex gap-2 items-start mb-4" data-testid="text-disclaimer-sante">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Cet assistant est à visée <strong>éducative</strong> et ne remplace pas un avis médical. Pour tout problème de santé, oriente la personne vers un professionnel de santé.</span>
      </div>

      <div className="card-naturo flex h-[calc(100vh-22rem)] min-h-[460px] !p-0 overflow-hidden">
        <DiscussionSidebar discussions={discussions} clients={clients} selectedId={selectedId}
          onNew={() => setDialogOpen(true)} filter={filter} setFilter={setFilter} />

        <div className="flex-1 flex flex-col min-w-0">
          {selected && (
            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <Input autoFocus defaultValue={selected.title} onBlur={(e) => renameMut.mutate(e.target.value.trim() || selected.title)}
                    onKeyDown={(e) => { if (e.key === "Enter") renameMut.mutate((e.target as HTMLInputElement).value.trim() || selected.title); }}
                    className="h-8" data-testid="input-rename-discussion" />
                ) : (
                  <p className="font-semibold text-heading truncate flex items-center gap-1.5">
                    {selected.title}
                    <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary" aria-label="Renommer" data-testid="button-rename"><Pencil className="h-3.5 w-3.5" /></button>
                  </p>
                )}
                {selected.clientId != null && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5" data-testid="text-rgpd-banner">
                    <ShieldCheck className="h-3 w-3" /> Fiche cliente prise en compte
                  </p>
                )}
              </div>
              <button onClick={del} className="text-muted-foreground hover:text-destructive" aria-label="Supprimer" data-testid="button-delete-discussion"><Trash2 className="h-4 w-4" /></button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {selectedId == null ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                <Sparkles className="h-8 w-8 text-primary" />
                <p className="font-semibold text-heading">Choisis ou démarre une discussion</p>
                <Button onClick={() => setDialogOpen(true)} className="rounded-[12px] mt-2">Nouvelle discussion</Button>
              </div>
            ) : isLoading ? <Loading /> : (
              <>
                {messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)}
                {pending && <Bubble role="user" content={pending} />}
                {sendMut.isPending && (
                  <div>
                    <Bubble role="assistant" content={streamText || "…"} typing={!streamText} />
                    {sources.length > 0 && <p className="text-xs text-muted-foreground mt-1 ml-1" data-testid="text-sources">Sources : {sources.join(", ")}</p>}
                  </div>
                )}
              </>
            )}
          </div>

          {selectedId != null && (
            <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Écris ta question…" className="resize-none min-h-[44px] max-h-32" rows={1} data-testid="input-chat-message" />
              <Button onClick={() => submit()} disabled={!input.trim() || sendMut.isPending} className="rounded-[12px] shrink-0" data-testid="button-send-message"><Send className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      </div>

      <NewDiscussionDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(d) => navigate(`/app/chat/${d.id}`)} />
    </AppLayout>
  );
}
```

- [ ] **Step 4: Vérifier types + build front**

Run: `npm run check`
Expected: OK. Corriger les chemins d'import shadcn si nécessaire (`grep -rn "ui/dialog\|ui/select" client/src/components/ui`).

- [ ] **Step 5: Vérifier en aperçu**

Lancer l'aperçu (`naturo-dev`), se connecter (cf. session précédente : passer un user en admin/owner), créer une discussion thématique et une discussion cliente, vérifier le rendu deux panneaux, l'envoi, le bandeau RGPD discret. Corriger le cas échéant.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Chat.tsx client/src/components/assistant/ client/src/App.tsx
git commit -m "feat(assistant): page chat en discussions (sidebar cliente/thématique)"
```

---

## Task 10 : Intégration page cliente

**Files:**
- Modify: `client/src/pages/ClientDetail.tsx`

- [ ] **Step 1: Charger les discussions de la cliente**

Dans `ClientDetail.tsx`, ajouter près des autres `useQuery` (l.43-46) :

```tsx
  const { data: allDiscussions = [] } = useQuery<AiDiscussion[]>({ queryKey: ["/api/discussions"] });
  const clientDiscussions = allDiscussions.filter((d) => d.clientId === Number(cid));
```

Ajouter l'import de type : `import type { AiDiscussion } from "@shared/schema";` et `useMutation`, `apiRequest`, `useLocation` (Wouter) si absents.

- [ ] **Step 2: Mutation « Demander à l'assistant »**

```tsx
  const [, navigate] = useLocation();
  const askMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/discussions", { clientId: Number(cid) }),
    onSuccess: async (res) => {
      const d = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] });
      navigate(`/app/chat/${d.id}`);
    },
  });
```

- [ ] **Step 3: Ajouter la section dans le JSX**

Insérer une carte (même style que les autres sections `card-naturo`) après une section existante (ex. après les notes) :

```tsx
        <div className="card-naturo">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-heading">Discussions avec l'assistant</h2>
            <Button size="sm" onClick={() => askMut.mutate()} disabled={askMut.isPending} className="rounded-[12px]" data-testid="button-ask-assistant">
              <Sparkles className="h-4 w-4 mr-1" /> Demander à l'assistant
            </Button>
          </div>
          {clientDiscussions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune discussion pour cette cliente.</p>
          ) : (
            <ul className="divide-y divide-border">
              {clientDiscussions.map((d) => (
                <li key={d.id}>
                  <Link href={`/app/chat/${d.id}`} className="flex items-center justify-between py-2 hover:text-primary" data-testid={`client-discussion-${d.id}`}>
                    <span className="text-sm font-medium truncate">{d.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(d.updatedAt).toLocaleDateString("fr-FR")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
```

Ajouter l'import de l'icône `Sparkles` (lucide-react) et de `Link` (wouter) s'ils ne sont pas déjà importés dans le fichier.

- [ ] **Step 4: Vérifier types + aperçu + commit**

```bash
npm run check
# Aperçu : ouvrir une fiche cliente, vérifier la section + le bouton qui ouvre une discussion rattachée.
git add client/src/pages/ClientDetail.tsx
git commit -m "feat(assistant): section discussions IA sur la fiche cliente"
```

---

## Task 11 : Vérification, build, déploiement

**Files:** aucun (ops)

- [ ] **Step 1: Suite complète**

Run: `npm run check && npm test`
Expected: `tsc` OK ; tous les tests PASS (dont drift `aiDiscussions` + `clientContext`).

- [ ] **Step 2: Parcours E2E en aperçu**

- Discussion thématique → titre + thème auto après 1ʳᵉ réponse.
- Discussion cliente (depuis la fiche) → bandeau « Fiche cliente prise en compte », réponse personnalisée.
- Renommer, supprimer, filtrer, naviguer entre discussions.
- Vérifier que le fil legacy est devenu « Discussion générale ».

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/index.cjs` + `dist/public/` régénérés sans erreur.

- [ ] **Step 4: Déploiement prod (Hostinger)**

Déployer `dist/index.cjs` + `dist/public/` via SSH (cf. procédure session précédente : backup `.bak.before-discussions`, upload, `touch tmp/restart.txt`). Au boot, `migrationsReady` applique le DDL (`CREATE TABLE ai_discussions`, `ALTER ... ADD discussion_id`) puis le backfill du fil existant.

- [ ] **Step 5: Vérification prod**

- Confirmer que la home sert le nouveau bundle.
- Vérifier en base : `ai_discussions` créée, `ai_chat_messages.discussion_id` rempli pour les messages legacy, une discussion « Discussion générale » par praticienne ayant un historique.
- Tester une discussion cliente de bout en bout (réponse + bandeau).

- [ ] **Step 6: Commit final éventuel + mémoire**

Mettre à jour la mémoire projet (`assistant-ia-mistral.md`) : assistant passé en discussions multiples (cliente/thématique), fiche injectée, routes `/api/discussions`.

---

## Notes de cohérence (résolues à la rédaction)

- Noms storage alignés : `createDiscussion`, `updateDiscussion`, `touchDiscussion`, `deleteDiscussion`, `listDiscussionMessages`, `createDiscussionMessage`, `detachClientFromDiscussions` (mêmes signatures en Task 4, Task 6, Task 7).
- `buildClientContext` n'utilise que les champs santé (`firstName, dateOfBirth, antecedents, allergies, lifestyleNotes, penseBete`) — jamais `email/phone/address`.
- `generateDiscussionMeta` retourne toujours un `theme` valide de `ASSISTANT_THEMES` ou `THEME_OTHER` ; n'est appliqué au thème que pour les discussions thématiques sans thème.
- Le marqueur de sources reste `@@SOURCES@@:` (pas de NUL), identique au parsing client conservé.
- Getter cliente confirmé : `storage.getClient(id)` (`server/storage.ts:909`) — utilisé en Task 6 (POST/PATCH/messages).
- `storage.getAssistantInstructions()` (`:1442`) et `storage.listKbDocuments()` confirmés ; `client/src/components/ui/dialog.tsx` et `select.tsx` présents.
