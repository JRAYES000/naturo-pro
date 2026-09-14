# Cluster « naturopathie animale » + désencannibalisation accueil — 14/09/2026

Dossier de publication prêt à pousser sur ecole-naturo.fr (WordPress). Rien n'a encore été
écrit sur le site : la session qui a produit ce dossier n'avait ni le connecteur WordPress
MCP, ni l'accès SSH `naturo-prod` (port 65002 injoignable depuis le cloud).

## Pourquoi (mesuré en Search Console le 14/09/2026)

| Fait | Donnée |
|---|---|
| Décrochage de l'accueil sur « formation naturopathe / naturopathie (à distance) » | 26-27 mai 2026, position 7 → 20 (May 2026 Core Update, 21/05 → 02/06) |
| Rebond partiel | 15-23 juillet, position 8-10 |
| Deuxième glissade | 25 août → 11 septembre, position 25-32 (Spam Update 18-21/08 + volatilité 26/08) |
| Cannibalisation | Page 42322 `/formation-naturopathie-a-distance/` créée le 08/06 sur la même requête : accueil pos 19, page dédiée pos 82 |
| Cluster animal | Article pivot 8203 : ~1 000 impressions/mois, position 20-25, 0 clic. Page de vente 40874 invisible sur les requêtes animales |

Décisions de Julien (14/09) : l'accueil garde « formation naturopathie à distance », la page 42322
se recentre sur « programme de formation naturopathie » ; renforcer l'accueil ; réécrire le pivot
avec salaire, débouchés, formation à distance et liens forts vers la page de vente ; 4 à 6
satellites animaux. **Aucune mention du CPF nulle part** (financement abandonné).

## Contenu du dossier

| Fichier | Cible WordPress | Action |
|---|---|---|
| `page-42322-programme.html` + `.meta.json` | page 42322 `/formation-naturopathie-a-distance/` | remplacer le corps, titre, meta Yoast (slug inchangé, pas de 301) |
| `home-20379-renforts.md` | page 20379 (accueil, template natif) | blocs à insérer à la main aux ancres indiquées + meta Yoast + JSON-LD |
| `devenir-naturopathe-animalier-guide.html` + `.meta.json` | post 8203 | remplacer le corps, titre, meta Yoast |
| `liens-retour.md` | page 40874, page 42894, posts 43792 / 43805 / 43802 / 43799 / 43796 | insérer les phrases/encarts aux ancres indiquées |
| `naturopathie-chien-principes-limites.*` | nouveau post | brouillon, publication suggérée 21/09 |
| `naturopathie-chat-approche-naturelle.*` | nouveau post | brouillon, 28/09 |
| `fleurs-de-bach-animaux-usage-limites.*` | nouveau post | brouillon, 05/10 |
| `naturopathe-animalier-veterinaire-cadre-legal.*` | nouveau post | brouillon, 12/10 (avant les deux suivants, qui pointent vers lui) |
| `naturopathe-equin-cheval-metier.*` | nouveau post | brouillon, 19/10 |
| `apprendre-naturopathie-animale-livres-ressources.*` | nouveau post | brouillon, 26/10 |

Chaque `.meta.json` porte `notes_julien` : ce qui dépend de lui avant publication (chiffres à
confirmer, cas terrain à valider par Eva, images).

## Ordre de mise en ligne

1. **Jour 1 (dès relecture)** : page 42322 recentrée, renforts accueil, pivot 8203 réécrit,
   liens retour sur la page de vente, le guide et les 5 satellites existants. Ces cinq actions
   forment un seul chantier cohérent : les mesurer ensemble.
2. **Un satellite par semaine** du 21/09 au 26/10 (gate de vélocité, site en récupération
   post-core-update : pas de rafale). L'article « cadre légal » passe avant « naturopathe équin »
   et « livres » : ces deux-là contiennent déjà un lien vers son URL prévue
   (`/blog/naturopathe-animalier-veterinaire-cadre-legal/`, slug fixé par le `.meta.json`).
   Si WordPress attribue un autre slug, corriger ces deux liens avant leur publication.
3. **J+28 après chaque publication** : vérifier en Search Console que la page reçoit des clics
   avant d'ajouter des liens montants supplémentaires depuis elle.

## Comment publier

### Route 1 (recommandée) : session Claude locale avec le connecteur WordPress MCP

Depuis la machine de Julien (Cowork ou Claude Code local, connecteur « MCP CloudFlare
Ecole-Naturo.fr » branché), demander :

> Publie le dossier `docs/seo/2026-09-cluster-animal/` selon son README : d'abord les mises à
> jour (42322, 8203), puis les blocs manuels (`home-20379-renforts.md`, `liens-retour.md`),
> puis les six nouveaux articles en brouillon programmés aux dates indiquées. Relis
> `content.raw` après chaque POST, pose les meta Yoast des pages en WP-CLI, purge le cache.

La skill `wordpress-ops-ecole-naturo` impose la route : `POST /wp/v2/posts/<id>` et
`POST /wp/v2/pages/<id>` via `run_api_function`, meta Yoast des **pages** en WP-CLI
(`wp post meta update <id> _yoast_wpseo_title "…"` puis `wp yoast index`).

### Route 2 : script `script/wp-publish.mjs` (mot de passe d'application)

Créer un mot de passe d'application dans wp-admin (Utilisateurs → Profil), puis, depuis la
racine du dépôt :

```bash
cd /c/chemin/vers/naturo-pro
export WP_URL="https://ecole-naturo.fr" WP_USER="<login>" WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
node script/wp-publish.mjs docs/seo/2026-09-cluster-animal            # dry-run
node script/wp-publish.mjs docs/seo/2026-09-cluster-animal --apply --only devenir-naturopathe-animalier-guide
node script/wp-publish.mjs docs/seo/2026-09-cluster-animal --apply
```

Le script refuse tout contenu contenant « CPF », ajoute le JSON-LD du `.meta.json` en fin de
corps, écrit les meta Yoast des articles, et affiche les commandes WP-CLI pour celles des pages.
Les blocs manuels (`*.md`) ne passent pas par le script.

**Insertions manuelles (`liens-retour.md`, `home-20379-renforts.md`) : ne jamais republier le
HTML rendu.** Récupérer le contenu brut (`GET /wp/v2/posts/<id>?context=edit` → `content.raw`,
ou `wp post get <id> --field=post_content`), y insérer le bloc, et renvoyer ce brut. Republier le
rendu détruit les délimiteurs de blocs Gutenberg (incident documenté dans `docs/SEO-TRACKING.md`).
Les deux réécritures complètes (8203, 42322) remplacent volontairement tout le corps.

### Route 3 : WP-CLI en SSH (`naturo-prod`)

Pour les meta Yoast des pages et la purge du cache, dans tous les cas :

```bash
ssh naturo-prod "cd /home/u379081112/domains/ecole-naturo.fr/public_html && wp post meta update 42322 _yoast_wpseo_title '<title>' && wp yoast index && rm -rf wp-content/wphb-cache/cache && wp cache flush"
```

## Checklist après publication

- [ ] `content.raw` relu après chaque POST (JSON-LD et tableaux présents).
- [ ] `yoast_head` de 42322, 20379 et 8203 contrôlé (title, description, aucun « CPF »).
- [ ] Cache purgé, rendu vérifié sur les trois pages.
- [ ] Search Console : inspection d'URL + demande d'indexation sur 42322, 20379, 8203.
- [ ] Ubersuggest / GSC : suivi hebdomadaire de « formation naturopathe à distance » (accueil) et
      « formation naturopathe animalier » (pivot) pendant 8 semaines.
- [ ] `docs/SEO-TRACKING.md` : reporter la date de mise en ligne et l'état.

## Ce qui reste à Julien

Chaque `.meta.json` détaille ses `notes_julien`. Les points transverses :

- Trancher les incohérences relevées entre pages sources : 28 vs 31 vs 32 avis Google selon la
  page, note 4,9 vs 5,0, tarif de consultation « 60 à 100 € » (page de vente) vs « 40 à 100 € »,
  « 600+ » vs « 800+ » personnes accompagnées par Eva. Les contenus livrés s'alignent sur 800+
  et 4,9/5 ; à harmoniser sur le site.
- Sur la page de vente 40874 : « IRC première cause de mortalité » non sourcé, « plantes comme le
  tea-tree » (le tea-tree est une huile essentielle), fleurs de Bach présentées sans réserve sur le
  niveau de preuve, et la mention d'une « convention de coopération avec un vétérinaire » sans
  base légale (relevée aussi dans l'ancien pivot, retirée de la réécriture).
- Page 42322 : le compte à rebours « réservé aux 50 premiers inscrits » tourne en permanence sans
  jamais se fermer. Risque DGCCRF (pratique commerciale trompeuse) et signal de confiance
  négatif : à dater réellement ou à retirer. Non modifié, hors périmètre de la réécriture.
- Accueil : 11 formulations à retirer ou reformuler listées au point 6 de
  `home-20379-renforts.md` (« meilleur rapport qualité-prix », « top 3 du marché », « formatrices
  agréées », dénigrement de concurrents, attribution à l'OMS non sourcée).
- Article existant 43796 (stress du chat) : ajouter un lien vers l'article fleurs de Bach pour
  éviter une concurrence interne sur « fleurs de Bach chat ».

- Confirmer l'auteur du cluster animal : Eva Mischler signe déjà les articles animaux, mais sa
  page ne mentionne pas de qualification animale. Compléter sa bio (ou nommer la formatrice du
  module animal) avant de publier, sinon le signal E-E-A-T reste faible sur ce sujet.
- Valider les `[À VÉRIFIER PAR JULIEN]` et `[CAS TERRAIN À VALIDER PAR EVA]` des articles.
- Images à la une des six nouveaux articles (skill `generation-images-sites`).
- Purger le CPF du reste du site. Audit du 14/09 sur les 123 URLs du sitemap : 5 pages en
  parlent encore. `/blog/reconversion-metiers-bien-etre-formations-cpf/` (16 mentions, l'article
  entier est construit dessus : à réécrire ou à passer en `noindex` + 301 vers
  `/financement-formation-naturopathie/`), `/blog/specialisations-apres-formation-naturopathe/`,
  `/blog/remede-grand-mere-cruralgie/`, `/blog/quest-ce-qu-un-naturopathe/` (1 mention chacun) et
  la catégorie Éducation (extraits). La page financement et les pages villes sont propres.
