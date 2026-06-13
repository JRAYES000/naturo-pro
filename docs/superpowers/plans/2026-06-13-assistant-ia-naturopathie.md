# Assistant IA Q&A Naturopathie — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un assistant IA « formateur naturopathe » (page `/app/chat`) qui répond aux questions des utilisatrices via l'API Mistral, avec historique persisté en base.

**Architecture:** Page React (Wouter hash) → `POST /api/chat` (Express `requireAuth`) → `server/mistral.ts` (fetch natif vers api.mistral.ai, lit `MISTRAL_API_KEY`) → persistance des messages dans `ai_chat_messages` (storage dual-driver) → réponse. `GET /api/chat` charge l'historique, `DELETE /api/chat` l'efface.

**Tech Stack:** Express 5 + Drizzle (SQLite dev / MySQL prod, 3 schémas) + Zod ; React 18 + Vite + Wouter + TanStack Query v5 + shadcn/ui. **Zéro nouvelle dépendance npm** (fetch natif Node 24). Tests `node:test` via `npm test`.

**Spec de référence :** [docs/superpowers/specs/2026-06-13-assistant-ia-naturopathie-design.md](../specs/2026-06-13-assistant-ia-naturopathie-design.md)

---

## Carte des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `shared/schema.ts` | Modifier | Table `aiChatMessages` (SQLite) + insert schema + types |
| `shared/schema-mysql.ts` | Modifier | Table `aiChatMessages` (MySQL, colonnes identiques) + insert schema + types |
| `shared/schema-active.ts` | Modifier | Re-export de la table, du schéma Zod et des types |
| `shared/schema-drift.test.ts` | Modifier | Ajouter la paire au test anti-divergence |
| `server/storage.ts` | Modifier | `createAiChatMessage`, `listAiChatMessages`, `deleteAiChatMessages` |
| `server/mistral.ts` | Créer | Client Mistral (fetch) + construction des messages + system prompt |
| `server/mistral.test.ts` | Créer | Test unitaire du constructeur de messages |
| `server/routes/chat.ts` | Créer | Routes `GET/POST/DELETE /api/chat` |
| `server/routes/index.ts` | Modifier | Câbler `registerChatRoutes(app)` |
| `client/src/pages/Chat.tsx` | Créer | UI du chat |
| `client/src/App.tsx` | Modifier | Route `/app/chat` |
| `client/src/components/AppLayout.tsx` | Modifier | Entrée de menu « Assistant IA » |
| `.env.example` | Modifier | Variable `MISTRAL_API_KEY` |

> **Note trial-guard :** `POST /api/chat` est une mutation non exemptée → les essais expirés reçoivent automatiquement un `402` (comportement voulu : « tous les comptes connectés » = essai actif + abonnés). Aucun code spécifique requis.

---

## Task 1 : Schéma `ai_chat_messages` (3 fichiers + drift)

**Files:**
- Modify: `shared/schema.ts` (après le bloc `naturalSolutions`, ~ligne 292 ; insert schemas ~ligne 307 ; types ~ligne 337)
- Modify: `shared/schema-mysql.ts` (après `naturalSolutions`, ~ligne 308 ; insert schemas ~ligne 324 ; types ~ligne 356)
- Modify: `shared/schema-active.ts`
- Modify: `shared/schema-drift.test.ts:19-30`
- Add (commit): `docs/superpowers/specs/2026-06-13-assistant-ia-naturopathie-design.md` + `docs/superpowers/plans/2026-06-13-assistant-ia-naturopathie.md`

- [ ] **Step 1 : Table SQLite dans `shared/schema.ts`**

Ajouter, juste après la définition de `naturalSolutions` (après sa `});`, avant le commentaire `// Insert schemas`) :

```typescript
// Assistant IA (Mistral) — conversation continue unique par utilisatrice.
// Une ligne = un message ; "la conversation" = tous les messages d'un userId triés par createdAt.
export const aiChatMessages = sqliteTable("ai_chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});
```

- [ ] **Step 2 : Insert schema + types SQLite dans `shared/schema.ts`**

Dans le bloc `// Insert schemas`, après `insertPackageSchema` :

```typescript
export const insertAiChatMessageSchema = createInsertSchema(aiChatMessages).omit({ id: true, createdAt: true });
```

Dans le bloc `// Types`, après `InsertPackage` :

```typescript
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type InsertAiChatMessage = z.infer<typeof insertAiChatMessageSchema>;
```

- [ ] **Step 3 : Table MySQL dans `shared/schema-mysql.ts`** (colonnes identiques, types MySQL)

Après la définition de `naturalSolutions` :

```typescript
export const aiChatMessages = mysqlTable("ai_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  role: varchar("role", { length: 16 }).notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
```

- [ ] **Step 4 : Insert schema + types MySQL dans `shared/schema-mysql.ts`**

Après `insertPackageSchema` :

```typescript
export const insertAiChatMessageSchema = createInsertSchema(aiChatMessages).omit({ id: true, createdAt: true });
```

Après `InsertPackage` :

```typescript
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type InsertAiChatMessage = z.infer<typeof insertAiChatMessageSchema>;
```

- [ ] **Step 5 : Re-exports dans `shared/schema-active.ts`**

Dans la section `// Tables`, après `export const packages = activeSchema.packages;` :

```typescript
export const aiChatMessages = activeSchema.aiChatMessages;
```

Dans la section `// Zod insert schemas`, après `insertPackageSchema` :

```typescript
export const insertAiChatMessageSchema = activeSchema.insertAiChatMessageSchema;
```

Dans le bloc `export type { ... } from "./schema";`, ajouter `AiChatMessage, InsertAiChatMessage,` à la liste (avant la fermeture `} from "./schema";`).

- [ ] **Step 6 : Couvrir la table dans le test anti-drift `shared/schema-drift.test.ts:19`**

Ajouter une entrée à `TABLE_PAIRS` (après la ligne `emailTemplates`) :

```typescript
  ["aiChatMessages",       sqlite.aiChatMessages,       mysql.aiChatMessages],
```

- [ ] **Step 7 : Vérifier types + drift**

Run: `npm run check`
Expected: aucune erreur TypeScript.

Run: `npm test`
Expected: PASS — notamment `drift — colonnes de la table "aiChatMessages" identiques SQLite↔MySQL`.

- [ ] **Step 8 : Créer la table en base de dev (SQLite)**

Run: `npm run db:push`
Expected: drizzle-kit applique la création de `ai_chat_messages` sur `./data.db` (création de table = opération non destructive ; confirmer si l'outil le demande).

> Prod MySQL (au déploiement, plus tard) : `npm run db:push:mysql`. À ne PAS exécuter maintenant.

- [ ] **Step 9 : Commit** (on plie le spec + le plan dans ce premier commit du domaine)

```bash
git add shared/schema.ts shared/schema-mysql.ts shared/schema-active.ts shared/schema-drift.test.ts docs/superpowers/specs/2026-06-13-assistant-ia-naturopathie-design.md docs/superpowers/plans/2026-06-13-assistant-ia-naturopathie.md
git commit -m "feat(assistant): table ai_chat_messages (schémas SQLite/MySQL + drift)"
```

---

## Task 2 : Méthodes storage

**Files:**
- Modify: `server/storage.ts` (imports ~ligne 19-34 ; interface `IStorage` ~ligne 711-717 ; implémentation après les méthodes Packages)

- [ ] **Step 1 : Importer la table et les types**

Dans l'import `from "@shared/schema-active"` des **tables** (ligne ~19-24), ajouter `aiChatMessages` :

```typescript
import {
  users, appointmentCategories, availabilitySlots, clients, appointments,
  consultationNotes, sessions, invoices, invoiceItems, emailTemplates,
  anamnesisTemplates, anamnesisResponses, programs, clientDocuments, naturalSolutions,
  packages, aiChatMessages,
} from "@shared/schema-active";
```

Dans l'import **type** `from "@shared/schema-active"` (ligne ~25-34), ajouter `AiChatMessage` à la liste :

```typescript
  Package, InsertPackage, AiChatMessage,
} from "@shared/schema-active";
```

(`desc`, `eq` sont déjà importés depuis `drizzle-orm` à la ligne 35 ; aucun import supplémentaire requis.)

- [ ] **Step 2 : Déclarer les méthodes dans `IStorage`**

Avant la fermeture `}` de l'interface `IStorage` (juste après `deletePackage(...)`, ligne ~716) :

```typescript
  // Assistant IA
  listAiChatMessages(userId: number, limit?: number): Promise<AiChatMessage[]>;
  createAiChatMessage(data: { userId: number; role: string; content: string }): Promise<AiChatMessage>;
  deleteAiChatMessages(userId: number): Promise<void>;
```

- [ ] **Step 3 : Implémenter dans `DatabaseStorage`**

Ajouter, à la fin de la classe `DatabaseStorage` (juste avant son `}` de fermeture) :

```typescript
  // ── Assistant IA ───────────────────────────────────────────────────────────
  async listAiChatMessages(userId: number, limit = 50): Promise<AiChatMessage[]> {
    // On récupère les N plus récents (desc) puis on inverse → ordre chronologique.
    const rows = await db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.userId, userId))
      .orderBy(desc(aiChatMessages.createdAt), desc(aiChatMessages.id))
      .limit(limit);
    return rows.reverse();
  }

  async createAiChatMessage(data: { userId: number; role: string; content: string }): Promise<AiChatMessage> {
    return dbInsertReturning<AiChatMessage>(aiChatMessages, { ...data, createdAt: Date.now() });
  }

  async deleteAiChatMessages(userId: number): Promise<void> {
    await db.delete(aiChatMessages).where(eq(aiChatMessages.userId, userId));
  }
```

- [ ] **Step 4 : Vérifier les types**

Run: `npm run check`
Expected: aucune erreur TypeScript.

- [ ] **Step 5 : Commit**

```bash
git add server/storage.ts
git commit -m "feat(assistant): méthodes storage ai_chat_messages"
```

---

## Task 3 : Client Mistral `server/mistral.ts` (TDD)

**Files:**
- Test: `server/mistral.test.ts`
- Create: `server/mistral.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `server/mistral.test.ts` :

```typescript
/**
 * Tests unitaires — server/mistral.ts (constructeur de messages).
 * Aucun appel réseau : on teste uniquement buildMistralMessages (fonction pure).
 * Runner : node:test (`npm test`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMistralMessages, SYSTEM_PROMPT, MAX_HISTORY, type ChatTurn } from "./mistral";

test("buildMistralMessages — le 1er message est le system prompt", () => {
  const msgs = buildMistralMessages([], "Bonjour");
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[0].content, SYSTEM_PROMPT);
});

test("buildMistralMessages — le message utilisateur est ajouté en dernier", () => {
  const history: ChatTurn[] = [
    { role: "user", content: "Q1" },
    { role: "assistant", content: "R1" },
  ];
  const msgs = buildMistralMessages(history, "Q2");
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, "user");
  assert.equal(last.content, "Q2");
  assert.equal(msgs.length, 4); // system + 2 historique + user
});

test("buildMistralMessages — tronque l'historique aux MAX_HISTORY derniers tours", () => {
  const history: ChatTurn[] = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  })) as ChatTurn[];
  const msgs = buildMistralMessages(history, "fin");
  assert.equal(msgs.length, 1 + MAX_HISTORY + 1); // system + MAX_HISTORY + user
  // Le plus ancien tour conservé doit être history[length - MAX_HISTORY]
  assert.equal(msgs[1].content, history[history.length - MAX_HISTORY].content);
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — `Cannot find module './mistral'` (le fichier n'existe pas encore).

- [ ] **Step 3 : Implémenter `server/mistral.ts`**

Créer `server/mistral.ts` :

```typescript
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
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run: `npm test`
Expected: PASS (les 3 tests `buildMistralMessages`).

- [ ] **Step 5 : Vérifier les types**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add server/mistral.ts server/mistral.test.ts
git commit -m "feat(assistant): client Mistral + system prompt formateur (TDD)"
```

---

## Task 4 : Routes `server/routes/chat.ts`

**Files:**
- Create: `server/routes/chat.ts`
- Modify: `server/routes/index.ts:39` (import) et `:136` (câblage)

- [ ] **Step 1 : Créer `server/routes/chat.ts`**

```typescript
/**
 * server/routes/chat.ts — Assistant IA naturopathie (Mistral)
 *
 * Conversation continue unique par utilisatrice. POST appelle Mistral puis
 * persiste le message + la réponse. Historique scopé par userId.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { askNaturoAssistant, type ChatTurn } from "../mistral";

const chatBodySchema = z.object({
  message: z.string().trim().min(1, "Message vide").max(4000, "Message trop long"),
});

const HISTORY_LIMIT = 50; // messages renvoyés à l'affichage
const CONTEXT_LIMIT = 30;  // messages chargés comme contexte pour Mistral

export function registerChatRoutes(app: Express): void {
  // Historique de la conversation
  app.get("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listAiChatMessages(req.userId!, HISTORY_LIMIT));
  });

  // Envoi d'un message → réponse de l'assistant
  app.post("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
    }
    const userMessage = parsed.data.message;

    // Contexte récent (chronologique) → tours pour Mistral
    const recent = await storage.listAiChatMessages(req.userId!, CONTEXT_LIMIT);
    const history: ChatTurn[] = recent.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const result = await askNaturoAssistant(history, userMessage);
    if (!result.ok) {
      const message =
        result.status === 503
          ? "L'assistant n'est pas encore disponible. Réessaie plus tard."
          : "L'assistant n'a pas pu répondre, réessaie dans un instant.";
      return res.status(result.status).json({ message });
    }

    // Persistance : message utilisateur puis réponse assistant
    const userRow = await storage.createAiChatMessage({
      userId: req.userId!,
      role: "user",
      content: userMessage,
    });
    const assistantRow = await storage.createAiChatMessage({
      userId: req.userId!,
      role: "assistant",
      content: result.reply,
    });

    res.json({ userMessage: userRow, assistantMessage: assistantRow });
  });

  // Effacement de l'historique (= droit à l'effacement RGPD)
  app.delete("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
    await storage.deleteAiChatMessages(req.userId!);
    res.json({ ok: true });
  });
}
```

- [ ] **Step 2 : Importer dans `server/routes/index.ts`**

Après `import { registerPackageRoutes } from "./packages";` (ligne ~39) :

```typescript
import { registerChatRoutes } from "./chat";
```

- [ ] **Step 3 : Câbler dans `server/routes/index.ts`**

Après `registerPackageRoutes(app);` (ligne ~136) :

```typescript
  registerChatRoutes(app);
```

- [ ] **Step 4 : Vérifier types + routes**

Run: `npm run check`
Expected: aucune erreur TypeScript.

Run: `npm run smoke`
Expected: PASS — le serveur démarre et les routes se câblent sans erreur.

- [ ] **Step 5 : Commit**

```bash
git add server/routes/chat.ts server/routes/index.ts
git commit -m "feat(assistant): routes GET/POST/DELETE /api/chat"
```

---

## Task 5 : Variable d'environnement

**Files:**
- Modify: `.env.example`

- [ ] **Step 1 : Ajouter la section Mistral dans `.env.example`**

Après le bloc `# ─── Google Calendar OAuth (optionnel) ───` (avant `# ─── URL publique`) :

```
# ─── Assistant IA (Mistral) ───────────────────────────────────────────────────
# Clé API Mistral (console.mistral.ai). Sans elle, l'assistant répond 503 proprement.
MISTRAL_API_KEY=
```

- [ ] **Step 2 : Commit**

```bash
git add .env.example
git commit -m "chore(assistant): variable MISTRAL_API_KEY dans .env.example"
```

---

## Task 6 : Page `client/src/pages/Chat.tsx`

**Files:**
- Create: `client/src/pages/Chat.tsx`

- [ ] **Step 1 : Créer la page**

```tsx
/**
 * client/src/pages/Chat.tsx — Assistant IA naturopathie
 *
 * Conversation continue avec le « formateur virtuel » (API Mistral côté serveur).
 * Historique persisté via /api/chat. Bouton « Effacer » pour repartir de zéro.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Trash2, Sparkles, Info } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AiChatMessage } from "@shared/schema";

function Bubble({ role, content, typing }: { role: string; content: string; typing?: boolean }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} data-testid={`message-${role}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
        } ${typing ? "animate-pulse" : ""}`}
      >
        {content}
      </div>
    </div>
  );
}

export default function Chat() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<AiChatMessage[]>({ queryKey: ["/api/chat"] });

  const sendMut = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/chat", { message }),
    onSuccess: async () => {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
    },
    onError: (e: any) => {
      setPending(null);
      toast({
        title: "Erreur",
        description: e?.message || "L'assistant n'a pas pu répondre.",
        variant: "destructive",
      });
    },
  });

  const clearMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/chat"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
      toast({ title: "Conversation effacée", variant: "success" });
    },
    onError: () =>
      toast({ title: "Erreur", description: "Impossible d'effacer la conversation.", variant: "destructive" }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, sendMut.isPending]);

  function submit() {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    setPending(text);
    setInput("");
    sendMut.mutate(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function clearHistory() {
    const ok = await confirm({
      title: "Effacer la conversation ?",
      description: "Tout l'historique de tes échanges avec l'assistant sera supprimé. Cette action est irréversible.",
      confirmLabel: "Effacer",
      destructive: true,
    });
    if (ok) clearMut.mutate();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Assistant IA"
        subtitle="Ton formateur en naturopathie, disponible à tout moment."
        icon={Sparkles}
      />

      <div
        className="rounded-[15px] border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex gap-2 items-start mb-4"
        data-testid="text-disclaimer-sante"
      >
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Cet assistant est à visée <strong>éducative</strong> et ne remplace pas un avis médical. Pour tout problème de
          santé, oriente la personne vers un professionnel de santé.
        </span>
      </div>

      <div className="card-naturo flex flex-col h-[calc(100vh-22rem)] min-h-[420px] !p-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <Loading />
          ) : messages.length === 0 && !pending ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <p className="font-semibold text-heading">Pose ta première question</p>
              <p className="text-sm max-w-sm">
                Par exemple : « Quelles plantes pour accompagner un sommeil difficile ? » ou « Explique-moi le rôle du
                foie en naturopathie. »
              </p>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <Bubble key={m.id} role={m.role} content={m.content} />
              ))}
              {pending && <Bubble role="user" content={pending} />}
              {sendMut.isPending && <Bubble role="assistant" content="…" typing />}
            </>
          )}
        </div>

        <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Écris ta question…"
            className="resize-none min-h-[44px] max-h-32"
            rows={1}
            data-testid="input-chat-message"
          />
          <Button
            onClick={submit}
            disabled={!input.trim() || sendMut.isPending}
            className="rounded-[12px] shrink-0"
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearHistory}
          disabled={messages.length === 0 || clearMut.isPending}
          className="text-muted-foreground"
          data-testid="button-clear-chat"
        >
          <Trash2 className="h-4 w-4 mr-1" /> Effacer la conversation
        </Button>
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 2 : Vérifier les types**

Run: `npm run check`
Expected: aucune erreur (la page n'est pas encore routée mais doit compiler).

- [ ] **Step 3 : Commit**

```bash
git add client/src/pages/Chat.tsx
git commit -m "feat(assistant): page de chat /app/chat"
```

---

## Task 7 : Routage + entrée de menu

**Files:**
- Modify: `client/src/App.tsx:37` (import) et `:78` (route)
- Modify: `client/src/components/AppLayout.tsx:3-7` (import icône) et `:30-36` (item de menu)

- [ ] **Step 1 : Importer la page dans `client/src/App.tsx`**

Après `import Stats from "@/pages/Stats";` (ligne ~37) :

```typescript
import Chat from "@/pages/Chat";
```

- [ ] **Step 2 : Ajouter la route**

Après la route `/app/stats` (ligne ~78) :

```tsx
      <Route path="/app/chat" component={() => <ProtectedRoute><Chat /></ProtectedRoute>} />
```

- [ ] **Step 3 : Importer l'icône dans `client/src/components/AppLayout.tsx`**

Ajouter `Sparkles` à l'import `lucide-react` (lignes 3-7), p. ex. à la fin de la liste avant `Menu` :

```typescript
import {
  LayoutDashboard, Calendar, Users, Tag, Clock, Globe, Settings, LogOut,
  ExternalLink, Receipt, Shield, Bell, MailOpen, ClipboardList, FileText,
  BarChart2, Leaf, Ticket, Sparkles, Menu,
} from "lucide-react";
```

- [ ] **Step 4 : Ajouter l'entrée de menu**

Dans le groupe `"Suivi & contenu"` de `NAV_GROUPS` (ligne ~30-36), ajouter après l'item `solutions` :

```typescript
      { href: "/app/chat", label: "Assistant IA", icon: Sparkles },
```

- [ ] **Step 5 : Vérifier les types**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add client/src/App.tsx client/src/components/AppLayout.tsx
git commit -m "feat(assistant): route /app/chat + entrée de menu"
```

---

## Task 8 : Vérification de bout en bout

**Files:** aucun (vérification)

- [ ] **Step 1 : Types + tests + smoke**

Run: `npm run check`
Expected: aucune erreur.

Run: `npm test`
Expected: PASS (drift `aiChatMessages` + 3 tests `buildMistralMessages`).

Run: `npm run smoke`
Expected: PASS.

- [ ] **Step 2 : Vérification dégradation sans clé (preview)**

Démarrer l'app (`npm run dev` ou preview_start), se connecter, ouvrir `/#/app/chat`.
Envoyer un message **sans** `MISTRAL_API_KEY` définie.
Expected : toast d'erreur propre (« L'assistant n'est pas encore disponible… »), pas de crash, le message n'est pas persisté.

- [ ] **Step 3 : Vérification réponse réelle (avec clé)**

Définir `MISTRAL_API_KEY` (clé fournie par Julien), redémarrer, renvoyer une question.
Expected : la réponse de l'assistant s'affiche, l'historique persiste après rechargement, « Effacer » vide la conversation.

> Note : Steps 2-3 nécessitent l'app lancée et (pour Step 3) la clé. Si la clé n'est pas encore disponible, Step 2 suffit à valider l'intégration ; Step 3 sera fait au moment où Julien fournit la clé.

---

## Auto-revue (couverture spec)

- ✅ Mistral via fetch natif, zéro dépendance (Task 3)
- ✅ Modèle `mistral-small-latest` (Task 3)
- ✅ Page dédiée `/app/chat` + menu (Tasks 6-7)
- ✅ Historique persisté `ai_chat_messages` ×3 schémas + drift (Task 1)
- ✅ Storage scopé par userId (Task 2)
- ✅ `GET`/`POST`/`DELETE` + Zod + requireAuth (Task 4)
- ✅ System prompt YMYL + disclaimers + bannière UI (Tasks 3, 6)
- ✅ Coût/contexte borné (MAX_HISTORY=15 ; max_tokens=800 ; message ≤ 4000) (Tasks 3-4)
- ✅ Gestion d'erreur 503/502/400 + dégradation propre (Tasks 3-4)
- ✅ RGPD : clé serveur-only, `DELETE` = effacement (Tasks 3-4-6)
- ✅ Test unitaire du constructeur de messages (Task 3)
- ✅ `MISTRAL_API_KEY` dans `.env.example` (Task 5)
- ✅ Accès « tous comptes connectés » via requireAuth + trial-guard (Task 4, note)
