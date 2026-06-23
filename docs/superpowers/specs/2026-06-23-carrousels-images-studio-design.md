# Spec — Carrousels en images (Studio contenu)

- **Date** : 2026-06-23
- **Auteur** : Julien + Claude
- **Statut** : validé (design approuvé), prêt pour le plan d'implémentation
- **Contexte** : le Studio contenu (onglet « Créer ») de Naturobot génère aujourd'hui des carrousels **en texte**. On veut produire les slides **en image** (format Instagram), téléchargeables facilement, et les **stocker dans « Mes contenus »**.

---

## 1. Objectif & périmètre

Permettre à une praticienne de transformer un carrousel généré en **images de slides prêtes à poster** sur Instagram, puis de les **télécharger** (par slide + ZIP) et de les **retrouver dans « Mes contenus »**.

**Dans le périmètre :**
- Génération d'images **uniquement pour le format `carrousel`**.
- **Approche hybride** : le texte est rendu par un template (texte réel, accents parfaits), l'IA ne génère qu'**un fond**.
- **1 seul fond** cohérent par carrousel (décision A).
- Format **4:5 — 1080×1350 px** (décision A).
- Style **éditorial** : texte sur la photo avec un **voile vert dégradé** garanti (décision B).
- **Téléchargement** : par slide + bouton « Tout télécharger (.zip) » (slides PNG + `legende.txt`).
- **Persistance** dans « Mes contenus » : on stocke le **JSON des slides** + **l'image de fond**, pas les PNG finaux (re-rendus à la volée).

**Hors périmètre (YAGNI) :**
- Les autres formats (reel, story, post_groupe, legende) restent **texte uniquement**.
- Pas d'éditeur de template par l'utilisatrice (couleurs/police fixes, dérivées de la marque + nom praticienne).
- Pas de publication automatique vers Instagram.
- Pas de stockage des 6 PNG finaux (on stocke les ingrédients, on re-rend).

---

## 2. Décisions de conception (issues du cadrage)

| Sujet | Décision |
|---|---|
| Modèle texte | `deepseek/deepseek-v4-flash` (OpenRouter) — déjà en place |
| Modèle image | **`sourceful/riverflow-v2-fast`** (OpenRouter) — design natif, ~$0,02 / image 1K |
| Fond | **1 seul** par carrousel (cohérence + coût mini) |
| Format | **4:5 — 1080×1350 px** |
| Style | **Éditorial** : texte sur photo + voile vert dégradé garanti |
| Rendu | **Côté navigateur (Canvas)** — texte réel, **0 dépendance serveur**, prod-safe (pas de Chromium) |
| ZIP | **Côté client, sans dépendance** (mode « store » + CRC32) |
| Persistance | Stocke `slidesJson` + `backgroundImage` sur le post ; re-rendu à la volée |

---

## 3. Architecture

### 3.1 Vue d'ensemble du flux

1. La praticienne génère son carrousel **en texte** comme aujourd'hui (inchangé : `POST /api/content/generate`).
2. Un bouton **« Générer les visuels »** apparaît (seulement si `format === "carrousel"` et texte présent).
3. Le client appelle **`POST /api/content/slides`** avec le texte généré.
4. Le serveur renvoie : `slides[]` structurés + `caption` + `hashtags[]` + `background` (data-URL base64, ou `null`).
5. Le client **rend chaque slide** sur un `<canvas>` 1080×1350 (style éditorial) → aperçus PNG.
6. Téléchargement par slide + **« Tout télécharger (.zip) »**.
7. **« Enregistrer »** stocke le post avec `slidesJson` + `backgroundImage` → visible dans « Mes contenus », re-téléchargeable.

### 3.2 Backend

**Nouveau module `server/openrouter-image.ts`** (responsabilité unique : générer une image)
- `generateBackgroundImage(prompt: string): Promise<string | null>`
  - Appelle l'API image OpenRouter avec le modèle `sourceful/riverflow-v2-fast`.
  - Renvoie une **data-URL base64** (`data:image/...;base64,...`) ou **`null`** en cas d'échec (dégradation propre).
  - Clé `OPENROUTER_API_KEY`, headers `HTTP-Referer`/`X-Title` (cohérent avec `mistral.ts`/`rag.ts`).
  - ⚠️ **Forme exacte de l'API image à confirmer par un spike** (voir §7).

**Ajouts à `server/social-content.ts`** (helpers purs + 1 appel réseau)
- `buildSlideStructuringPrompt(text: string): string` — **PUR**. Prompt qui demande au LLM de **structurer le texte existant** (sans le réécrire) en JSON strict :
  `{ "slides":[{ "kicker": string, "title": string, "body": string }], "caption": string, "hashtags": string[] }`.
- `structureCarouselSlides(text: string): Promise<CarouselDeck>` — appel chat (`LLM_MODEL`, `response_format: json_object`), parse + valide ; **repli** sur `splitSlidesFromText`.
- `splitSlidesFromText(text: string): CarouselDeck` — **PUR**. Repli déterministe : découpe sur les marqueurs « Slide N », isole la « LÉGENDE » et les `#hashtags`.
- `buildBackgroundPrompt(topic: string, voice: { specialties?, marketingTone? }): string` — **PUR**. Prompt verrouillé pour un fond **sobre, sombre, botanique, flou, espace négatif, ton vert, SANS AUCUN TEXTE**, pensé pour recevoir du texte par-dessus.
- Types : `CarouselSlide = { kicker: string; title: string; body: string }`, `CarouselDeck = { slides: CarouselSlide[]; caption: string; hashtags: string[] }`.
- Garde-fous : `slides` plafonné à **10**, champs tronqués (kicker ≤ 40, title ≤ 120, body ≤ 300).

**Nouvelle route dans `server/routes/content.ts`**
- `POST /api/content/slides` (`requireAuth`)
  - **Quota** : réutilise `incrementAiChatUsage` (1 génération = 1 unité, même `AI_DAILY_LIMIT`).
  - **Body (zod)** : `{ channel, format: "carrousel", topic, text }` — `text` = contenu déjà généré (min 1, max ~20 000).
  - Refuse si `format !== "carrousel"` (400).
  - Déroulé : `structureCarouselSlides(text)` et `generateBackgroundImage(buildBackgroundPrompt(...))` lancés **en parallèle** (`Promise.all`).
  - **Réponse** : `{ slides, caption, hashtags, background: string | null }`.
  - Erreurs : structuration KO → repli `splitSlidesFromText` (jamais 5xx pour ça) ; image KO → `background: null` (le client met un fond de marque).

### 3.3 Persistance (« Mes contenus »)

**Modèle de données — 2 nouvelles colonnes nullables sur `content_posts` :**

| Colonne (DB) | SQLite (`schema.ts`) | MySQL (`schema-mysql.ts`) | Contenu |
|---|---|---|---|
| `slides_json` | `text("slides_json")` | `text("slides_json")` | JSON `CarouselDeck` (petit, < 64 Ko) |
| `background_image` | `text("background_image")` | **`mediumtext("background_image")`** | data-URL base64 de l'**unique** fond (peut dépasser 64 Ko → `mediumtext` obligatoire en MySQL) |

- Les deux colonnes sont **`null`** pour tous les posts texte existants et pour les formats non-carrousel.
- `schema-active.ts` : **aucun changement** (il ré-exporte déjà `contentPosts` ; les colonnes suivent automatiquement). La règle « 3 fichiers » de CLAUDE.md vise l'ajout de **table**, pas de colonne → ici on touche `schema.ts` + `schema-mysql.ts` seulement.
- `insertContentPostSchema` (`createInsertSchema(contentPosts).omit(...)`) intègre les colonnes nullables → **optionnelles** automatiquement.
- **Test de drift** (`schema-drift.test.ts`) : les deux colonnes doivent exister des deux côtés avec le **même nom snake_case** → le test garantit la parité.
- **Migration prod** : nouveau `migrations/1.8-carousel-visuals.sql` — `ALTER TABLE content_posts ADD COLUMN slides_json TEXT NULL; ALTER TABLE content_posts ADD COLUMN background_image MEDIUMTEXT NULL;` (best-effort, idempotent comme les migrations existantes).
- **Dev SQLite** : ajouter les colonnes via `better-sqlite3` `ALTER TABLE` (PAS `db:push` — cf. piège connu : l'index `users_email_unique` fait échouer `db:push`).

**Couche `storage.ts` & route de sauvegarde**
- `savePostSchema` (dans `content.ts`) étendu : `slidesJson?: string (≤ 64_000)`, `backgroundImage?: string (≤ 4_000_000)` — garde-fous de taille.
- `createContentPost` passe les nouveaux champs (déjà générique sur l'objet d'insertion).
- `listContentPosts` / `getContentPost` renvoient les nouvelles colonnes → la bibliothèque y a accès.

### 3.4 Frontend

**Nouveau helper `client/src/lib/slide-canvas.ts`**
- `renderCarouselSlides(deck: CarouselDeck, opts: { background: string | null; practitionerName: string }): Promise<RenderedSlide[]>`
  - `RenderedSlide = { index: number; blob: Blob; url: string }` (PNG, 1080×1350).
  - Pour chaque slide : dessine le **fond** (image en *cover*, ou dégradé de marque si `null`) → **voile vert dégradé** bas (transparent → `#1b4332`, lisibilité garantie) → en-tête (nom praticienne + `n / total`) → kicker (`#17EC9B`) → titre (blanc, gras) → corps (blanc 85 %) → pastilles de progression.
  - **Retour à la ligne** géré via `measureText` ; logique de wrapping isolée en **fonction pure** `wrapLines(measure, text, maxWidth): string[]` (testable).
  - Attend `document.fonts.ready` avant de dessiner (accents/police corrects).
  - Couleurs marque : primary `#186749`, accent `#17EC9B`, dark `#1b4332`.

**Nouveau helper `client/src/lib/zip.ts`** (sans dépendance)
- `createZip(files: { name: string; data: Uint8Array }[]): Blob` — archive ZIP **mode « store »** (pas de compression ; les PNG sont déjà compressés) + **CRC32**. ~80 lignes.
- Utilisé pour empaqueter `slide-1.png … slide-N.png` + `legende.txt` (caption + hashtags).

**`client/src/pages/StudioContenu.tsx`**
- Onglet « Créer » : sous le résultat, si `format === "carrousel"` et `streamText`, bouton **« Générer les visuels »** (mutation TanStack Query → `POST /api/content/slides` via `apiRequest`).
- Au succès : `renderCarouselSlides(...)` → **grille d'aperçus** + bouton **télécharger** par slide + **« Tout télécharger (.zip) »**.
- État `deck` + `background` conservés pour que **« Enregistrer »** inclue `slidesJson` (JSON.stringify du deck) + `backgroundImage` dans le POST `/api/content/posts`.
- `ContentLibrary` (« Mes contenus ») : un post avec `slidesJson` affiche un badge **« Visuels »**, un bouton **« Aperçu »** (re-rend via `renderCarouselSlides` à la demande, *lazy*) et **« Télécharger (.zip) »**. Réutilise les mêmes helpers.

---

## 4. Contrat d'API

`POST /api/content/slides` → `200`
```json
{
  "slides": [
    { "kicker": "Sommeil & insomnie", "title": "Ton sommeil te joue des tours ?", "body": "3 leviers naturo…" }
  ],
  "caption": "Et si ton sommeil devenait ton allié…",
  "hashtags": ["#SommeilRéparateur", "#Naturopathie"],
  "background": "data:image/png;base64,iVBORw0K…"
}
```
- `429` si quota dépassé ; `400` si body invalide ou format ≠ carrousel ; `background` peut être `null`.

---

## 5. Coût & garde-fous

- **~$0,02 par carrousel** (1 image Riverflow V2 Fast). Compté dans le quota quotidien existant.
- Garde-fous de taille en base (`background_image` ≤ ~4 Mo, `slides_json` ≤ 64 Ko).
- Prompt de fond verrouillé pour **éviter tout texte** dans l'image (le texte vient du template).

---

## 6. Gestion d'erreurs (dégradation propre, à chaque étage)

| Étage | Échec | Repli |
|---|---|---|
| Image OpenRouter | timeout / 5xx / clé absente | `background: null` → fond **dégradé de marque** (gratuit) |
| Structuration LLM | JSON invalide / 5xx | `splitSlidesFromText(text)` (découpage déterministe) |
| Police navigateur | pas prête | `await document.fonts.ready` avant de dessiner |
| Texte trop long | débordement | wrapping + réduction de taille par paliers, troncature douce |

---

## 7. Inconnu technique à lever en premier (spike)

**Forme exacte de l'API image OpenRouter.** Hypothèse de travail à confirmer :
- `POST https://openrouter.ai/api/v1/chat/completions` avec `{ model: "sourceful/riverflow-v2-fast", messages:[{role:"user", content: <prompt>}], modalities: ["image","text"] }`.
- Image attendue dans `choices[0].message.images[0].image_url.url` (data-URL).
- À confirmer : paramètre de taille/aspect (sinon on génère portrait et on *cover-crop* sur le canvas en 1080×1350), format renvoyé (PNG/JPEG/WebP), et coût réel observé.
- **Le plan commence par ce spike** (petit script `node --env-file=.env`), avant tout code applicatif.

---

## 8. Tests (node:test, comme l'existant)

Fonctions **pures** testées unitairement :
- `buildSlideStructuringPrompt` — contient les consignes JSON + le texte source.
- `buildBackgroundPrompt` — interdit explicitement le texte, impose le ton.
- `splitSlidesFromText` — découpe « Slide N », isole légende + hashtags, cas limites.
- `wrapLines` (wrapping canvas) — avec une fonction de mesure injectée (mots longs, lignes vides).
- `createZip` — produit un blob avec **signature ZIP valide** (`PK\x03\x04`) et le bon nombre d'entrées (vérifiable en Node sur les octets).

Le rendu Canvas lui-même (navigateur) n'est pas testé en unitaire — seule la logique pure l'est.

---

## 9. Contraintes respectées

- ✅ **Zéro nouvelle dépendance npm** (image via OpenRouter, ZIP maison, rendu Canvas natif).
- ✅ Schéma : 2 colonnes nullables, parité SQLite/MySQL garantie par le test de drift, migration prod best-effort.
- ✅ UI 100 % français, `apiRequest` only, pas de `localStorage`, `storage` only côté serveur.
- ✅ Prod-safe : aucun Chromium, aucun binaire natif, rien de lourd sur Passenger/Hostinger.

---

## 10. Fichiers touchés (récap)

**Créés** : `server/openrouter-image.ts`, `client/src/lib/slide-canvas.ts`, `client/src/lib/zip.ts`, `migrations/1.8-carousel-visuals.sql`, tests associés.
**Modifiés** : `server/social-content.ts` (helpers), `server/routes/content.ts` (route + savePostSchema), `server/storage.ts` (si besoin pour les nouveaux champs), `shared/schema.ts`, `shared/schema-mysql.ts`, `client/src/pages/StudioContenu.tsx`.
