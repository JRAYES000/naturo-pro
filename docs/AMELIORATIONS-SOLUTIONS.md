# Bibliothèque de référence (`/#/app/solutions`) — pistes d'amélioration

Analyse du 2026-10-19 : code (`client/src/pages/Solutions.tsx`, `server/solutions-seed.ts`,
`server/routes/solutions.ts`, picker de `Programmes.tsx`) et page rendue en local avec le compte
de démo. Aucun code modifié.

## Constats mesurés

| Constat | Mesure |
|---|---|
| Toutes les fiches s'affichent d'un bloc, sans pagination ni repli | 113 cartes, page de 43 500 px de haut |
| Recherche sensible aux accents | « melisse » → 0 résultat (la fiche s'appelle « Mélisse ») |
| Puce « grossesse » = simple recherche texte | 84 fiches sur 113 : toutes celles qui *mentionnent* la grossesse, qu'elles l'interdisent ou non |
| Les puces de précaution écrasent la recherche tapée | `setSearch(mot)`, `Solutions.tsx:140` |
| Ordre par catégorie puis nom ; « Complément » sort en premier | `storage.ts:1674` |
| Le picker des programmes n'affiche ni n'insère les précautions | `Programmes.tsx:175` insère `nom : usage` seulement |
| Fiches de base non modifiables, et pas de copie possible | `Solutions.tsx:169`, routes PATCH/DELETE réservées aux fiches perso |
| Schéma pauvre : 3 champs texte libres | `shared/schema.ts:575` (pas de forme, posologie, sources, tags) |

## Propositions, par priorité

### P1 — Rendre la page utilisable (petit effort, gros gain)

1. **Recherche sans accents ni casse.** Normaliser (`normalize("NFD")` + suppression des
   diacritiques) dans `Solutions.tsx:50` et dans le picker (`Programmes.tsx:446`). `bdpm.ts` a déjà
   `normalizeSearch` côté serveur : le déplacer dans `shared/` pour le réutiliser.
2. **Vue compacte par défaut.** Liste dense (nom, catégorie, propriétés sur une ligne, pastille
   « précautions »), fiche complète au clic (panneau latéral ou dialogue). 113 cartes pleines
   sont illisibles ; le catalogue va grossir.
3. **Catégories en onglets avec compteurs** (`Toutes 113 · Plantes 32 · HE 29 · Compléments 28 ·
   Fleurs de Bach 24`) à la place du `Select` : un clic au lieu de deux, et on voit l'étendue de la base.
4. **Puces de précaution séparées de la recherche** : filtre cumulable, indépendant du champ texte.

### P2 — Rendre les précautions fiables (enjeu de sécurité, YMYL)

5. **Précautions structurées** : ajouter des drapeaux `pregnancy`, `breastfeeding`, `children`,
   `anticoagulants`, `epilepsy`… avec trois valeurs (`contre-indiqué` / `prudence` / `RAS`), en
   plus du texte libre. La puce « grossesse » pourrait alors *exclure* les fiches contre-indiquées
   au lieu d'en remonter 84 en vrac. Migration : nouvelle colonne JSON ou table, 3 schémas +
   `migrations-mysql/`, et reprise des 113 fiches du seed (balisage semi-automatique depuis le
   texte existant, relu à la main).
6. **Précautions visibles dans le picker et rappelées dans le programme** : pastille ambre dans
   `Programmes.tsx:458`, et option « inclure les précautions » à l'insertion.
7. **Croisement avec la cliente** : les traitements de la cliente sont déjà saisis via la BDPM
   (`server/routes/clients.ts:43`). Depuis un programme, signaler « cette cliente prend un
   anticoagulant, Gingembre et Oméga-3 demandent de la prudence ». Effet « vrai outil métier »
   fort, à cadrer prudemment (alerte informative, jamais un avis).

### P3 — Rendre la base vivante

8. **Dupliquer une fiche de base** pour l'adapter (aujourd'hui : à retaper de zéro).
9. **Favoris / « mes fiches »** : filtre « mes fiches » (déjà distinguables par `userId`) et
   épinglage des solutions qu'elle prescrit le plus.
10. **Champs utiles en plus** : forme galénique, posologie type, durée de cure, synergies
    (lien vers d'autres fiches), sources.
11. **Contenu** : 113 fiches, c'est un bon départ mais ni gemmothérapie, ni aromathérapie
    hydrolats, ni oligo-éléments. Une catégorie « Bourgeon (gemmothérapie) » est la plus attendue
    côté naturopathie.
12. **Remplissage par IA** (OpenRouter, déjà branché) : « Ajouter une solution » → saisir un nom,
    proposition pré-remplie à relire, marquée « à vérifier ».

### Détails d'interface

- Titre de carte en `font-bold` sur un `h3` (`Solutions.tsx:166`) : contraire à la règle « titres
  sans classe de poids ».
- `text-[11px]` / `text-[10px]` sur les badges : taille arbitraire, à ramener sur l'échelle.
- Puces en `rounded-full` alors que l'échelle prévoit `rounded-sm` pour les puces.
- Le bandeau d'aide ne dit pas combien de fiches contient la base : l'afficher valorise la fonction
  (page payante, `FeatureGate`).

## Ordre conseillé

Lot 1 (une demi-journée, sans migration) : 1, 2, 3, 4, 6 (pastille), 8, détails d'interface.
Lot 2 (migration + relecture du contenu) : 5, puis 7.
Lot 3 (contenu et IA) : 10, 11, 12.
