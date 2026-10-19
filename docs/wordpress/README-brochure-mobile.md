# Optimisation mobile de la page /brochure/ (ecole-naturo.fr)

**Date : 2026-07-07 — Page WordPress ID 35263 (`https://ecole-naturo.fr/brochure/`)**

Ce dossier archive le contenu de la page WordPress « Brochure » avant/après le correctif
d'affichage mobile (la page vit en base WordPress, pas dans ce repo — on garde ici une
copie versionnée comme sauvegarde).

## Symptôme

Sur smartphone, la carte « Téléchargez gratuitement » restait en 2 colonnes (largeur
960 px) : le formulaire débordait de l'écran à droite, et le panneau gauche s'affichait
en blanc avec un titre noir au lieu du dégradé vert avec titre Cormorant Garamond.

## Cause racine

Le filtre WordPress `wpautop` transforme chaque **ligne vide** du contenu en balises
`</p><p>` — y compris **à l'intérieur des blocs `<style>`**. Résultat : des fragments
`</p><p>` injectés en plein CSS, qui invalidaient les règles suivantes, notamment :

- `@media (max-width: 680px)` de la carte hero → pas d'empilement en 1 colonne sur mobile ;
- `@media (max-width: 768px)` de la section « conseillers pédagogiques » ;
- plusieurs règles desktop (`.ecole-brochure__left` : fond dégradé, `.ecole-brochure__title`, etc.).

## Correctif appliqué (dans le contenu de la page, via l'API REST WP)

1. **Suppression de toutes les lignes vides à l'intérieur des blocs `<style>` et `<script>`**
   (les sauts de ligne simples sont inoffensifs, seules les lignes vides déclenchent wpautop).
2. **Réparation de sélecteurs dont les espaces avaient été perdus** (combinateur descendant) :
   - `.ecole-brochure__title.eb-free` → `.ecole-brochure__title .eb-free` (le « gratuitement » doré) ;
   - `label.eb-req` → `label .eb-req` (astérisque orange des champs requis) ;
   - `.eb-loading.ecole-brochure__spinner` / `.eb-loading.eb-btn-icon` / `.eb-loading.eb-btn-label`
     → versions avec espace (spinner du bouton pendant l'envoi) ;
   - `.ensn-card.ensn-role` → `.ensn-card .ensn-role`.
3. **Icône email** : le path SVG feather « mail » était corrompu (`c1.1 0 2.9 2 2v12` →
   `c1.1 0 2 .9 2 2v12`).
4. **Renforcement du breakpoint mobile** de la carte hero (≤ 680 px) : paddings réduits,
   `border-left` retiré sur la colonne formulaire, titre en `clamp(1.9rem, 8.5vw, 2.5rem)`,
   titre du formulaire à `1.4rem`.

Le shortcode `[trustindex no-registration=google]`, le webhook Make, le champ caché GCLID
et le widget Calendly sont conservés à l'identique.

## ⚠️ Règle à retenir pour les prochaines éditions de cette page

**Ne jamais laisser de ligne vide à l'intérieur d'un bloc `<style>` ou `<script>`** dans le
contenu d'une page WordPress éditée en HTML brut : wpautop y injecte des `</p><p>` et casse
le CSS/JS. Garder le CSS minifié ou avec des sauts de ligne simples uniquement.

## Fichiers

- `brochure-page-35263-avant.html` : contenu brut (`content.raw`) avant correctif ;
- `brochure-page-35263-apres.html` : contenu brut après correctif (état déployé le 2026-07-07).

En cas de besoin, restauration possible via l'éditeur WP (révisions de la page) ou en
re-poussant le fichier « avant » via `POST /wp/v2/pages/35263`.
