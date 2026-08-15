# Suivi SEO — app.ecole-naturo.fr

**Fichier de référence du SEO de l'app.** Il existe pour une raison précise : ne jamais refaire
deux fois le même audit. Avant de demander une nouvelle analyse, lancer la commande ci-dessous —
elle dit en trente secondes ce qui tient et ce qui a lâché. On ne travaille que sur les `FAIL`.

```bash
npm run seo:check
```

Sur un serveur local : `npm run seo:check -- http://localhost:3000`.
Le script ([script/seo-check.mjs](../script/seo-check.mjs)) interroge le site **réel** et répond
`PASS` / `FAIL` / `N/A` action par action. Code de sortie 1 s'il reste un `FAIL`.

> **À l'agent qui reprend ce dossier** : commencer par `npm run seo:check`, puis lire la section
> « Ce qui reste à faire ». Ne pas relancer un audit complet tant que l'état ci-dessous n'est pas
> contredit par la mesure. Les décisions structurantes sont en fin de fichier — les changer
> demande une décision de Julien, pas une initiative.

---

## État au 15/08/2026

Audit d'origine : [docs/AUDIT-SEO-2026-08-15.md](AUDIT-SEO-2026-08-15.md) — il garde le
raisonnement, les volumes de recherche et l'analyse concurrentielle. Ce fichier-ci ne garde que
l'état.

Dernière exécution de `npm run seo:check` : **9 PASS · 1 FAIL · 4 N/A**.

| # | Action | État | Où ça vit |
|---|---|---|---|
| A1 | Corps de page pré-rendu dans le HTML servi | ✅ fait | `server/seo-pages.ts` · `server/static.ts` |
| A2 | Annuaire `/naturopathes` + pages ville | ✅ fait (pages ville en attente de stock) | `server/seo-pages.ts` |
| A3 | Vrai 404 au lieu de 200 partout | ✅ fait | `server/static.ts:isSpaPath` |
| A4 | Ville obligatoire pour publier | ✅ fait | `server/routes/profile.ts` · `PublicPageEditor.tsx` |
| A5 | `<link rel="canonical">` | ✅ fait | `server/static.ts:buildSeoHead` |
| A6 | JSON-LD (Person, LocalBusiness, SoftwareApplication, FAQPage, ItemList) | ✅ fait | `server/seo-pages.ts` |
| A7 | Sitemap propre (démo exclue, `lastmod` réel) | ✅ fait | `server/static.ts:buildSitemapXml` |
| A8 | Page `/logiciel-naturopathe` + H1 ciblé | ✅ fait | `server/seo-pages.ts:renderSoftwarePage` |
| A9 | Liens depuis `ecole-naturo.fr` | ✅ fait — 3 liens | WordPress, hors dépôt (voir plus bas) |
| A10 | Meta descriptions construites sur des données réelles | ✅ fait | `server/static.ts:buildMetaDescription` |
| A11 | Seuil de complétude avant indexation | ✅ fait | `server/seo-pages.ts:isIndexable` |
| A12 | `/llms.txt` réel | ✅ fait | `server/static.ts:buildLlmsTxt` |
| A13 | `<meta charset>` avant `<title>` | ✅ fait | `server/static.ts:applySeoHead` |
| **A14** | **Crawlers IA non bloqués par l'hébergeur** | ❌ **échec** | **hors dépôt — hPanel Hostinger** |

### A14 — GPTBot est bloqué au niveau de l'hébergement

Découvert le 15/08/2026 en vérifiant le travail, pas dans l'audit initial. Mesuré, reproductible :

```
Mozilla/5.0 … Chrome/120   → 200
ClaudeBot/1.0              → 200
PerplexityBot/1.0          → 200
OAI-SearchBot/1.0          → 200
GPTBot/1.2                 → 429   ← y compris sur /robots.txt
```

Le blocage porte sur **tout le compte Hostinger**, `ecole-naturo.fr` comme
`app.ecole-naturo.fr`, et il touche même `/robots.txt` — le fichier qui autorise explicitement
GPTBot n'est donc jamais lu par GPTBot. Concrètement : ChatGPT ne peut crawler aucun des deux
sites.

Ce n'est pas l'application : ses limiteurs ne couvrent que `/api/*`
(`server/routes/limiters.ts`). C'est le pare-feu applicatif de l'hébergeur.

**À faire par Julien** : hPanel → Sécurité / pare-feu, vérifier la règle de blocage des bots IA,
et décider si GPTBot doit passer. C'est un arbitrage, pas un bug : laisser OpenAI crawler le
site, c'est accepter que le contenu alimente ChatGPT. Le reste de la configuration (robots.txt,
llms.txt) part du principe que oui — il y a donc aujourd'hui une contradiction entre l'intention
déclarée et ce que fait l'infrastructure.

---

## Ce qui reste à faire

Par ordre d'effet, et sans dépendance au code :

1. **Brancher la Search Console** sur `app.ecole-naturo.fr` et y soumettre le sitemap.
   Tant que ce n'est pas fait, tout ce dossier repose sur des estimations tierces : impossible
   de dire ce que Google a réellement indexé. C'est la prochaine action utile.
2. **Relancer les praticiennes pour compléter leur fiche.** Au 15/08/2026, **0 fiche sur 12** passe
   le seuil d'indexation. Chacune peut voir ce qui lui manque dans son éditeur de page publique.
   Sans fiches complètes, l'annuaire et les pages ville restent vides et hors index — c'est le
   goulot d'étranglement de tout le reste.
3. **Trancher A14** (voir ci-dessus).
4. **Ouvrir les pages ville** quand une ville atteint 3 praticiens : rien à coder, elles
   apparaissent d'elles-mêmes dans l'annuaire, le sitemap et `llms.txt`.
5. **Sous-domaine ou sous-dossier ?** `app.ecole-naturo.fr` est traité par Google comme un site
   distinct : il ne reçoit rien du DA 42 et des 524 domaines référents du domaine racine.
   Un `ecole-naturo.fr/logiciel/` en hériterait. À trancher **après** avoir vu les données GSC,
   et avant d'investir dans du netlinking payant vers le sous-domaine.
6. **Netlinking externe** : inutile tant que 1 et 2 ne sont pas faits. Payer pour envoyer de
   l'autorité vers des pages hors index, c'est de l'argent brûlé.

---

## Décisions structurantes

À ne pas modifier sans décision explicite : ce sont des arbitrages, pas des réglages.

| Décision | Valeur | Pourquoi |
|---|---|---|
| Seuil de praticiens par ville | **3** (`MIN_PROFILES_PER_CITY`) | En dessous, une page ville est du contenu mince généré à l'échelle — le scénario type de pénalité sur un site santé (YMYL). |
| Seuil d'indexation d'une fiche | ville + ≥ 1 spécialité + bio ≥ 300 caractères + ≥ 1 prestation (`isIndexable`) | Même raison. Une fiche sous le seuil reste accessible par son lien, mais passe en `noindex` et sort du sitemap. |
| Casse des noms | normalisée à l'affichage seulement (`shared/display-name.ts`) | « RAYES » → « Rayes ». Une casse déjà mixte est laissée telle quelle : deviner mieux que la personne concernée ferait plus de dégâts que le problème traité. |
| Canonical des fiches | toujours `/p/{slug}`, jamais le sous-domaine tenant | L'app est multi-tenant : la même fiche existe sur deux hôtes. |
| Comptes de démo | flag `users.is_demo`, réglable dans l'admin | Un praticien de santé fictif soumis à Google est un signal de qualité négatif. |

### Effet immédiat assumé du seuil d'indexation

Le sitemap est passé de **13 URLs à 2** le 15/08/2026. Ce n'est pas une régression : les
12 fiches praticiens ne remplissaient aucune des conditions ci-dessus, et le site mesurait déjà
**0 mot-clé positionné et 0 trafic organique sur 12 mois** (Ubersuggest — estimé). Il n'y avait
donc rien à perdre, et un risque *thin content* à éviter. Le sitemap se remplira à mesure que les
fiches se complètent.

---

## Liens posés depuis ecole-naturo.fr (A9)

Modifiés le 15/08/2026 par `$wpdb` (WP-CLI), délimiteurs de blocs préservés :

| Article | Lien ajouté vers |
|---|---|
| [Ouvrir son cabinet de bien-être](https://ecole-naturo.fr/blog/cabinet-bien-etre-prestations-complementaires-naturopathie/) (41364) | `/logiciel-naturopathe` |
| [Naturopathe : métier, salaire, débouchés](https://ecole-naturo.fr/blog/naturopathe-metier-salaire-debouches/) (7891) | `/logiciel-naturopathe` |
| [Consultation chez un naturopathe](https://ecole-naturo.fr/blog/consultation-naturopathe/) (43932) | `/naturopathes` |

Pour en ajouter : passer par SSH + WP-CLI et `$wpdb`, **jamais par l'API REST** — le connecteur
WordPress MCP ne renvoie que le HTML rendu, et republier ce rendu détruirait les délimiteurs de
blocs Gutenberg. Le WordPress est sur le **même compte SSH que l'app** (`naturo-prod`), dans
`domains/ecole-naturo.fr/public_html`.

---

## Historique

| Date | Événement |
|---|---|
| 15/08/2026 | Audit complet ([AUDIT-SEO-2026-08-15.md](AUDIT-SEO-2026-08-15.md)) : 13 actions identifiées. Les 13 appliquées et déployées le jour même. A14 (blocage GPTBot) découvert à la vérification, non résolu — hors dépôt. |
