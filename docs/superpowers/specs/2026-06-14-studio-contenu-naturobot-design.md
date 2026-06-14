# Studio Contenu NaturoBot — Spec de conception

> Date : 2026-06-14
> Statut : validé en brainstorming, à implémenter
> Auteur : Julien Rayes (+ Claude Code)

## 1. Contexte & problème

Les utilisatrices de Naturo Pro sont des praticiennes en **reconversion** qui se sont
formées à la naturopathie et **lancent leur activité**. Leur premier obstacle n'est pas
le savoir naturo, mais **trouver des clientes sur les réseaux sociaux**. Trois freins
concrets :

1. **Régularité** — « je ne sais pas quoi poster / je n'ai pas le temps ».
2. **Légitimité / peur** — « de quel droit je poste ? et si je dis une bêtise ? »
   (la santé = risque d'allégation interdite).
3. **Conversion** — « j'ai quelques likes mais zéro client ».

L'app possède déjà **les deux moitiés d'un tunnel d'acquisition qui ne se parlent pas** :

- **NaturoBot** détient l'expertise (Mistral + RAG sur les supports de cours + les
  **thèmes réels des questions de leurs clientes**).
- La **page publique de réservation** (`/p/{slug}`) détient la surface de conversion
  (bio, photo, spécialités, liens Insta/Facebook, créneaux).

Objectif : **relier les deux** en faisant de NaturoBot un moteur de contenu social
conforme, avec un chemin intégré vers la réservation.

Fil rouge stratégique :
`Contenu régulier → audience → clic lien bio → page publique /p/{slug} → réservation`.

## 2. Décisions verrouillées (issues du brainstorming)

| Décision | Choix retenu |
|---|---|
| Travail n°1 de la feature | **Écrire des posts prêts à publier, dans la voix de la praticienne, sans allégation médicale, avec son lien de réservation inséré automatiquement.** |
| Canaux | **Instagram + Facebook** (formats : carrousel, script de reel, story, post groupe FB local, légende seule). |
| Sources d'idées | **(a)** les vraies questions de SES clientes (thèmes agrégés, anonymes) — le différenciateur ; **(b)** les 12 thèmes prédéfinis existants ; (c) sujet libre toujours dispo en complément. |
| Ambition v1 | **Moyen : Studio + bibliothèque « Mes contenus »** (1 table légère, save / retrouver / marquer publié). Pas de calendrier éditorial. |
| Surface | **Intégré dans NaturoBot** : onglet `Discussion` (existant) ↔ `✨ Studio contenu` (nouveau). |

## 3. Périmètre

### Dans la v1
- Feature 1 — **Studio Contenu** (moteur de génération multi-formats avec CTA/lien auto).
- Feature 2 — **« Inspiré de tes clientes »** (suggestion d'angles à partir des thèmes agrégés).
- **Bibliothèque « Mes contenus »** (CRUD léger + statut).
- Profil de voix minimal (réutilise l'existant + 2 champs optionnels).
- Garde-fous conformité santé + RGPD.

### Hors v1 (assumé, itérations futures)
- Calendrier éditorial / planification dans le temps.
- Publication automatique vers Instagram/Facebook (API Meta = lourd + risqué).
- Génération d'images / visuels.
- Analytics de performance des posts.
- Autres canaux (TikTok, LinkedIn, newsletter).

## 4. Feature 1 — Studio Contenu (le moteur)

### 4.1 Flux praticienne (3 clics)
1. **Source d'idée** : `Inspiré de mes clientes` (→ §5) · un des **12 thèmes** · `Sujet libre`.
2. **Format** : `Carrousel Insta` · `Script de Reel` · `Story` · `Post groupe Facebook local` · `Légende + hashtags`.
3. **Générer** → réponse **streamée**, structurée selon le format, **prête à copier-coller**.

### 4.2 Structure attendue par format
- **Carrousel** : slide 1 = accroche ; slides 2–N = 1 idée/slide ; dernière slide = CTA
  réservation. Puis légende + hashtags ciblés.
- **Reel** : hook (3 premières secondes) + script parlé (~20–40 s) + textes à l'écran +
  CTA + légende.
- **Story** : 2–4 frames (texte court, sticker question/sondage, frame « swipe → réserver »).
- **Post groupe FB local** : ton communautaire, ancrage ville, CTA discret (les groupes
  rejettent la pub frontale).
- **Légende seule** : pour une photo déjà disponible.

### 4.3 Persona / system prompt « mode contenu »
Un **second system prompt** distinct de celui du formateur. Règles :
- **Conserve** : réponse en français ; jamais de diagnostic/prescription ; n'invente pas ;
  pas de référence chiffrée.
- **Lève** la restriction « décline les sujets hors naturo » **uniquement** pour la
  création de contenu naturo/bien-être (le marketing devient dans le périmètre de ce mode).
- **Ajoute** : conscience plateforme/format (cf. §4.2) ; bonnes pratiques (accroche en
  1re ligne, 1 idée par post, CTA clair, hashtags pertinents, emojis avec parcimonie) ;
  insertion du CTA + lien de réservation.
- **Conformité santé** (cf. §8) intégrée au prompt.

### 4.4 Insertion CTA + lien de réservation
- Le backend lit `users.slug` + `users.publicPageEnabled` du compte courant.
- Construit l'URL : `${PUBLIC_URL}/p/{slug}` (forme standard, fonctionne pour humains via
  le SPA et pour les bots via le pré-rendu SEO `/p/:slug`).
- Injecte un CTA conforme adapté au format (ex. « Pour un accompagnement personnalisé,
  réserve ta séance découverte 👉 {lien} »).
- **Si page publique non activée / pas de slug** : insère un repère lisible et invite à
  activer la page publique (lien vers l'éditeur), sans bloquer la génération.

### 4.5 Personnalisation « dans sa voix »
- Nourri par l'existant sur `users` : `name`, `specialties` (JSON), `city`, `bio`,
  `instagram`, `facebook`.
- + **2 champs optionnels** (réglés une fois) : `marketingTone`
  (`chaleureux` / `expert-pédagogue` / `proche-complice`) et `marketingAudience`
  (texte libre, ex. « femmes 30-50, fatigue & stress »).
- Champs vides → valeurs par défaut sensées (ton chaleureux & accessible, audience générique).

## 5. Feature 2 — « Inspiré de tes clientes » (le différenciateur)

### 5.1 Principe
NaturoBot agrège les **thèmes** des discussions du compte courant
(`aiDiscussions.theme`, fenêtre glissante ~90 jours), classe le **top 3–5**, et propose
une **liste d'angles de posts** prêts à dérouler :
> « Ce mois-ci tes clientes parlent surtout de **Sommeil, Digestion, Stress** →
> voici 5 idées de posts. »

Sélectionner un angle **pré-remplit le Studio** (Feature 1) et lance la génération complète
du format choisi. La « série de 5 » est donc un **menu d'idées**, pas un bloc de 5 posts
complets (UX plus claire, génération à la demande).

### 5.2 Mécanique
- **Agrégation (DB, sans LLM)** : `getClientThemeStats(userId)` → `[{ theme, count }]`
  trié décroissant sur la fenêtre.
- **Suggestion d'angles (LLM court, non-stream)** : à partir des thèmes top, renvoie
  3–5 angles `{ title, hook, suggestedFormat }` (motif calqué sur `generateDiscussionMeta`).
- L'angle choisi alimente `POST /api/content/generate` avec `topicType=client_theme`.

### 5.3 RGPD
- **Uniquement des comptes agrégés par thème** : jamais un nom, jamais le contenu d'un
  échange. Le post parle du **sujet** (le sommeil), jamais d'une cliente.
- Mention discrète sous le bloc, dans l'esprit du bandeau RGPD existant.
- Données strictement intra-compte (pas de croisement entre praticiennes).

### 5.4 Repli (praticienne sans historique)
> « Quand tu auras quelques échanges clientes, je te dirai tes sujets phares.
> En attendant, choisis un thème : » + les 12 thèmes prédéfinis.

## 6. Bibliothèque « Mes contenus »

- Liste filtrable par statut.
- Actions par contenu : **copier**, **éditer** (texte), **marquer publié**, **supprimer**.
- Depuis la sortie du Studio : **« 💾 Enregistrer dans Mes contenus »**.
- Statuts : `brouillon` · `a_publier` · `publie`.
- **Pas** de calendrier ni de planification (YAGNI v1).

## 7. Architecture technique (collée à l'existant)

### 7.1 Backend
- `server/social-content.ts` *(nouveau, pur & testable, calqué sur `mistral.ts`)* :
  - `CONTENT_SYSTEM_PROMPT` (persona marketing, §4.3) + helpers de templates de formats.
  - `buildContentMessages(...)` (fonction pure testable, jumelle de `buildMistralMessages`).
  - `buildBookingCta(user)` → CTA + URL `/p/{slug}` (ou repli si page non activée).
- **Streaming** : factoriser la boucle SSE + continuation de `mistral.ts` pour permettre
  un `systemPrompt` injectable (éviter la duplication du flux). Réutilise
  `MAX_TOKENS`, `MAX_SEGMENTS`, la logique de reprise `finish_reason: "length"`.
- `server/routes/content.ts` *(nouveau, `requireAuth`)* — cf. §9.
- `server/storage.ts` : CRUD `contentPosts` + `getClientThemeStats(userId)`.
  **Tout passe par `storage`** (règle CLAUDE.md), aucune requête Drizzle dans les routes.
- **Quota** : la génération compte sur le compteur IA existant (`aiChatUsage`,
  `AI_DAILY_LIMIT`) — pas de nouveau compteur.

### 7.2 Frontend
- Onglet **Studio contenu** dans l'espace NaturoBot (à côté de `Discussion`).
- Composants : `StudioPanel` (source d'idée + format + bouton générer ; réutilise le rendu
  Markdown / streaming / bouton copier existants de `Chat.tsx`) et `MyContentLibrary`.
- Tous les appels via `apiRequest` ; invalidation TanStack Query après mutation
  (conventions CLAUDE.md) ; query keys hiérarchiques (`['/api/content/posts']`).
- `data-testid` selon convention (`button-generate-content`, `text-content-{id}`, …).

### 7.3 Schéma (les 3 fichiers + test de parité)
- Table `contentPosts` ajoutée dans **`schema.ts`, `schema-mysql.ts`, `schema-active.ts`**.
- 2 colonnes optionnelles `marketing_tone` / `marketing_audience` sur `users`
  (dans les 3 fichiers également).
- `schema-drift.test.ts` doit rester vert (parité SQLite/MySQL).
- En dev : création de table via better-sqlite3 `CREATE TABLE`
  (`npm run db:push` est cassé sur ce projet — cf. note projet).

### 7.4 Tests (`node:test`, `npm test`)
- `buildContentMessages` (prompt + injection ton/audience/contexte).
- `buildBookingCta` (slug présent / page désactivée / slug absent).
- `getClientThemeStats` (agrégation, fenêtre, tri, compte vide).
- Templates de formats (présence des sections clés par format).

## 8. Modèle de données

### Table `contentPosts`
| Colonne | Type | Notes |
|---|---|---|
| `id` | PK | comme les autres tables |
| `userId` | FK users | propriétaire |
| `channel` | text | `instagram` \| `facebook` |
| `format` | text | `carrousel` \| `reel` \| `story` \| `post_groupe` \| `legende` |
| `theme` | text nullable | thème ou sujet libre |
| `title` | text | titre court (auto) |
| `body` | text | contenu généré (édité possible) |
| `status` | text | `brouillon` \| `a_publier` \| `publie` (défaut `brouillon`) |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `publishedAt` | timestamp nullable | rempli au passage en `publie` |

### Colonnes ajoutées à `users`
| Colonne | Type | Notes |
|---|---|---|
| `marketing_tone` | text nullable | ton de communication |
| `marketing_audience` | text nullable | description audience cible |

## 9. API (toutes `requireAuth`, préfixe `/api/content`)

| Endpoint | Méthode | Rôle |
|---|---|---|
| `/api/content/idea-sources` | GET | `{ clientThemes:[{theme,count}], predefinedThemes:[...] }` (agrégation DB, sans LLM) |
| `/api/content/suggest` | POST | À partir d'un/des thème(s) → 3–5 angles `{title, hook, suggestedFormat}` (LLM court, non-stream). Sert la Feature 2. |
| `/api/content/generate` | POST | Stream SSE. Body : `{ channel, format, topicType: 'client_theme'\|'theme'\|'libre', topic }`. Réponse = contenu formaté + CTA/lien. |
| `/api/content/posts` | GET | Liste les contenus du user (`?status=` optionnel). |
| `/api/content/posts` | POST | Enregistre un contenu généré. |
| `/api/content/posts/:id` | PATCH | Édite `body` et/ou `status` (gère `publishedAt`). |
| `/api/content/posts/:id` | DELETE | Supprime. |

Validation **Zod** sur tous les body avant DB (règle CLAUDE.md).

## 10. Garde-fous & conformité (un atout produit)

- **Zéro allégation thérapeutique** intégrée au prompt : bannir « soigne / guérit /
  traite / soulage la maladie X » ; privilégier un langage prudent (« accompagner »,
  « soutenir le terrain », « hygiène de vie », « mieux-être »). Argument de vente :
  ça **protège juridiquement** des praticiennes débutantes.
- Conserve : pas de diagnostic ni de prescription ; FR ; pas d'invention.
- RGPD sur la Feature 2 (cf. §5.3).
- Le disclaimer éducatif existant reste pertinent dans l'espace NaturoBot.

## 11. Critères d'acceptation (UAT)

1. Depuis NaturoBot, un onglet **Studio contenu** est accessible et distinct de Discussion.
2. Générer un **carrousel** sur un thème prédéfini produit un contenu structuré
   (accroche, slides, CTA, légende, hashtags) **avec le lien `/p/{slug}` du compte**.
3. Les 5 formats (carrousel, reel, story, post groupe FB, légende) produisent chacun la
   structure attendue (§4.2).
4. **« Inspiré de mes clientes »** affiche le top des thèmes réels du compte et propose
   3–5 angles cliquables ; un compte **sans historique** voit le repli (§5.4).
5. La génération **n'émet aucune allégation thérapeutique interdite** sur un échantillon
   de tests manuels.
6. Un contenu peut être **enregistré**, **retrouvé**, **édité**, **marqué publié**,
   **supprimé** dans « Mes contenus ».
7. Si la page publique est désactivée, la génération réussit quand même avec un repère +
   invitation à l'activer.
8. `npm run check` (types) et `npm test` (unitaires) passent ; `schema-drift.test.ts` vert.

## 12. Risques & points ouverts

- **Qualité du modèle** : `mistral-small-latest` peut produire du contenu fade. Mitigation :
  prompts/templates soignés + few-shot léger ; possibilité de monter de modèle si besoin.
- **Agrégation thèmes** : dépend de la qualité du `theme` auto-attribué aux discussions ;
  acceptable car déjà normalisé sur la liste des 12 thèmes.
- **Quota partagé** : génération + Q&A sur le même compteur quotidien ; à surveiller si
  usage intensif (ajuster `AI_DAILY_LIMIT` ou séparer plus tard).
- **Voix** : v1 « dans sa voix » reste approximative (pas d'apprentissage de style depuis
  des exemples) ; suffisant pour valider la valeur.
