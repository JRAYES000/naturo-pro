# Design

## Visual Theme
Wellness premium éditorial, registre « apothicaire moderne » : crème chaleureux + vert sapin profond, ponctué d'un vert menthe lumineux en accent rare. Ambiance calme, soignée, crédible. Thème clair (la page est consultée de jour, en phase de décision ; le crème évoque le papier, le naturel, la confiance). L'audace vient de la typographie (serif de titre) et de la composition éditoriale, pas de la couleur criarde ni de l'animation. Une section immersive en vert profond crée un contraste de rythme.

## Color Palette
Neutres teintés vers le vert, jamais de #000 / #fff purs.
- Surface / fond : crème `#FAF8F4` (hsl 36 38% 97%)
- Surface alternée (sections) : crème plus sombre `#F3EFE8` (token muted)
- Vert primaire (marque) : `#186749` — texte de marque, boutons, liens
- Vert profond : `#1b4332` (titres) ; very-dark `#013F27` (sections immersives, dégradé CTA)
- Accent menthe : `#17EC9B` — réservé aux détails (≤ 10 % de surface) : coches, filets, focus, petits signaux
- Texte : gris-vert foncé `#33373d` ; secondaire vert-gris `#5a7a6a`
- Bordures : vert pâle (hsl 138 56% 85%)

Stratégie : Restrained sur le crème (neutres teintés + accent menthe rare), avec une section Committed en vert profond pour le contraste (CTA finale).

## Typography
- Titres (display) : **Spectral** (serif humaniste, calme et raffiné), poids 500–600, tracking légèrement serré. Réservé à la landing (art direction de marque). Apporte le premium / éditorial et casse le « tout-sans » des SaaS.
- Corps et UI : **Nunito** (humaniste arrondie, chaleureuse) — déjà la police de l'app, assure la continuité.
- Échelle modulaire fluide, contraste de taille marqué (h1 ~ clamp 2.5 → 4rem). Longueur de ligne du corps ≤ 70ch.

## Components
- Boutons : `btn-primary-naturo` (vert plein, coins 15px) pour l'action primaire ; bouton fantôme bordé vert pour le secondaire.
- Pas de grille de cartes pour les fonctionnalités : présentation éditoriale en groupes thématiques (colonne label + liste), icônes en ligne discrètes (pas de tuiles arrondies icône-au-dessus-du-titre).
- FAQ : liste à filets (border-b), pas de cartes individuelles.
- Vidéo : cadre premium (filet fin + ombre douce verte), ratio 16:9.

## Layout
- Rythme vertical compact mais respirant (sections ~ py-16/20), avec variation des espacements (pas d'uniformité mécanique).
- Compositions éditoriales : colonnes label / contenu, filets de séparation, alignements à gauche dans les blocs structurés (le hero peut rester centré et affirmé).
- Largeur de contenu max-w-6xl ; texte long ≤ 65–70ch.
- Motion minimale et utilitaire (hover, accordéon). prefers-reduced-motion respecté. Pas de chorégraphie au scroll.
