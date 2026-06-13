# Assistant IA Q&A Naturopathie — Spec / Design

**Date :** 2026-06-13
**Statut :** Validé (design approuvé par Julien)
**Milestone :** Assistant IA « formateur virtuel » intégré à Naturo Pro

---

## 1. Contexte & objectif

Ajouter à Naturo Pro un assistant IA qui répond aux questions de naturopathie des
utilisatrices (stagiaires + praticiennes), façon **formateur / instructeur virtuel**.

Fournisseur LLM retenu : **Mistral** (entreprise française, hébergement UE) — choix
motivé par le RGPD pour une application de santé française.

Appel à l'API REST de Mistral **depuis le backend Express**, jamais depuis le client
(la clé API ne doit jamais transiter côté navigateur).

## 2. Décisions verrouillées

| Décision | Choix |
|---|---|
| Fournisseur | Mistral (API REST) |
| Modèle | `mistral-small-latest` (ID exact confirmé sur l'API au moment de coder) |
| Placement UI | Page dédiée `/app/chat` (« Assistant »), entrée de menu |
| Historique | **Sauvegardé en base** |
| Accès | Tous les comptes connectés (essai + abonnés ; `trial-guard` bloque déjà les essais expirés) |
| Modèle de données | **Une conversation continue unique par utilisatrice** (pas de multi-fils), bouton « Effacer » pour repartir de zéro |
| Dépendances | **Zéro nouvelle dépendance npm** — appel via `fetch` natif (Node 24) |

## 3. Architecture

```
client/src/pages/Chat.tsx
   │  useQuery(['/api/chat'])  ┌─ GET /api/chat      → historique (n derniers)
   │  useMutation (POST)       ├─ POST /api/chat     → { message }
   │  bouton « Effacer »       └─ DELETE /api/chat   → efface l'historique (RGPD)
   ▼  apiRequest (cookie de session)
server/routes/chat.ts  (registerChatRoutes, requireAuth)
   │  valide le body (Zod) → charge le contexte récent → appelle Mistral → persiste
   ▼
server/mistral.ts        ──fetch──▶  api.mistral.ai /v1/chat/completions
   │  (system prompt + troncature historique ; lit process.env.MISTRAL_API_KEY)
   ▼
storage (DatabaseStorage) ─▶ table ai_chat_messages (SQLite dev / MySQL prod)
```

## 4. Composants (unités isolées)

1. **`server/mistral.ts`** — client mince + construction du *system prompt* et des
   messages. Seule responsabilité : parler à Mistral. Aucune dépendance à Express ou à
   la DB. Expose une fonction du type `askNaturoAssistant({ history, userMessage })`
   et un constructeur de messages testable séparément.
2. **Schéma `ai_chat_messages`** — ajouté dans les **3 fichiers** :
   `shared/schema.ts` (SQLite), `shared/schema-mysql.ts` (MySQL), re-export via
   `shared/schema-active.ts`. Insert schema Zod inclus.
3. **Storage** — `createAiChatMessage`, `listAiChatMessages(userId, limit)`,
   `deleteAiChatMessages(userId)` dans `IStorage` + `DatabaseStorage` (helpers
   `dbInsertReturning` / `first`, dual-driver).
4. **`server/routes/chat.ts`** — `registerChatRoutes(app, ctx)` : `GET`, `POST`,
   `DELETE` sur `/api/chat`, protégés par `requireAuth`. Enregistré dans
   `server/routes/index.ts`.
5. **`client/src/pages/Chat.tsx`** — `ScrollArea` des messages, `Textarea` + bouton
   envoyer, `useQuery(['/api/chat'])`, `useMutation` (optimiste) → invalidation,
   bouton « Effacer », bannière disclaimer. `AppLayout` + couleurs du thème
   (`#186749` / `#17EC9B`). `data-testid` selon convention.
6. **Routing** — route `<ProtectedRoute>` `/app/chat` dans `client/src/App.tsx` +
   entrée de menu « Assistant ».

## 5. Modèle de données

Table `ai_chat_messages` :

| Colonne | Type (SQLite / MySQL) | Notes |
|---|---|---|
| `id` | integer PK autoincrement / int PK auto | |
| `userId` | integer / int | FK logique vers `users.id` |
| `role` | text / varchar | `'user'` \| `'assistant'` |
| `content` | text / text | corps du message |
| `createdAt` | integer (ms) / bigint | horodatage |

Index sur `(userId, createdAt)` pour le tri/chargement.

Une seule conversation continue par utilisatrice : « la conversation » = tous les
messages de cet `userId` triés par `createdAt`. « Effacer » supprime toutes les lignes
de l'utilisatrice.

## 6. API

| Méthode | Route | Comportement |
|---|---|---|
| `GET` | `/api/chat` | Renvoie les *n* derniers messages de l'utilisatrice (ordre chronologique). |
| `POST` | `/api/chat` | Body `{ message: string }` (Zod, non vide, max ~4000 car.). Charge le contexte récent, appelle Mistral, **persiste les 2 lignes** (user + assistant), renvoie le message assistant. |
| `DELETE` | `/api/chat` | Supprime tout l'historique de l'utilisatrice. Sert aussi le droit à l'effacement RGPD. |

## 7. Cadrage santé (YMYL) — non négociable

Le *system prompt* fixe :
- **Rôle** : formateur / instructeur en naturopathie, pédagogique, **en français**.
- **Périmètre** : éducation en naturopathie ; refuse poliment diagnostics, prescriptions
  et hors-sujet ; oriente vers un professionnel de santé pour tout problème médical.
- **Disclaimer** : « à visée éducative, ne remplace pas un avis médical ».

Le disclaimer est **aussi** affiché en bannière dans l'UI.

## 8. Maîtrise du coût / contexte

- N'envoyer que les **~15 derniers messages** à Mistral (borne coût + contexte).
- `max_tokens` de réponse raisonnable.
- Longueur du message entrant validée (Zod).

## 9. Gestion d'erreur

| Cas | Réponse |
|---|---|
| `MISTRAL_API_KEY` absente | `503` « Assistant indisponible » (dégradation propre) → toast |
| Erreur / timeout Mistral | `502` → toast « L'assistant n'a pas pu répondre, réessaie » |
| Body invalide | `400` Zod |
| Non connecté / essai expiré | géré par `requireAuth` + `trial-guard` existants |

## 10. Sécurité & RGPD

- Clé API **uniquement** côté serveur (`process.env.MISTRAL_API_KEY`).
- Données de chat (santé) stockées en base → bouton « Effacer » = droit à l'effacement.
- Pas de secret commité (repo public).
- Accès strictement scoping par `userId` (jamais l'historique d'une autre utilisatrice).

## 11. Tests

- Test unitaire (`node:test`, `npm test`) sur le **constructeur de messages**
  (system prompt + troncature d'historique), appel réseau injecté / mocké.
- Minimal, pas de nouvelle infra de test.

## 12. Config / Ops

- Ajouter `MISTRAL_API_KEY=` à `.env.example` (nouvelle section).
- Julien fournit un compte Mistral + une clé (console.mistral.ai). Le code **dégrade
  proprement** sans la clé en dev (`503`), donc le développement et les tests
  n'exigent pas la clé.

## 13. Hors-scope (phases ultérieures)

- **RAG** sur les supports de cours École Naturo (phase 2 — le vrai différenciateur).
- Bulle de chat flottante disponible partout.
- Streaming token-par-token des réponses.
- Conversations multiples / fils séparés.
