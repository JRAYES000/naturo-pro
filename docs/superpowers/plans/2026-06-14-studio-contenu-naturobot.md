# Studio Contenu NaturoBot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Studio Contenu" mode to NaturoBot that writes ready-to-publish Instagram/Facebook content for naturopathy practitioners (with their booking link + compliance baked in), plus a "Inspiré de tes clientes" idea engine and a "Mes contenus" library.

**Architecture:** Reuses the existing Mistral + RAG + streaming pipeline. A new pure module `server/social-content.ts` (marketing persona prompt, format templates, CTA builder, theme ranking) mirrors `server/mistral.ts`. A new `server/routes/content.ts` exposes generation (SSE-style plain-text stream), idea sources, angle suggestions, and a `content_posts` CRUD. The frontend adds a `StudioContenu` page reachable via a NaturoBot tab bar, with a "Créer" tab and a "Mes contenus" library tab.

**Tech Stack:** Node + Express + TypeScript, Drizzle (SQLite dev / MySQL prod), Mistral REST, React 18 + Vite + Wouter (hash routing) + TanStack Query v5 + shadcn/ui + Tailwind. Tests: `node:test` via `tsx --test`.

**Spec:** [docs/superpowers/specs/2026-06-14-studio-contenu-naturobot-design.md](../specs/2026-06-14-studio-contenu-naturobot-design.md)

---

## File Structure

**New files**
- `server/social-content.ts` — pure marketing helpers + content streaming + angle suggestions.
- `server/social-content.test.ts` — unit tests for the pure helpers.
- `server/routes/content.ts` — `registerContentRoutes(app)`.
- `client/src/components/assistant/NaturobotTabs.tsx` — shared Discussion ↔ Studio tab bar.
- `client/src/pages/StudioContenu.tsx` — the Studio page (Créer + Mes contenus tabs).

**Modified files**
- `shared/schema.ts` — add `contentPosts` table + `marketingTone`/`marketingAudience` on `users`.
- `shared/schema-mysql.ts` — same, MySQL idioms.
- `shared/schema-active.ts` — re-export `contentPosts` + insert schema + types.
- `shared/schema-drift.test.ts` — add `contentPosts` to `TABLE_PAIRS`.
- `server/storage.ts` — CREATE TABLE / migrations + CRUD + `getClientThemeStats` + `updateUserMarketing`.
- `server/mistral.ts` — extract `streamCompletion(messages)` and delegate `streamNaturoAssistant` to it.
- `server/routes/index.ts` — import + register the content router.
- `client/src/App.tsx` — add `/app/studio-contenu` route.
- `client/src/pages/Chat.tsx` — render `<NaturobotTabs />` under the header.

**Dependency order:** Task 1 → 2 ; Task 3 → 4 ; Tasks 2+4 → 5 ; Task 5 → 6 → 7 → 8 → 9. (Tasks 1/2 and 3/4 are two independent backend chains that converge at Task 5.)

---

## Task 1: Schema — `content_posts` table + `users` marketing columns

**Files:**
- Modify: `shared/schema.ts`
- Modify: `shared/schema-mysql.ts`
- Modify: `shared/schema-active.ts`
- Modify: `shared/schema-drift.test.ts`

- [ ] **Step 1: Add the `contentPosts` table + marketing columns to SQLite schema**

In `shared/schema.ts`, add these two lines **inside the `users` sqliteTable definition** (next to the other optional text columns, e.g. right after `websiteUrl`):

```typescript
  marketingTone: text("marketing_tone"),
  marketingAudience: text("marketing_audience"),
```

Then add a new table near the `aiDiscussions` definition:

```typescript
export const contentPosts = sqliteTable("content_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  channel: text("channel").notNull(),       // 'instagram' | 'facebook'
  format: text("format").notNull(),         // 'carrousel' | 'reel' | 'story' | 'post_groupe' | 'legende'
  theme: text("theme"),                      // thème ou sujet libre
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("brouillon"), // 'brouillon' | 'a_publier' | 'publie'
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  publishedAt: integer("published_at"),
});
```

Near the existing `insertAiChatMessageSchema` / type exports, add:

```typescript
export const insertContentPostSchema = createInsertSchema(contentPosts).omit({ id: true, createdAt: true, updatedAt: true });
export type ContentPost = typeof contentPosts.$inferSelect;
export type InsertContentPost = z.infer<typeof insertContentPostSchema>;
```

- [ ] **Step 2: Add the MySQL equivalents**

In `shared/schema-mysql.ts`, add to the `users` mysqlTable (next to `websiteUrl`):

```typescript
  marketingTone: varchar("marketing_tone", { length: 64 }),
  marketingAudience: varchar("marketing_audience", { length: 255 }),
```

And the table (near `aiDiscussions`):

```typescript
export const contentPosts = mysqlTable("content_posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  channel: varchar("channel", { length: 32 }).notNull(),
  format: varchar("format", { length: 32 }).notNull(),
  theme: varchar("theme", { length: 200 }),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("brouillon"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  publishedAt: bigint("published_at", { mode: "number" }),
});
```

- [ ] **Step 3: Re-export from `schema-active.ts`**

In `shared/schema-active.ts`, add next to the other table re-exports:

```typescript
export const contentPosts = activeSchema.contentPosts;
```

next to the Zod re-exports:

```typescript
export const insertContentPostSchema = activeSchema.insertContentPostSchema;
```

and inside the `export type { ... } from "./schema";` block, add:

```typescript
  ContentPost, InsertContentPost,
```

- [ ] **Step 4: Add the table to the drift parity test**

In `shared/schema-drift.test.ts`, add this entry to the `TABLE_PAIRS` array (it uses the `sqlite.*` / `mysql.*` namespace imports):

```typescript
  ["contentPosts", sqlite.contentPosts, mysql.contentPosts],
```

- [ ] **Step 5: Run the drift test + typecheck**

Run: `npm test`
Expected: PASS — including `drift — colonnes de la table "contentPosts" identiques SQLite↔MySQL` and the existing `users` drift test (the two new columns exist on both sides).

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 6: Commit (folds in the design spec, per Julien's "no separate doc commit" preference)**

```bash
git add shared/schema.ts shared/schema-mysql.ts shared/schema-active.ts shared/schema-drift.test.ts docs/superpowers/specs/2026-06-14-studio-contenu-naturobot-design.md docs/superpowers/plans/2026-06-14-studio-contenu-naturobot.md
git commit -m "feat(studio-contenu): schéma content_posts + champs voix marketing"
```

---

## Task 2: Storage — CREATE TABLE / migrations + CRUD + theme stats

**Files:**
- Modify: `server/storage.ts`

> Note: `getClientThemeStats` delegates ranking to the pure `rankThemes` helper created in Task 3. To keep tasks independently committable, this task imports `rankThemes`; if Task 3 is not yet done, temporarily inline the ranking (filter non-empty theme, sort by count desc, slice 5). The plan assumes Task 3 lands close behind. Prefer doing Task 3 before Task 2's Step 5 typecheck if executing strictly in order isn't required.

- [ ] **Step 1: Create the SQLite table at startup**

In `server/storage.ts`, inside the `raw.exec(\`...\`)` block that holds the `CREATE TABLE IF NOT EXISTS ...` statements (the SQLite branch, near the `ai_chat_usage` table), add:

```sql
    CREATE TABLE IF NOT EXISTS content_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      format TEXT NOT NULL,
      theme TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'brouillon',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      published_at INTEGER
    );
```

- [ ] **Step 2: Best-effort ALTER for the `users` marketing columns (SQLite)**

In the same SQLite branch, after the `raw.exec(...)` block (alongside the existing best-effort `ALTER TABLE ... ADD COLUMN` loops), add:

```typescript
  for (const col of ["marketing_tone TEXT", "marketing_audience TEXT"]) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* déjà présent */ }
  }
```

- [ ] **Step 3: MySQL migrations**

In `runMysqlMigrations()`, add these entries to the DDL array:

```typescript
    `CREATE TABLE IF NOT EXISTS content_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      channel VARCHAR(32) NOT NULL,
      format VARCHAR(32) NOT NULL,
      theme VARCHAR(200) NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'brouillon',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      published_at BIGINT NULL
    )`,
    "ALTER TABLE users ADD COLUMN marketing_tone VARCHAR(64) NULL",
    "ALTER TABLE users ADD COLUMN marketing_audience VARCHAR(255) NULL",
```

- [ ] **Step 4: Imports + IStorage interface + implementation**

At the top of `server/storage.ts`, ensure `contentPosts` and the types are imported from the active schema (extend the existing schema import) and add the `rankThemes` import:

```typescript
import { contentPosts, type ContentPost } from "@shared/schema-active";
import { rankThemes } from "./social-content";
```

> The drizzle operators `eq, and, gte, desc, sql` are already imported at the top of the file (`import { eq, and, gte, lte, desc, like, or, sql, isNull } from "drizzle-orm";`). `users` and `aiDiscussions` are already imported.

Add to the `IStorage` interface (near the other AI methods):

```typescript
  // Studio contenu
  createContentPost(d: { userId: number; channel: string; format: string; theme: string | null; title: string; body: string }): Promise<ContentPost>;
  listContentPosts(userId: number, status?: string): Promise<ContentPost[]>;
  getContentPost(id: number): Promise<ContentPost | undefined>;
  updateContentPost(id: number, patch: { body?: string; status?: string }): Promise<ContentPost | undefined>;
  deleteContentPost(id: number): Promise<void>;
  getClientThemeStats(userId: number, sinceMs: number): Promise<Array<{ theme: string; count: number }>>;
  updateUserMarketing(userId: number, patch: { marketingTone: string | null; marketingAudience: string | null }): Promise<void>;
```

Add the implementations to the storage class (near the discussion methods), using the existing `dbInsertReturning` / `dbUpdateReturning` / `first` helpers:

```typescript
  async createContentPost(d: { userId: number; channel: string; format: string; theme: string | null; title: string; body: string }): Promise<ContentPost> {
    const now = Date.now();
    return dbInsertReturning<ContentPost>(contentPosts, {
      userId: d.userId, channel: d.channel, format: d.format, theme: d.theme,
      title: d.title, body: d.body, status: "brouillon",
      createdAt: now, updatedAt: now, publishedAt: null,
    });
  }

  async listContentPosts(userId: number, status?: string): Promise<ContentPost[]> {
    const where = status
      ? and(eq(contentPosts.userId, userId), eq(contentPosts.status, status))
      : eq(contentPosts.userId, userId);
    return db.select().from(contentPosts).where(where)
      .orderBy(desc(contentPosts.updatedAt), desc(contentPosts.id));
  }

  async getContentPost(id: number): Promise<ContentPost | undefined> {
    return first(db.select().from(contentPosts).where(eq(contentPosts.id, id)));
  }

  async updateContentPost(id: number, patch: { body?: string; status?: string }): Promise<ContentPost | undefined> {
    const set: any = { updatedAt: Date.now() };
    if (patch.body !== undefined) set.body = patch.body;
    if (patch.status !== undefined) {
      set.status = patch.status;
      if (patch.status === "publie") set.publishedAt = Date.now();
    }
    return dbUpdateReturning<ContentPost>(contentPosts, id, set);
  }

  async deleteContentPost(id: number): Promise<void> {
    await db.delete(contentPosts).where(eq(contentPosts.id, id));
  }

  async getClientThemeStats(userId: number, sinceMs: number): Promise<Array<{ theme: string; count: number }>> {
    const rows = await db
      .select({ theme: aiDiscussions.theme, count: sql<number>`count(*)` })
      .from(aiDiscussions)
      .where(and(eq(aiDiscussions.userId, userId), gte(aiDiscussions.createdAt, sinceMs)))
      .groupBy(aiDiscussions.theme);
    return rankThemes(rows as Array<{ theme: string | null; count: number }>);
  }

  async updateUserMarketing(userId: number, patch: { marketingTone: string | null; marketingAudience: string | null }): Promise<void> {
    await db.update(users).set({ marketingTone: patch.marketingTone, marketingAudience: patch.marketingAudience }).where(eq(users.id, userId));
  }
```

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: no type errors. (If `rankThemes` is missing because Task 3 isn't done yet, do Task 3 first, then re-run.)

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "feat(studio-contenu): storage content_posts + stats thèmes + voix"
```

---

## Task 3: `server/social-content.ts` — pure helpers (TDD)

**Files:**
- Create: `server/social-content.ts`
- Test: `server/social-content.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/social-content.test.ts`:

```typescript
/**
 * Tests unitaires — server/social-content.ts (helpers purs du Studio contenu).
 * Aucun appel réseau. Runner : node:test (`npm test`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_SYSTEM_PROMPT, FORMAT_TEMPLATES, buildBookingCta, buildContentMessages,
  rankThemes, buildAnglesPrompt, type ContentFormat,
} from "./social-content";

test("FORMAT_TEMPLATES — les 5 formats sont définis et non vides", () => {
  const formats: ContentFormat[] = ["carrousel", "reel", "story", "post_groupe", "legende"];
  for (const f of formats) assert.ok(FORMAT_TEMPLATES[f] && FORMAT_TEMPLATES[f].length > 10);
});

test("buildBookingCta — slug + page active → contient l'URL /p/{slug}", () => {
  const cta = buildBookingCta({ slug: "marie-dupont", publicPageEnabled: true });
  assert.ok(cta.includes("/p/marie-dupont"));
});

test("buildBookingCta — page désactivée → repli sans lien inventé", () => {
  const cta = buildBookingCta({ slug: "marie-dupont", publicPageEnabled: false });
  assert.ok(!cta.includes("/p/marie-dupont"));
  assert.ok(/page publique/i.test(cta));
});

test("buildContentMessages — system en 1er, persona + voix + format + CTA présents", () => {
  const msgs = buildContentMessages({
    channel: "instagram", format: "carrousel", topic: "Sommeil",
    voice: { name: "Marie", specialties: '["Sommeil","Stress"]', city: "Lyon", marketingTone: null, marketingAudience: null, slug: "marie", publicPageEnabled: true },
  });
  assert.equal(msgs[0].role, "system");
  assert.ok(msgs[0].content.includes(CONTENT_SYSTEM_PROMPT.slice(0, 30)));
  assert.ok(msgs[0].content.includes("Marie"));
  assert.ok(msgs[0].content.includes("Sommeil, Stress"));      // spécialités jointes
  assert.ok(msgs[0].content.includes("CARROUSEL"));            // template format
  assert.ok(msgs[0].content.includes("/p/marie"));            // CTA lien
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, "user");
  assert.ok(last.content.includes("Sommeil"));
  assert.ok(last.content.includes("Instagram"));
});

test("buildContentMessages — injecte les extraits RAG quand fournis", () => {
  const msgs = buildContentMessages({
    channel: "facebook", format: "legende", topic: "Détox",
    voice: { name: "Marie", specialties: "[]", city: null, marketingTone: null, marketingAudience: null, slug: "marie", publicPageEnabled: true },
    contextChunks: ["le foie est un émonctoire"],
  });
  assert.ok(msgs[0].content.includes("le foie est un émonctoire"));
});

test("rankThemes — filtre les vides, trie décroissant, limite à 5", () => {
  const ranked = rankThemes([
    { theme: "Sommeil", count: 3 },
    { theme: null, count: 99 },
    { theme: "  ", count: 50 },
    { theme: "Digestion", count: 7 },
    { theme: "Stress", count: 1 },
  ]);
  assert.deepEqual(ranked.map((r) => r.theme), ["Digestion", "Sommeil", "Stress"]);
});

test("buildAnglesPrompt — mentionne les thèmes et demande du JSON", () => {
  const p = buildAnglesPrompt(["Sommeil", "Stress"], { name: "Marie" });
  assert.ok(p.includes("Sommeil"));
  assert.ok(p.includes("Stress"));
  assert.ok(/json/i.test(p));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx cross-env DB_DRIVER=sqlite tsx --test "server/social-content.test.ts"`
Expected: FAIL — `Cannot find module './social-content'`.

- [ ] **Step 3: Implement `server/social-content.ts`**

```typescript
/**
 * server/social-content.ts — Studio contenu : persona marketing + templates de
 * formats + construction du CTA/lien de réservation + classement des thèmes.
 *
 * Le streaming réutilise la mécanique de server/mistral.ts (streamCompletion).
 * Fonctions PURES testées : buildContentMessages, buildBookingCta, rankThemes,
 * buildAnglesPrompt, FORMAT_TEMPLATES.
 */
import { streamCompletion, MISTRAL_MODEL } from "./mistral";

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

/** Construit les messages Mistral pour la génération de contenu. Fonction PURE. */
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

/** Génère 5 angles via un appel Mistral court (non-stream). Repli déterministe si indispo. */
export async function suggestContentAngles(themes: string[], voice: { name: string }): Promise<Angle[]> {
  const fallback: Angle[] = themes.slice(0, 5).map((t) => ({
    title: `Idée de post : ${t}`,
    hook: `Et si on parlait de ${t.toLowerCase()} ?`,
    suggestedFormat: "carrousel",
  }));
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || themes.length === 0) return fallback;
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
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
```

> This file imports `streamCompletion` and `MISTRAL_MODEL` from `./mistral`. `streamCompletion` is added in Task 4. If executing Task 3 before Task 4, the typecheck in Step 5 will fail on that import — do Task 4's Step 1 first, or run Task 4 immediately after. The unit tests in this task do **not** touch `streamContentStudio`/`suggestContentAngles`, so they pass independently.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx cross-env DB_DRIVER=sqlite tsx --test "server/social-content.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/social-content.ts server/social-content.test.ts
git commit -m "feat(studio-contenu): helpers purs (persona, formats, CTA, thèmes) + tests"
```

---

## Task 4: `server/mistral.ts` — extract `streamCompletion` + content angle fallback test

**Files:**
- Modify: `server/mistral.ts`
- Test: `server/social-content.test.ts` (add one fallback test)

- [ ] **Step 1: Extract `streamCompletion` and delegate `streamNaturoAssistant` to it**

In `server/mistral.ts`, **replace** the body of `streamNaturoAssistant` (the segment/continuation loop) so it builds the messages then delegates. Add a new exported `streamCompletion` holding the moved loop **verbatim**:

```typescript
/**
 * Stream une complétion Mistral à partir de messages déjà construits, avec
 * CONTINUATION AUTOMATIQUE si la réponse est coupée par la limite de tokens.
 * Erreur `.status` (503 clé absente, 502 échec) propagée seulement si le tout
 * premier segment échoue ; au-delà, on conserve le texte déjà produit.
 */
export async function* streamCompletion(
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    const e: any = new Error("MISTRAL_API_KEY manquante");
    e.status = 503;
    throw e;
  }
  const msgs = [...messages];
  for (let seg = 0; seg < MAX_SEGMENTS; seg++) {
    const gen = streamMistralSegment(msgs, apiKey);
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
      if (seg === 0) throw e;
      return;
    }
    if (finishReason !== "length" || seg >= MAX_SEGMENTS - 1) return;
    msgs.push({ role: "assistant", content: segText });
    msgs.push({ role: "user", content: CONTINUE_NUDGE });
  }
}

export async function* streamNaturoAssistant(
  history: ChatTurn[],
  userMessage: string,
  opts?: { customInstructions?: string; contextChunks?: string[]; clientContext?: string },
): AsyncGenerator<string, void, unknown> {
  const messages = buildMistralMessages(history, userMessage, opts);
  yield* streamCompletion(messages);
}
```

> The moved loop is identical to the previous `streamNaturoAssistant` body (same `MAX_SEGMENTS`, `streamMistralSegment`, `CONTINUE_NUDGE`). No behavioral change for the existing assistant.

- [ ] **Step 2: Add a fallback test for `suggestContentAngles`**

Append to `server/social-content.test.ts`:

```typescript
test("suggestContentAngles — repli déterministe sans clé API", async () => {
  const prev = process.env.MISTRAL_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  try {
    const { suggestContentAngles } = await import("./social-content");
    const angles = await suggestContentAngles(["Sommeil", "Digestion"], { name: "Marie" });
    assert.equal(angles.length, 2);
    assert.equal(angles[0].suggestedFormat, "carrousel");
    assert.ok(angles[0].title.includes("Sommeil"));
  } finally {
    if (prev !== undefined) process.env.MISTRAL_API_KEY = prev;
  }
});
```

- [ ] **Step 3: Run tests + existing mistral tests + typecheck**

Run: `npm test`
Expected: PASS — existing `mistral.test.ts` (buildMistralMessages unchanged) + all `social-content.test.ts` (8 tests now).

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add server/mistral.ts server/social-content.test.ts
git commit -m "refactor(mistral): extraire streamCompletion réutilisable + test repli angles"
```

---

## Task 5: `server/routes/content.ts` + register

**Files:**
- Create: `server/routes/content.ts`
- Modify: `server/routes/index.ts`

- [ ] **Step 1: Create the router**

Create `server/routes/content.ts`:

```typescript
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { ASSISTANT_THEMES, THEME_OTHER } from "@shared/assistant-themes";
import { retrieveRelevantChunks } from "../rag";
import { streamContentStudio, suggestContentAngles, type Channel, type ContentFormat } from "../social-content";

const CHANNELS = ["instagram", "facebook"] as const;
const FORMATS = ["carrousel", "reel", "story", "post_groupe", "legende"] as const;
const THEME_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const generateSchema = z.object({
  channel: z.enum(CHANNELS),
  format: z.enum(FORMATS),
  topicType: z.enum(["client_theme", "theme", "libre"]),
  topic: z.string().trim().min(1).max(200),
});
const suggestSchema = z.object({ themes: z.array(z.string().min(1).max(120)).min(1).max(10) });
const savePostSchema = z.object({
  channel: z.enum(CHANNELS),
  format: z.enum(FORMATS),
  theme: z.string().max(200).nullable().optional(),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
});
const patchPostSchema = z.object({
  body: z.string().min(1).optional(),
  status: z.enum(["brouillon", "a_publier", "publie"]).optional(),
});
const profileSchema = z.object({
  marketingTone: z.string().max(64).nullable().optional(),
  marketingAudience: z.string().max(255).nullable().optional(),
});

export function registerContentRoutes(app: Express): void {
  // Sources d'idées : thèmes réels des clientes (agrégés) + thèmes prédéfinis.
  app.get("/api/content/idea-sources", requireAuth, async (req: AuthedRequest, res) => {
    const clientThemes = await storage.getClientThemeStats(req.userId!, Date.now() - THEME_WINDOW_MS);
    res.json({ clientThemes, predefinedThemes: ASSISTANT_THEMES.filter((t) => t !== THEME_OTHER) });
  });

  // Suggestions d'angles (Feature 2).
  app.post("/api/content/suggest", requireAuth, async (req: AuthedRequest, res) => {
    const p = suggestSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(404).json({ message: "Compte introuvable" });
    res.json({ angles: await suggestContentAngles(p.data.themes, { name: user.name }) });
  });

  // Génération streamée d'un contenu (plain-text stream, comme les discussions).
  app.post("/api/content/generate", requireAuth, async (req: AuthedRequest, res) => {
    const p = generateSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    const { channel, format, topic } = p.data;

    const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
    const day = new Date().toISOString().slice(0, 10);
    if ((await storage.incrementAiChatUsage(req.userId!, day)) > AI_DAILY_LIMIT) {
      return res.status(429).json({ message: `Limite quotidienne atteinte (${AI_DAILY_LIMIT} générations/jour). Réessaie demain.` });
    }

    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(404).json({ message: "Compte introuvable" });

    let contextChunks: string[] = [];
    try { contextChunks = (await retrieveRelevantChunks(topic)).map((r) => r.content); } catch { contextChunks = []; }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    let full = "";
    try {
      for await (const delta of streamContentStudio({
        channel: channel as Channel,
        format: format as ContentFormat,
        topic,
        voice: {
          name: user.name, specialties: user.specialties, city: user.city,
          marketingTone: user.marketingTone, marketingAudience: user.marketingAudience,
          slug: user.slug, publicPageEnabled: user.publicPageEnabled,
        },
        contextChunks,
      })) {
        full += delta;
        res.write(delta);
      }
    } catch (e: any) {
      if (!full) {
        res.statusCode = e?.status === 503 ? 503 : 502;
        return res.end(e?.status === 503
          ? "Le studio de contenu n'est pas encore disponible. Réessaie plus tard."
          : "La génération a échoué, réessaie dans un instant.");
      }
    }
    res.end();
  });

  // Bibliothèque « Mes contenus ».
  app.get("/api/content/posts", requireAuth, async (req: AuthedRequest, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(await storage.listContentPosts(req.userId!, status));
  });
  app.post("/api/content/posts", requireAuth, async (req: AuthedRequest, res) => {
    const p = savePostSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    const post = await storage.createContentPost({ userId: req.userId!, ...p.data, theme: p.data.theme ?? null });
    res.json(post);
  });
  app.patch("/api/content/posts/:id", requireAuth, async (req: AuthedRequest, res) => {
    const existing = await storage.getContentPost(Number(req.params.id));
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ message: "Contenu introuvable" });
    const p = patchPostSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    res.json(await storage.updateContentPost(existing.id, p.data));
  });
  app.delete("/api/content/posts/:id", requireAuth, async (req: AuthedRequest, res) => {
    const existing = await storage.getContentPost(Number(req.params.id));
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ message: "Contenu introuvable" });
    await storage.deleteContentPost(existing.id);
    res.json({ ok: true });
  });

  // Profil « Ma voix » (ton + audience).
  app.get("/api/content/profile", requireAuth, async (req: AuthedRequest, res) => {
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(404).json({ message: "Compte introuvable" });
    res.json({ marketingTone: user.marketingTone ?? null, marketingAudience: user.marketingAudience ?? null });
  });
  app.put("/api/content/profile", requireAuth, async (req: AuthedRequest, res) => {
    const p = profileSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: "Données invalides" });
    await storage.updateUserMarketing(req.userId!, {
      marketingTone: p.data.marketingTone ?? null,
      marketingAudience: p.data.marketingAudience ?? null,
    });
    res.json({ ok: true });
  });
}
```

- [ ] **Step 2: Register the router in `index.ts`**

In `server/routes/index.ts`, add to the import block (near `registerDiscussionRoutes`):

```typescript
import { registerContentRoutes } from "./content";
```

and in the registration block (right after `registerDiscussionRoutes(app);`):

```typescript
  registerContentRoutes(app);
```

- [ ] **Step 3: Typecheck + boot smoke**

Run: `npm run check`
Expected: no type errors.

Run: `npm run dev` (let it boot, watch the log)
Expected: server starts with no error; `[db]` logs show `content_posts` created (fresh dev DB) or migration best-effort lines. Stop it after confirming boot (Ctrl+C).

- [ ] **Step 4: Manual endpoint smoke (optional but recommended)**

With the dev server running and logged in (cookie), in another shell:

Run: `curl -s -b "<session-cookie>" http://localhost:5000/api/content/idea-sources`
Expected: JSON `{ "clientThemes": [...], "predefinedThemes": ["Sommeil & insomnie", ...] }` (no `Autre…`).

- [ ] **Step 5: Commit**

```bash
git add server/routes/content.ts server/routes/index.ts
git commit -m "feat(studio-contenu): routes /api/content (génération, idées, bibliothèque, voix)"
```

---

## Task 6: Frontend shell — NaturoBot tabs + Studio route

**Files:**
- Create: `client/src/components/assistant/NaturobotTabs.tsx`
- Modify: `client/src/pages/Chat.tsx`
- Create: `client/src/pages/StudioContenu.tsx` (skeleton)
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create the tab bar**

Create `client/src/components/assistant/NaturobotTabs.tsx`:

```tsx
import { Link, useLocation } from "wouter";
import { MessageCircle, Sparkles } from "lucide-react";

const TABS = [
  { href: "/app/chat", match: "/app/chat", label: "Discussion", icon: MessageCircle, id: "discussion" },
  { href: "/app/studio-contenu", match: "/app/studio-contenu", label: "Studio contenu", icon: Sparkles, id: "studio" },
];

export function NaturobotTabs() {
  const [location] = useLocation();
  return (
    <div className="flex gap-2 mb-4">
      {TABS.map((t) => {
        const active = location.startsWith(t.match);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-bold transition ${
              active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary hover:bg-secondary/70"
            }`}
            data-testid={`tab-naturobot-${t.id}`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render the tab bar in Chat.tsx**

In `client/src/pages/Chat.tsx`, add the import (next to the other `@/components/assistant/...` imports):

```tsx
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
```

Then, in the returned JSX, locate the `<PageHeader ... />` element near the top and insert `<NaturobotTabs />` immediately after it. If Chat has no `<PageHeader>`, insert it as the first child inside the page's top-level container (before the sidebar/main split).

- [ ] **Step 3: Create the Studio page skeleton**

Create `client/src/pages/StudioContenu.tsx`:

```tsx
import { Sparkles } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function StudioContenu() {
  return (
    <AppLayout>
      <PageHeader title="NaturoBot" subtitle="Crée des contenus prêts à publier pour attirer des clientes." icon={Sparkles} />
      <NaturobotTabs />
      <Tabs defaultValue="creer">
        <TabsList className="rounded-[12px]">
          <TabsTrigger value="creer" data-testid="tab-studio-creer">Créer</TabsTrigger>
          <TabsTrigger value="bibliotheque" data-testid="tab-studio-bibliotheque">Mes contenus</TabsTrigger>
        </TabsList>
        <TabsContent value="creer">
          <div className="card-naturo">Bientôt : le générateur de contenu.</div>
        </TabsContent>
        <TabsContent value="bibliotheque">
          <div className="card-naturo">Bientôt : ta bibliothèque de contenus.</div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
```

- [ ] **Step 4: Register the route**

In `client/src/App.tsx`, add the import (next to `import Chat from "@/pages/Chat";`):

```tsx
import StudioContenu from "@/pages/StudioContenu";
```

and add the route right after the chat route (line with `/app/chat/:discussionId?`):

```tsx
      <Route path="/app/studio-contenu" component={() => <ProtectedRoute><StudioContenu /></ProtectedRoute>} />
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, then use the preview workflow:
- Navigate to `/#/app/chat` → confirm the two tabs render, "Discussion" active.
- Click "Studio contenu" → routes to `/#/app/studio-contenu`, "Studio contenu" active, the two inner tabs (Créer / Mes contenus) render.
- Check `preview_console_logs` for errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/assistant/NaturobotTabs.tsx client/src/pages/StudioContenu.tsx client/src/pages/Chat.tsx client/src/App.tsx
git commit -m "feat(studio-contenu): onglets NaturoBot + page Studio (squelette)"
```

---

## Task 7: Frontend — "Créer" tab (generation + streaming + save)

**Files:**
- Modify: `client/src/pages/StudioContenu.tsx`

- [ ] **Step 1: Replace the page with the full "Créer" implementation**

Replace the entire contents of `client/src/pages/StudioContenu.tsx` with (the "Mes contenus" tab still renders a placeholder `<ContentLibrary />` added in Task 8 — here it stays a stub so the file compiles):

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, Copy, Check, Save, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Channel = "instagram" | "facebook";
type ContentFormat = "carrousel" | "reel" | "story" | "post_groupe" | "legende";
type TopicType = "client_theme" | "theme" | "libre";
interface IdeaSources { clientThemes: { theme: string; count: number }[]; predefinedThemes: string[]; }
interface Angle { title: string; hook: string; suggestedFormat: ContentFormat; }

const FORMAT_LABELS: Record<ContentFormat, string> = {
  carrousel: "Carrousel Instagram",
  reel: "Script de Reel",
  story: "Story",
  post_groupe: "Post groupe Facebook",
  legende: "Légende + hashtags",
};

export default function StudioContenu() {
  const { toast } = useToast();
  const [channel, setChannel] = useState<Channel>("instagram");
  const [format, setFormat] = useState<ContentFormat>("carrousel");
  const [topic, setTopic] = useState("");
  const [topicType, setTopicType] = useState<TopicType>("theme");
  const [streamText, setStreamText] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: sources } = useQuery<IdeaSources>({ queryKey: ["/api/content/idea-sources"] });

  const genMut = useMutation({
    mutationFn: async () => {
      setStreamText("");
      const res = await apiRequest("POST", "/api/content/generate", { channel, format, topicType, topic });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setStreamText(acc);
      }
      return acc;
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "La génération a échoué.", variant: "destructive" }),
  });

  const suggestMut = useMutation({
    mutationFn: async (themes: string[]) => {
      const res = await apiRequest("POST", "/api/content/suggest", { themes });
      return (await res.json()).angles as Angle[];
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Impossible de proposer des idées.", variant: "destructive" }),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const title = topic ? `${FORMAT_LABELS[format]} · ${topic}` : FORMAT_LABELS[format];
      const res = await apiRequest("POST", "/api/content/posts", { channel, format, theme: topic || null, title, body: streamText });
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Enregistré", description: "Contenu ajouté à « Mes contenus »." });
      await queryClient.invalidateQueries({ queryKey: ["/api/content/posts"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec de l'enregistrement.", variant: "destructive" }),
  });

  function pickTheme(t: string, type: "client_theme" | "theme") { setTopic(t); setTopicType(type); }
  function pickAngle(a: Angle) { setTopic(a.title); setTopicType("client_theme"); setFormat(a.suggestedFormat); }
  function copyOut() {
    navigator.clipboard.writeText(streamText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <AppLayout>
      <PageHeader title="NaturoBot" subtitle="Crée des contenus prêts à publier pour attirer des clientes." icon={Sparkles} />
      <NaturobotTabs />
      <Tabs defaultValue="creer">
        <TabsList className="rounded-[12px]">
          <TabsTrigger value="creer" data-testid="tab-studio-creer">Créer</TabsTrigger>
          <TabsTrigger value="bibliotheque" data-testid="tab-studio-bibliotheque">Mes contenus</TabsTrigger>
        </TabsList>

        <TabsContent value="creer">
          <div className="grid gap-4 md:grid-cols-[340px_1fr]">
            {/* Réglages */}
            <div className="card-naturo space-y-4">
              <div>
                <p className="text-sm font-bold mb-2">Inspiré de tes clientes</p>
                {sources?.clientThemes?.length ? (
                  <>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {sources.clientThemes.map((t) => (
                        <button key={t.theme} onClick={() => pickTheme(t.theme, "client_theme")}
                          className="px-3 py-1 rounded-full bg-secondary text-primary text-xs font-semibold hover:bg-secondary/70"
                          data-testid={`chip-client-theme-${t.theme}`}>
                          {t.theme} ({t.count})
                        </button>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="rounded-[12px]" disabled={suggestMut.isPending}
                      onClick={() => suggestMut.mutate(sources.clientThemes.map((t) => t.theme))}
                      data-testid="button-suggest-angles">
                      {suggestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Propose-moi 5 idées"}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Quand tu auras quelques échanges clientes, je te dirai tes sujets phares. En attendant, choisis un thème ci-dessous.
                  </p>
                )}
                {suggestMut.data?.length ? (
                  <div className="mt-3 space-y-2">
                    {suggestMut.data.map((a, i) => (
                      <button key={i} onClick={() => pickAngle(a)}
                        className="block w-full text-left p-2 rounded-[10px] border border-border hover:border-primary transition"
                        data-testid={`angle-${i}`}>
                        <span className="text-sm font-semibold">{a.title}</span>
                        <span className="block text-xs text-muted-foreground">{a.hook}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-bold">Thème</label>
                <Select value={topicType === "theme" ? topic : ""} onValueChange={(v) => pickTheme(v, "theme")}>
                  <SelectTrigger data-testid="select-theme"><SelectValue placeholder="Choisir un thème" /></SelectTrigger>
                  <SelectContent>
                    {sources?.predefinedThemes?.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-bold">…ou un sujet libre</label>
                <Input value={topicType === "libre" ? topic : ""} onChange={(e) => { setTopic(e.target.value); setTopicType("libre"); }}
                  placeholder="Ex. magnésium, jeûne intermittent…" data-testid="input-topic" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-bold">Canal</label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                    <SelectTrigger data-testid="select-channel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-bold">Format</label>
                  <Select value={format} onValueChange={(v) => setFormat(v as ContentFormat)}>
                    <SelectTrigger data-testid="select-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FORMAT_LABELS) as ContentFormat[]).map((f) => (
                        <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full rounded-[12px] py-6 font-bold" disabled={!topic.trim() || genMut.isPending}
                onClick={() => genMut.mutate()} data-testid="button-generate-content">
                {genMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Générer
              </Button>
            </div>

            {/* Résultat */}
            <div className="card-naturo min-h-[300px]">
              {streamText ? (
                <>
                  <div className="flex justify-end gap-2 mb-2">
                    <Button variant="outline" size="sm" className="rounded-[12px]" onClick={copyOut} data-testid="button-copy-content">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" className="rounded-[12px]" disabled={saveMut.isPending || genMut.isPending} onClick={() => saveMut.mutate()} data-testid="button-save-content">
                      <Save className="h-4 w-4 mr-1" /> Enregistrer
                    </Button>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Choisis une source d'idée, un canal et un format, puis clique sur « Générer ».</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bibliotheque">
          <div className="card-naturo">Bientôt : ta bibliothèque de contenus.</div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, then via the preview workflow on `/#/app/studio-contenu`:
- Pick a predefined theme (e.g. "Sommeil & insomnie"), keep Instagram + Carrousel, click **Générer**.
- Confirm text streams into the right panel and renders as Markdown.
- Click the copy button (icon flips to a check), then **Enregistrer** (toast "Enregistré").
- Check `preview_console_logs` and `preview_network` (the `/api/content/generate` request streams 200).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/StudioContenu.tsx
git commit -m "feat(studio-contenu): onglet Créer (génération streamée + idées clientes + enregistrer)"
```

---

## Task 8: Frontend — "Mes contenus" library tab

**Files:**
- Modify: `client/src/pages/StudioContenu.tsx`

- [ ] **Step 1: Add the `ContentLibrary` component + extra imports**

In `client/src/pages/StudioContenu.tsx`, extend the lucide import to include `Trash2`:

```tsx
import { Sparkles, Copy, Check, Save, Send, Loader2, Trash2 } from "lucide-react";
```

Add these imports:

```tsx
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/hooks/use-confirm";
```

Add this `ContentPost` type next to the other interfaces:

```tsx
interface ContentPost { id: number; channel: string; format: string; theme: string | null; title: string; body: string; status: string; createdAt: number; updatedAt: number; publishedAt: number | null; }
const STATUS_LABELS: Record<string, string> = { brouillon: "Brouillon", a_publier: "À publier", publie: "Publié" };
```

Append the `ContentLibrary` component at the end of the file:

```tsx
function ContentLibrary() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  const { data: posts = [] } = useQuery<ContentPost[]>({ queryKey: ["/api/content/posts"] });
  const filtered = statusFilter === "all" ? posts : posts.filter((p) => p.status === statusFilter);

  const patchMut = useMutation({
    mutationFn: async (v: { id: number; body?: string; status?: string }) => {
      const res = await apiRequest("PATCH", `/api/content/posts/${v.id}`, { body: v.body, status: v.status });
      return res.json();
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["/api/content/posts"] }); },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec.", variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/content/posts/${id}`),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["/api/content/posts"] }); },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec.", variant: "destructive" }),
  });

  async function remove(id: number) {
    if (await confirm({ title: "Supprimer ce contenu ?", description: "Cette action est définitive.", destructive: true })) delMut.mutate(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {["all", "brouillon", "a_publier", "publie"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}
            data-testid={`filter-${s}`}>
            {s === "all" ? "Tous" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun contenu pour ce filtre.</p>
      ) : filtered.map((p) => (
        <div key={p.id} className="card-naturo" data-testid={`content-post-${p.id}`}>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="min-w-0">
              <span className="font-bold">{p.title}</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-secondary text-primary">{STATUS_LABELS[p.status] || p.status}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="rounded-[12px]" onClick={() => navigator.clipboard.writeText(p.body)} data-testid={`button-copy-${p.id}`}>
                <Copy className="h-4 w-4" />
              </Button>
              {p.status !== "publie" && (
                <Button size="sm" className="rounded-[12px]" onClick={() => patchMut.mutate({ id: p.id, status: "publie" })} data-testid={`button-publish-${p.id}`}>
                  <Check className="h-4 w-4 mr-1" /> Publié
                </Button>
              )}
              <Button variant="outline" size="sm" className="rounded-[12px]" onClick={() => { setEditingId(p.id); setEditBody(p.body); }} data-testid={`button-edit-${p.id}`}>
                Éditer
              </Button>
              <Button variant="destructive" size="sm" className="rounded-[12px]" onClick={() => remove(p.id)} data-testid={`button-delete-${p.id}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {editingId === p.id ? (
            <div className="space-y-2">
              <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} data-testid={`textarea-edit-${p.id}`} />
              <div className="flex gap-2">
                <Button size="sm" className="rounded-[12px]" onClick={() => { patchMut.mutate({ id: p.id, body: editBody }); setEditingId(null); }} data-testid={`button-save-edit-${p.id}`}>Enregistrer</Button>
                <Button size="sm" variant="outline" className="rounded-[12px]" onClick={() => setEditingId(null)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap">{p.body}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Render `<ContentLibrary />` in the "bibliotheque" tab**

Replace the placeholder inside `<TabsContent value="bibliotheque">` with:

```tsx
        <TabsContent value="bibliotheque">
          <ContentLibrary />
        </TabsContent>
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, then via the preview workflow:
- Generate + save a post in "Créer", switch to "Mes contenus" → the post appears (Brouillon).
- Click **Publié** → badge changes to "Publié", the button disappears.
- Filter chips (Tous / Brouillon / À publier / Publié) filter the list.
- **Éditer** → textarea opens, change text, **Enregistrer** → updated body shown.
- **Delete** (trash) → confirm dialog → post removed.
- Check `preview_console_logs` for errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/StudioContenu.tsx
git commit -m "feat(studio-contenu): bibliothèque « Mes contenus » (filtre, édition, publié, suppression)"
```

---

## Task 9 (optional polish): "Ma voix" settings panel

**Files:**
- Modify: `client/src/pages/StudioContenu.tsx`

> The backend (`GET/PUT /api/content/profile`, `updateUserMarketing`) already exists from Tasks 2 & 5. This task only adds a small UI to set tone + audience. Generation already works with sensible defaults when these are null, so this is non-blocking polish.

- [ ] **Step 1: Add a collapsible "Ma voix" panel in the "Créer" tab**

Add this query + mutation inside `StudioContenu` (near the others):

```tsx
  const { data: voice } = useQuery<{ marketingTone: string | null; marketingAudience: string | null }>({ queryKey: ["/api/content/profile"] });
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const voiceMut = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/content/profile", { marketingTone: tone || null, marketingAudience: audience || null }),
    onSuccess: async () => { toast({ title: "Voix enregistrée" }); await queryClient.invalidateQueries({ queryKey: ["/api/content/profile"] }); },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec.", variant: "destructive" }),
  });
```

Add a `useEffect` import (`import { useState, useEffect } from "react";`) and sync the fields when the query loads:

```tsx
  useEffect(() => {
    if (voice) { setTone(voice.marketingTone ?? ""); setAudience(voice.marketingAudience ?? ""); }
  }, [voice]);
```

Add this block at the bottom of the réglages `card-naturo` (after the Générer button):

```tsx
              <details className="pt-2 border-t border-border">
                <summary className="text-sm font-bold cursor-pointer">Ma voix (optionnel)</summary>
                <div className="space-y-2 mt-2">
                  <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Ton (ex. chaleureux & complice)" data-testid="input-tone" />
                  <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audience (ex. femmes 30-50, fatigue & stress)" data-testid="input-audience" />
                  <Button variant="outline" size="sm" className="rounded-[12px]" disabled={voiceMut.isPending} onClick={() => voiceMut.mutate()} data-testid="button-save-voice">
                    Enregistrer ma voix
                  </Button>
                </div>
              </details>
```

- [ ] **Step 2: Typecheck + verify**

Run: `npm run check` → no errors.
Run: `npm run dev` → open the panel, set tone + audience, save (toast), regenerate a post and confirm the tone shifts.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/StudioContenu.tsx
git commit -m "feat(studio-contenu): panneau « Ma voix » (ton + audience)"
```

---

## Final verification (after all tasks)

- [ ] Run `npm test` → all tests pass (mistral + social-content + drift + existing).
- [ ] Run `npm run check` → no type errors.
- [ ] Manual E2E against the 8 spec acceptance criteria (§11 of the spec): tab present; carrousel with `/p/{slug}`; 5 formats; "inspiré de mes clientes" + empty-state fallback; no therapeutic claims on a manual sample; library save/edit/publish/delete; generation succeeds with public page disabled; tests green.
- [ ] (Deploy is at Julien's discretion per CLAUDE.md rule #1 — build with `npm run build`, then ship.)

## Notes & guardrails

- **Compliance is a feature:** the `CONTENT_SYSTEM_PROMPT` forbids therapeutic claims. Spot-check generated samples; if the model slips, tighten the prompt rather than post-filtering.
- **Quota is shared** with the Q&A assistant (`aiChatUsage` / `AI_DAILY_LIMIT`). If generation pushes users over the limit, bump `AI_DAILY_LIMIT` or split counters in a later iteration.
- **No auto-posting / calendar / image generation** in v1 (explicit YAGNI per spec §3).
- **db:push is broken** on this project (known gotcha) — tables are created via the `storage.ts` CREATE TABLE / migration blocks, not drizzle-kit.
