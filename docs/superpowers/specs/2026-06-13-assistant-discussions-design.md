# Discussions de l'assistant IA — Conception

**Date :** 2026-06-13
**Statut :** validé (conception) — prêt pour plan d'implémentation

## Objectif

Transformer l'assistant IA, aujourd'hui un **fil de discussion unique** par praticienne, en **discussions multiples, retrouvables et catégorisées** :

- soit **rattachées à une cliente** (pour préparer une consultation de suivi) — l'assistant lit alors la fiche de la cliente pour personnaliser ses réponses ;
- soit **rattachées à une thématique** (quand ce n'est lié à aucune cliente).

Tout vit **sur la même page** que l'assistant (`/app/chat`), avec une relation bidirectionnelle avec la page Clients.

## Contexte actuel (existant)

- `ai_chat_messages` (`id, userId, role, content, createdAt`) — un seul fil par `userId`.
- Routes `GET/POST/DELETE /api/chat` (`server/routes/chat.ts`) — POST streame via `streamNaturoAssistant` (continuation auto), charge instructions globales + RAG, ajoute la ligne sentinelle `@@SOURCES@@`, persiste.
- `server/mistral.ts` : `buildMistralMessages(history, userMessage, opts?: { customInstructions?, contextChunks? })`, `streamNaturoAssistant`, `askNaturoAssistant` (non-stream).
- `clients` (`id, userId, firstName, lastName, email, phone, dateOfBirth, address, allergies, antecedents, lifestyleNotes, penseBete, createdAt`).
- Pages : `Chat.tsx` (`/app/chat`), `Clients.tsx`, `ClientDetail.tsx` (`/app/clients/:id`).
- Quota : `ai_chat_usage` (limite quotidienne par praticienne) — conservé tel quel, compté par message.

## Décisions validées

1. **Granularité** : plusieurs discussions par cliente (regroupées sous elle).
2. **Périmètre** : une discussion-cliente injecte la fiche de la cliente dans le contexte de l'assistant (réponses personnalisées).
3. **Nommage** : titre généré automatiquement par l'IA (modifiable) ; thématiques via **menu déroulant prédéfini + option « Autre… »** ; **catégorisation auto** (l'IA pré-sélectionne la thématique).
4. **RGPD** : bandeau **très discret** (ligne grise + petite icône, sans fond coloré), pas de consentement explicite par cliente en v1 (Mistral est en UE).
5. **Disposition** : panneau de discussions à gauche (groupé « Par cliente » / « Par thématique »), conversation à droite — validé sur maquette.

## Modèle de données

### Nouvelle table `ai_discussions`

| Colonne | Type | Notes |
|---|---|---|
| `id` | int PK autoinc | |
| `userId` | int notNull | la praticienne propriétaire |
| `clientId` | int nullable | FK logique → `clients.id` ; non-null = discussion-cliente |
| `theme` | text/varchar(120) nullable | thématique (prédéfinie ou libre) ; pertinent quand `clientId` est null |
| `title` | text/varchar(255) notNull | titre auto (modifiable) ; valeur initiale `"Nouvelle discussion"` |
| `createdAt` | int/bigint notNull | |
| `updatedAt` | int/bigint notNull | bump à chaque message (tri par récence) |

### Modification de `ai_chat_messages`

Ajout d'une colonne `discussionId` (int, nullable au moment de la migration puis renseignée pour tous les messages).

### Règle de regroupement (côté lecture)

- **Par cliente** : `clientId IS NOT NULL`, groupé par `clientId`, discussions triées `updatedAt DESC`.
- **Par thématique** : `clientId IS NULL`, groupé par `theme` (les `theme` null tombent dans « Non classé »), triées `updatedAt DESC`.

### Trois schémas + migration

- Ajouter `aiDiscussions` dans `schema.ts`, `schema-mysql.ts`, `schema-active.ts`, et la paire `["aiDiscussions", sqlite.aiDiscussions, mysql.aiDiscussions]` dans `schema-drift.test.ts`.
- Ajouter `discussionId` à `aiChatMessages` dans les 3 schémas.
- Migration MySQL best-effort (`server/storage.ts`, boucle `runMysqlMigrations`) : `CREATE TABLE IF NOT EXISTS ai_discussions (...)` + `ALTER TABLE ai_chat_messages ADD COLUMN discussion_id INT NULL`.
- **Backfill du fil existant** : pour chaque `userId` ayant des `ai_chat_messages` sans `discussionId`, créer une discussion « Discussion générale » (`clientId=null`, `theme=null`) et y rattacher tous ses messages. Rien n'est perdu.

## Parcours & UI

### Page assistant `/app/chat` (route avec sélection : `/app/chat/:discussionId?`)

Disposition deux panneaux (validée sur maquette) :

- **Panneau gauche** (sidebar bureau / tiroir mobile) :
  - Bouton **« + Nouvelle discussion »**.
  - Section **« Par cliente »** : chaque cliente (initiales + nom) → ses discussions.
  - Section **« Par thématique »** : chaque thème → ses discussions.
  - Un champ de filtre texte simple en haut (filtre titres/clientes/thèmes côté client).
- **Panneau droit** : la conversation de la discussion sélectionnée (UI actuelle : bulles, Markdown, streaming, sources, copier). En-tête = titre éditable (crayon) + suppression. Pour une discussion-cliente, **bandeau RGPD discret** sous le titre.

### Démarrer une discussion

`« + Nouvelle discussion »` ouvre un choix léger :

- **Pour une cliente** → liste déroulante **cherchable** des clientes → la discussion est créée avec `clientId` ; l'assistant lit sa fiche dès la 1ʳᵉ réponse.
- **Thématique** → la discussion démarre « non classée » ; la praticienne pose sa question, l'IA propose **titre + thématique** (pré-sélection dans le menu déroulant), qu'elle valide ou change d'un clic.

Démarrage souple : par défaut une nouvelle discussion est thématique non classée ; on peut la **rattacher à une cliente en un clic** à tout moment (PATCH).

### Liste déroulante de thématiques (constante partagée)

```
Sommeil & insomnie · Digestion & intestin · Stress, émotions & nervosité ·
Immunité · Détox & émonctoires · Hormonal & cycle féminin · Énergie & fatigue ·
Peau · Articulations & douleurs · Poids & alimentation · Circulation ·
Respiratoire · Autre…
```

Définie dans une constante partagée (`shared/assistant-themes.ts`) réutilisée par le menu déroulant ET la catégorisation auto.

### Intégration page cliente (`ClientDetail.tsx`)

- Nouvelle section **« Discussions avec l'assistant »** : liste des discussions de cette cliente (titre + date du dernier message), chacune cliquable → ouvre `/app/chat/:discussionId`.
- Bouton **« Demander à l'assistant »** → crée une discussion déjà rattachée à la cliente et redirige vers `/app/chat/:discussionId` (zéro saisie de rattachement).

## Fiche cliente injectée (le volet RGPD)

Pour une discussion-cliente, au moment de l'envoi, le serveur charge la fiche et injecte un bloc compact dans le contexte système, via un nouvel `opt clientContext` de `buildMistralMessages` :

```
Fiche de la cliente concernée (confidentiel, à prendre en compte) :
- Prénom : Marie
- Âge : 42 ans            (calculé depuis dateOfBirth si présent)
- Antécédents : ...
- Allergies : ...
- Hygiène de vie : ...    (lifestyleNotes)
- Notes : ...             (penseBete)
```

- **Seuls** ces champs ; **jamais** email / téléphone / adresse. Champs vides omis.
- Bandeau RGPD **très discret** sous le titre de la discussion : petite ligne grise (`text-xs text-muted-foreground`) + icône info, par ex. « Fiche cliente prise en compte ». Pas de fond coloré.

## Génération auto titre + thématique

Petit appel **non-streaming** à Mistral (`askNaturoAssistant`-like, `max_tokens` ~80, JSON) déclenché **après** le 1ᵉʳ échange complet d'une discussion (pour ne pas retarder la réponse) :

- Entrée : la 1ʳᵉ question + la liste de thématiques.
- Sortie attendue : `{"title": "≤6 mots", "theme": "<un libellé de la liste>"}`.
- Le serveur met à jour `ai_discussions` (title toujours ; theme seulement si discussion thématique sans thème déjà choisi).
- **Fallback** robuste si l'appel échoue ou JSON invalide : `title` = 1ʳᵉ question tronquée à ~50 caractères ; `theme` = « Autre ».
- Le client réinvalide la liste des discussions après envoi → le titre/thème apparaît.

## Backend

Nouveau fichier `server/routes/discussions.ts` (`registerDiscussionRoutes`), `requireAuth`, scoping par `userId`. Remplace `server/routes/chat.ts`.

| Route | Rôle |
|---|---|
| `GET /api/discussions` | liste des discussions de la praticienne (id, clientId, theme, title, updatedAt) |
| `POST /api/discussions` | crée `{ clientId?, theme? }` → discussion (title placeholder) |
| `PATCH /api/discussions/:id` | renommer / re-catégoriser / rattacher (`{ title?, theme?, clientId? }`) |
| `DELETE /api/discussions/:id` | supprime la discussion + ses messages |
| `GET /api/discussions/:id/messages` | messages de la discussion |
| `POST /api/discussions/:id/messages` | envoi + réponse en flux (reprend la logique de `chat.ts` : quota, instructions, RAG, streaming, sources, persistance). Si `clientId` → injecte la fiche. Si 1ᵉʳ échange → génère titre/thème. Bump `updatedAt`. |

`ClientDetail` ne nécessite **pas** de route dédiée : il réutilise `GET /api/discussions` et filtre côté client sur `clientId` (volume faible — quelques dizaines de discussions par praticienne).

Toutes les routes vérifient que la discussion (et la cliente) appartiennent au `userId` courant (403 sinon).

`storage` (`server/storage.ts`) : méthodes `listDiscussions(userId)`, `getDiscussion(id)`, `createDiscussion(...)`, `updateDiscussion(id, patch)`, `deleteDiscussion(id)` (supprime aussi ses messages), et `listAiChatMessages`/`createAiChatMessage` scopées par `discussionId`.

`server/mistral.ts` : `buildMistralMessages` gagne `opts.clientContext?: string` injecté dans le system prompt. Fonction `generateDiscussionMeta(firstQuestion): Promise<{title, theme}>`.

## Gestion des erreurs

- Discussion introuvable / d'une autre praticienne → 404/403.
- Cliente supprimée alors qu'une discussion la référence : `clientId` orphelin → la discussion bascule en « Non classé » à l'affichage (pas de crash) ; la suppression d'une cliente met `clientId=null` sur ses discussions (les échanges restent).
- Génération titre/thème en échec → fallback (titre tronqué + « Autre »), jamais bloquant.
- Streaming : inchangé (503 clé absente / 502 / continuation auto déjà en place).

## Tests

- **Unitaires** (`node:test`) : `buildMistralMessages` avec `clientContext` (le bloc fiche apparaît dans le system) ; helper de regroupement cliente/thématique ; constante des thématiques.
- **Drift** : paire `aiDiscussions` ajoutée à `schema-drift.test.ts`.
- **Parcours manuel (dev)** : créer une discussion thématique → titre/thème auto ; créer depuis une fiche cliente → bandeau + fiche prise en compte ; renommer ; supprimer ; vérifier le backfill du fil existant.

## Hors périmètre (YAGNI)

- Consentement explicite par cliente (seulement le bandeau discret).
- Accès des **clientes finales (patientes)** à l'assistant — seule la praticienne l'utilise.
- Partage / export dédié des discussions (l'export RGPD existant pourra les inclure plus tard).
- Recherche plein-texte dans le contenu des messages (un simple filtre sur titres/clientes/thèmes suffit en v1).
