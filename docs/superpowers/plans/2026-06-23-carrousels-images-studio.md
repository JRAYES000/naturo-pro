# Plan — Carrousels en images (Studio contenu)

Spec : [2026-06-23-carrousels-images-studio-design.md](../specs/2026-06-23-carrousels-images-studio-design.md)

## Spike — RÉSOLU ✅ (contrat API image OpenRouter confirmé sur appel réel)
- Endpoint : `POST https://openrouter.ai/api/v1/chat/completions`
- Body : `{ model:"sourceful/riverflow-v2-fast", messages:[{role:"user",content:<prompt>}], modalities:["image"], image_config:{aspect_ratio:"4:5"} }`
  - ⚠️ `modalities:["image"]` SANS `"text"` (avec « text » → 404). 
- Réponse : `choices[0].message.images[0].image_url.url` = data-URL base64 (WebP/PNG selon provider — le navigateur décode).

## Étapes (ordre d'exécution)

1. **Schéma + migration + DB dev**
   - `shared/schema.ts` : `slidesJson: text("slides_json")`, `backgroundImage: text("background_image")` sur `contentPosts`.
   - `shared/schema-mysql.ts` : `slidesJson: text("slides_json")`, `backgroundImage: longtext("background_image")` (`longtext` déjà importé).
   - `migrations/1.8-carousel-visuals.sql` : `ALTER TABLE content_posts ADD COLUMN ...` (best-effort).
   - DB dev : ALTER `data.db` via better-sqlite3 (script jetable, PAS `db:push`).
   - Vérif : `npm test` (drift SQLite↔MySQL passe).

2. **`server/openrouter-image.ts`** — `generateBackgroundImage(prompt): Promise<string|null>` (data-URL ou null).

3. **`server/social-content.ts`** — helpers purs (`buildSlideStructuringPrompt`, `buildBackgroundPrompt`, `splitSlidesFromText`) + `structureCarouselSlides` + types `CarouselSlide`/`CarouselDeck`.

4. **`server/storage.ts`** — `createContentPost` accepte `slidesJson?`/`backgroundImage?` ; interface `IStorage` alignée.

5. **`server/routes/content.ts`** — route `POST /api/content/slides` (quota, zod, parallèle structure+image) ; `savePostSchema` étendu (`slidesJson?`, `backgroundImage?` avec garde-fous de taille).

6. **Tests backend** (`*.test.ts`, node:test) — helpers purs.

7. **`client/src/lib/zip.ts`** — ZIP « store » + CRC32, sans dépendance + test (signature `PK\x03\x04`).

8. **`client/src/lib/slide-canvas.ts`** — `renderCarouselSlides` (1080×1350, style éditorial, voile vert, cover-fit du fond, repli dégradé) + `wrapLines` pur testé.

9. **`client/src/pages/StudioContenu.tsx`** — bouton « Générer les visuels » (carrousel), grille d'aperçus, téléchargement par slide + ZIP, sauvegarde avec visuels, bibliothèque (badge + aperçu lazy + ZIP).

10. **Vérif réelle** : `npm run check`, `npm test`, appel réel de la route, rendu via preview. Commit. Déploiement prod = étape finale (pose `OPENROUTER_API_KEY` prod + migration 1.8).

## Décisions/hypothèses
- `longtext` (MySQL) au lieu de `mediumtext` : déjà importé, équivalent fonctionnel.
- Visuels générés seulement à la demande (bouton), sauvegardés seulement via « Enregistrer ».
- `image_config.aspect_ratio:"4:5"` envoyé ; si ignoré par le provider, le cover-fit canvas corrige.
