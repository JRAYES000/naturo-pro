# Remise en conformité visuelle — 2026-08-16

Chantier demandé : « que l'app ne ressemble pas à un site créé par l'IA ».

Constat de départ : `PRODUCT.md` et `DESIGN.md` existent déjà et décrivent exactement la bonne
intention. Leurs anti-références nomment le problème mot pour mot — « template SaaS générique
fait par IA », « emojis partout », « dégradés pastel baveux ». **Le brief n'est pas en cause :
l'implémentation a dérivé.** Ce chantier ne choisit donc aucune direction nouvelle, il remet le
code en conformité avec son propre DESIGN.md.

Direction retenue : raffinement. Vert `#186749` et Nunito conservés. Périmètre : toute l'app
(couche partagée + écrans de travail + surfaces publiques + auth/onboarding).

## Marqueurs mesurés avant travaux

| Marqueur | Mesure initiale | Règle violée |
|---|---|---|
| Rayons arbitraires | 80 occurrences, 5 valeurs (`[12px]`×50, `[10px]`×23, `2xl`×4, `[15px]`×2, `[28px]`×1) | échelle de rayons du thème non tenue |
| Ombres | 8 niveaux déclarés + ombre en dur 28 px dans `.card-naturo` | craft-floor : « declare elevation once, border **or** shadow » — la carte cumule les deux (*ghost card*) |
| Emoji-icônes | 57 occurrences dans 24 fichiers, en parallèle de lucide (68 fichiers) | craft-floor : « unicode glyphs or emoji standing in for an icon system » |
| Halos radiaux | `.leaf-bg` = 2 dégradés radiaux verts, sur 16 emplacements | DESIGN.md anti-réf. « dégradés pastel baveux » |
| Poids des titres | `h1..h4` tous en 800 | hiérarchie portée par le gras au lieu de la taille et de l'espace |

Cause racine des rayons : l'échelle du thème plafonnait à 9 px (`lg`), trop petite pour une
carte. Les développeurs ont donc écrit `rounded-[12px]` à la main, 50 fois. Corriger l'échelle
supprime le besoin de la contourner.

## Étapes

- [x] 1. Échelle de rayons (`tailwind.config.ts`) : sm 6 / md 10 / lg 12 / xl 16 px
- [x] 2. Ombres : les 16 propriétés `--shadow-*` étaient du **code mort** (zéro consommateur).
      Supprimées, remplacées par un unique `--shadow-overlay`.
- [x] 3. Élévation : cartes = filet 1 px sans ombre ; overlays = ombre sans filet
- [x] 4. Hiérarchie typographique : h1 700/-0.025em → h4 600/-0.01em ; 109 `font-extrabold` → `font-bold`
- [x] 5. `.leaf-bg` : halos radiaux → surface alternée plate (token `muted`, conforme au DESIGN.md)
- [x] 6. 80 rayons arbitraires → tokens
- [x] 7. Ombres décoratives retirées ; 9 cartes qui lévitaient au survol → changement de filet et de fond
- [x] 8. 57 emoji → lucide, marqueurs dessinés ou puces CSS (24 fichiers)
- [x] 9. `PageHeader` : sur-titre supprimé (banni), mesure du sous-titre à 65ch ;
      Dashboard : 4 cartes-KPI isolées → une bande unique à filets internes, sans icône décorative

## Verdict des critères

| Critère | Résultat |
|---|---|
| 1. Aucun emoji dans `client/src/**/*.tsx` | **FAIT** — `grep` sort 1 (0 fichier) |
| 2. Aucun rayon arbitraire | **FAIT** — `grep` sort 1 (0 occurrence) |
| 3. `npm run check` + `npm test` | **FAIT** — exit 0 ; 225 tests, 0 échec |
| 4. Pas de débordement à 390 px | **FAIT** — `scrollWidth === clientWidth === 390` sur 10 routes |

Vérifications complémentaires : détecteur impeccable `[]` (4 signalements corrigés :
3 bordures latérales épaisses, 1 rebond élastique) · Playwright 44 passés / 2 ignorés ·
`npm run build` exit 0 · audit des styles calculés : 0 « ghost card » (filet + ombre) sur
Dashboard, Agenda, Clients, Factures.

Non vérifié : les captures d'écran. Le panneau navigateur n'était pas affiché, l'outil de
capture a expiré à chaque tentative. Le contrôle de débordement a été fait à la place par
mesure directe du DOM — déterministe, et plus fiable qu'un coup d'œil sur une image.

## Critères de réussite (binaires)

1. `grep -P "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" client/src --include=*.tsx` → 0 fichier
2. `grep -o "rounded-\(2xl\|3xl\|\[[0-9]*px\]\)" client/src -r` → 0 occurrence
3. `npm run check` et `npm test` → code de sortie 0
4. Les 5 écrans clés s'ouvrent sans débordement horizontal à 390 px

## Vérification

- `node ~/.agents/skills/impeccable/scripts/detect.mjs --json <cibles>` une fois, à la fin
- Captures 1280 px et 390 px : Dashboard, Agenda, Clients, Factures, Booking public
- Contrôle du rendu sur `app.ecole-naturo.fr` après déploiement, pas sur le message de succès
