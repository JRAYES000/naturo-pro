# Liens retour vers l'article pivot « Devenir naturopathe animalier » (cluster animal, 2026-09-14)

Cible de tous les liens ci-dessous : `https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/` (post 8203, slug inchangé).
Chaque bloc donne : la page, l'ancre d'insertion exacte (balise ou phrase existante dans le HTML rendu, fichiers `wp/*.html`), le HTML à coller, et la position (avant / après).

Toutes les URL utilisées sont présentes dans `wp/urls.txt`. Aucune URL n'a été devinée.

---

## 1. Page de vente 40874 : /formation-naturopathie-animale/

Source : `wp/page-40874-vente-animale.html`.

### 1.1 Encart contextuel dans « En quoi consiste le métier de praticien en naturopathie animale ? »

**Ancre d'insertion (paragraphe existant, à laisser tel quel) :**

```html
<p>En France, le métier de naturopathe animalier n&rsquo;est pas encadré par un diplôme d&rsquo;État. Une séance se facture en moyenne <strong>entre 40 et 100&nbsp;euros</strong>, selon la durée, la nature de l&rsquo;accompagnement et la zone géographique.</p>
```

**Insérer juste APRÈS ce paragraphe, AVANT `<h2>La naturopathie animale est-elle réglementée en France&nbsp;?</h2>` :**

```html
<p>Vous voulez une vue d&rsquo;ensemble avant de vous décider&nbsp;? Notre guide <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">Comment devenir naturopathe animalier</a> détaille le quotidien du praticien, les compétences attendues, les débouchés et les revenus réalistes, avec les sources.</p>
```

### 1.2 Encart dans la FAQ « Peut-on vivre de la naturopathie animale ? »

**Ancre d'insertion (bloc existant) :**

```html
<details>
<summary>Peut-on vivre de la naturopathie animale&nbsp;?</summary>
<p>La naturopathie animale est un secteur en croissance, exercé le plus souvent en profession libérale. Les revenus dépendent de votre activité, de votre zone géographique et de votre capacité à développer votre clientèle. Une séance se facture en moyenne entre 40 et 100&nbsp;euros.</p>
</details>
```

**Remplacer le `<p>` intérieur par :**

```html
<p>La naturopathie animale est un secteur en croissance, exercé le plus souvent en profession libérale. Les revenus dépendent de votre activité, de votre zone géographique et de votre capacité à développer votre clientèle. Une séance se facture en moyenne entre 40 et 100&nbsp;euros. Nous détaillons les fourchettes publiées, les variables et trois scénarios chiffrés dans la section <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/#salaire">salaire du naturopathe animalier</a> de notre guide du métier.</p>
```

**Obligatoire, pour garder la correspondance texte visible / données structurées :** dans le bloc `<script type="application/ld+json">` en tête de page, remplacer le `text` de la question « Peut-on vivre de la naturopathie animale ? » par la même phrase, sans balise :

```
"text": "La naturopathie animale est un secteur en croissance, exercé le plus souvent en profession libérale. Les revenus dépendent de votre activité, de votre zone géographique et de votre capacité à développer votre clientèle. Une séance se facture en moyenne entre 40 et 100 euros. Nous détaillons les fourchettes publiées, les variables et trois scénarios chiffrés dans la section salaire du naturopathe animalier de notre guide du métier."
```

### 1.3 Lien vers le guide gratuit

**Ancre d'insertion (carte « Propriétaire d'animaux », section « À qui s'adresse cette formation ? ») :**

```html
<h3>Propriétaire d&rsquo;animaux</h3>
<p>Vous souhaitez comprendre et accompagner le bien-être de vos compagnons au quotidien.</p>
```

**Remplacer le `<p>` par :**

```html
<p>Vous souhaitez comprendre et accompagner le bien-être de vos compagnons au quotidien. Pour commencer, recevez notre <a href="https://ecole-naturo.fr/guide-naturopathie-animale/">guide gratuit « Mon animal au naturel »</a> (chien et chat, 12 pages).</p>
```

### 1.4 Vérification CPF et points relevés sur la page 40874

- **Mention CPF : aucune.** Recherche insensible à la casse sur « CPF », « Mon Compte Formation », « compte formation » dans le HTML rendu et dans le JSON-LD : 0 occurrence. Rien à retirer.
- Incohérence à corriger : le JSON-LD `aggregateRating` indique `reviewCount: 28` alors que le texte visible dit « 4,9/5 sur Google (31 avis) ». Aligner sur le chiffre réel.
- Les deux liens relatifs de l'encadré d'introduction (`/blog/chien-senior-accompagner-son-vieillissement-au-naturel/` et `/blog/bien-etre-naturel-cheval-besoins-fondamentaux/`) correspondent à des URL du sitemap : conformes.
- Le H2 « Le programme de la formation en naturopathie animale » porte bien `id="programme"` : l'ancre `#programme` utilisée depuis l'article pivot fonctionne.

---

## 2. Guide gratuit 42894 : /guide-naturopathie-animale/

Source : `wp/page-42894-guide-animal.html`.

### 2.1 Encart « Envie d'en faire votre métier ? » vers le pivot

**Ancre d'insertion (dernier paragraphe de la section « Qui est derrière ce guide », classe `eeat`) :**

```html
<p>Notre conviction&nbsp;: la naturopathie animale sérieuse commence par la sécurité — connaître les limites, les doses et le moment où l&rsquo;on passe la main au vétérinaire. Pas de promesse miracle, pas de « détox »&nbsp;: des gestes documentés, et la liste de ce qu&rsquo;il ne faut surtout pas faire.</p>
```

**Insérer juste APRÈS ce paragraphe (avant la fermeture `</p></div>` du bloc) :**

```html
<p><strong>Envie d&rsquo;en faire votre métier&nbsp;?</strong> Notre guide <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">devenir naturopathe animalier</a> explique le cadre légal, ce qu&rsquo;une bonne formation doit contenir, les revenus réalistes et les débouchés.</p>
```

### 2.2 Lien vers la page de vente

Deux emplacements ; le premier corrige une URL absente du sitemap, le second est contextuel.

**a) Pied de page légal (obligatoire).** Ancre existante :

```html
<p> <strong>Pour aller plus loin :</strong> <a href="https://ecole-naturo.fr/formation-naturopathie/">découvrir notre formation de naturopathie</a> · <a href="https://ecole-naturo.fr/blog/">lire notre blog</a> </div>
```

L'URL `https://ecole-naturo.fr/formation-naturopathie/` **n'existe pas dans le sitemap** (`wp/urls.txt`). Remplacer par :

```html
<p> <strong>Pour aller plus loin :</strong> <a href="https://ecole-naturo.fr/formation-naturopathie-animale/">découvrir notre formation en naturopathie animale</a> · <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">lire le guide du métier</a> · <a href="https://ecole-naturo.fr/blog/">lire notre blog</a> </div>
```

**b) FAQ « Pourquoi offrez-vous ce guide ? »** Ancre existante :

```html
<div class="a">Parce qu&rsquo;il reflète la pédagogie de notre école : du concret, des sources, des limites claires. Si le contenu vous est utile, vous saurez à quoi ressemble un cours École Naturo — et si le bien-être au naturel vous passionne au point d&rsquo;en faire un métier, vous saurez où nous trouver.</div>
```

Remplacer par :

```html
<div class="a">Parce qu&rsquo;il reflète la pédagogie de notre école : du concret, des sources, des limites claires. Si le contenu vous est utile, vous saurez à quoi ressemble un cours École Naturo. Et si le bien-être au naturel vous passionne au point d&rsquo;en faire un métier, notre <a href="https://ecole-naturo.fr/formation-naturopathie-animale/">formation en naturopathie animale à distance</a> est faite pour vous.</div>
```

### 2.3 Points relevés sur la page 42894

- Mention CPF : aucune.
- `https://ecole-naturo.fr/politique-de-confidentialite/` (4 occurrences, dans les mentions de consentement) n'est pas dans le sitemap ; le sitemap contient `https://ecole-naturo.fr/politiques-de-confidentialite/` (avec un s). Vérifier qu'une redirection existe, sinon corriger les 4 liens.
- Chiffre « 5,0/5 — 31 avis vérifiés » sur cette page contre « 4,9/5 (31 avis) » sur la page de vente : harmoniser.
- La page contient des emoji (pictogrammes dans la barre de confiance et sur les boutons) et des tirets cadratins. Hors périmètre de cette mission, mais contraire aux règles éditoriales du brief : à traiter lors d'une prochaine passe sur cette page.

---

## 3. Les 5 satellites : une phrase contextuelle dans le corps, ancre différente à chaque fois

Chaque insertion se place dans la section « rôle du naturopathe animalier » de l'article (corps, pas pied de page), juste avant le bouton `<p><a class="cta" href="https://ecole-naturo.fr/formation-naturopathie-animale/">Découvrir la formation en naturopathie animale</a></p>`. Le lien vers la page de vente existant est conservé.

### 3.1 BARF chien (post 43792) : /blog/barf-chien-alimentation-naturelle-guide-complet/

Ancre : « comment devenir naturopathe animalier »

**Ancre d'insertion (paragraphe existant, section « BARF et naturopathie animale : quel est le rôle du praticien ? ») :**

```html
<p>Le bilan d&rsquo;hygiène de vie est réalisé par un praticien en naturopathie animale. Il permet précisément d&rsquo;évaluer si une transition vers une alimentation naturelle est adaptée à la situation particulière de votre chien.</p>
```

**Insérer APRÈS :**

```html
<p>Ce rôle de conseil vous attire&nbsp;? Notre guide explique <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">comment devenir naturopathe animalier</a>&nbsp;: cadre légal, contenu d&rsquo;une bonne formation, revenus réalistes et débouchés.</p>
```

### 3.2 Cheval (post 43805) : /blog/bien-etre-naturel-cheval-besoins-fondamentaux/

Ancre : « le métier de naturopathe animalier »

**Ancre d'insertion (paragraphe existant, section « Le rôle du naturopathe animalier auprès du cheval », se termine par) :**

```html
[...] seul habilité à intervenir sur le plan médical (article L.243-1 du Code rural et de la pêche maritime).</p>
```

**Insérer APRÈS ce paragraphe :**

```html
<p>Les écuries et les centres équestres figurent parmi les débouchés décrits dans notre article sur <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">le métier de naturopathe animalier</a>, qui présente aussi la spécialisation équine et la formation nécessaire.</p>
```

### 3.3 Chien senior (post 43802) : /blog/chien-senior-accompagner-son-vieillissement-au-naturel/

Ancre : « ce que fait un naturopathe animalier au quotidien »

**Ancre d'insertion (paragraphe existant, section « Le rôle du naturopathe animalier auprès du chien senior », se termine par) :**

```html
[...] dont les besoins évoluent rapidement et nécessitent des réajustements réguliers.</p>
```

**Insérer APRÈS ce paragraphe :**

```html
<p>Pour comprendre <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">ce que fait un naturopathe animalier au quotidien</a>, de la formation aux revenus, consultez notre guide complet du métier.</p>
```

### 3.4 Plantes toxiques chien et chat (post 43799) : /blog/phytotherapie-chien-chat-plantes-toxiques/

Ancre : « devenir praticien en naturopathie animale »

**Ancre d'insertion (paragraphe existant, section « Le rôle du naturopathe animalier en phytothérapie », se termine par) :**

```html
[...] avant de proposer un accompagnement naturel adapté, incluant si pertinent des conseils de phytothérapie raisonnée.</p>
```

**Insérer APRÈS ce paragraphe (avant `<p class="aside-link">Retrouvez également notre guide [...]`) :**

```html
<p>La connaissance des toxicités espèce par espèce est l&rsquo;une des compétences clés que nous détaillons dans notre guide pour <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">devenir praticien en naturopathie animale</a>.</p>
```

### 3.5 Stress du chat (post 43796) : /blog/stress-chat-solutions-naturelles/

Ancre : « guide du métier de naturopathe animalier »

**Ancre d'insertion (paragraphe existant, section « Le rôle du naturopathe animalier face au stress du chat », se termine par) :**

```html
[...] fera l&rsquo;objet d&rsquo;un article dédié au bilan d&rsquo;hygiène de vie en naturopathie animale, à paraître prochainement sur ecole-naturo.fr.</p>
```

**Insérer APRÈS ce paragraphe (avant `<p class="aside-link">Un chien à la maison lui aussi ? [...]`) :**

```html
<p>Si l&rsquo;accompagnement du bien-être félin vous donne envie d&rsquo;aller plus loin, notre <a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">guide du métier de naturopathe animalier</a> présente la formation, le cadre légal et les débouchés.</p>
```

### 3.6 Option, en complément (pied de page, non obligatoire)

Dans chacun des 5 articles, la liste `<ul class="maillage-list">` sous `<h3>Pour aller plus loin sur ecole-naturo.fr</h3>` peut recevoir une ligne supplémentaire :

```html
<li><a href="https://ecole-naturo.fr/blog/devenir-naturopathe-animalier-guide/">Devenir naturopathe animalier : métier, formation, salaire et débouchés</a></li>
```

### 3.7 Points relevés sur les satellites

- Mention CPF : aucune dans les 5 articles.
- Les 5 articles annoncent « un article dédié au bilan d'hygiène de vie, à paraître prochainement ». Le pivot ne le remplace pas (il décrit le bilan en cinq temps, sans l'approfondir). Soit publier cet article, soit reformuler ces phrases : `[LIEN À CRÉER : le bilan d'hygiène de vie en naturopathie animale]`.
- Chien senior (43802) et plantes toxiques (43799) parlent d'un « futur article » l'un vers l'autre alors que les deux sont publiés : remplacer par les liens réels (`/blog/chien-senior-accompagner-son-vieillissement-au-naturel/` et `/blog/phytotherapie-chien-chat-plantes-toxiques/`). Stress chat (43796) liste « Phytothérapie animale (à publier) » dans « Pour aller plus loin » : l'article existe, poser le lien.
- Règle des 28 jours : les 5 satellites sont publiés depuis le 17 juillet 2026 (plus de 28 jours). Les liens vers le pivot sont latéraux (article vers article du même cluster), donc non concernés par la barrière.

---

## Les 8 vérifications dures (§2 du template durci), appliquées à ce livrable

| # | Vérification | Verdict |
|---|---|---|
| 1 | Auteur réel, nommé, qualifié | Sans objet pour des insertions de liens (aucun nouveau contenu signé). Les pages cibles restent signées Eva Mischler / équipe pédagogique. |
| 2 | Aucune affirmation santé non sourcée | Conforme : les phrases insérées ne contiennent aucune affirmation de santé. |
| 3 | Aucune promesse thérapeutique | Conforme : vocabulaire « accompagnement », « bien-être », « conseil ». |
| 4 | Aucun chiffre, étude ou source inventé | Conforme : le seul chiffre repris (« entre 40 et 100 euros ») provient de la page 40874 elle-même. « 12 pages » provient de la page 42894. |
| 5 | Aucune URL interne devinée | Conforme : 4 URL utilisées (pivot, page de vente, guide, blog), toutes dans `wp/urls.txt`. Deux URL existantes non conformes signalées (`/formation-naturopathie/`, `/politique-de-confidentialite/`). |
| 6 | Information gain démontrable | Sans objet (maillage). Les ancres sont contextuelles, 7 formulations différentes, aucune en exact-match pur. |
| 7 | Chiffres canoniques conformes | Conforme : aucun chiffre de l'école ajouté ; incohérence 28 / 31 avis et 4,9 / 5,0 signalée pour correction. |
| 8 | Journal renseigné | Voir ci-dessous. |

## Journal

- [ERREUR CONSTATÉE] Le guide gratuit 42894 pointe vers `https://ecole-naturo.fr/formation-naturopathie/`, URL absente du sitemap, et vers `/politique-de-confidentialite/` (le sitemap a `/politiques-...`). Des pages créées en juin 2026 contiennent donc déjà des liens internes non vérifiés.
  → Règle à ajouter : à chaque passage sur une page, extraire tous ses `href` internes et les confronter au sitemap, même si la page n'est pas l'objet de la mission ; signaler chaque écart dans le livrable.
- [ERREUR CONSTATÉE] Les 5 satellites annoncent des articles « à paraître » (bilan d'hygiène de vie, chien senior, phytothérapie) alors que deux d'entre eux sont publiés depuis juillet : les promesses de lien n'ont jamais été tenues.
  → Règle à ajouter : toute mention « à paraître » dans un article publié doit être consignée dans une liste de dettes de maillage, revue à chaque nouvelle publication du cluster.
- [ERREUR CONSTATÉE] Modifier la réponse visible d'une FAQ sans modifier le JSON-LD FAQPage (page 40874) casserait la correspondance texte / données structurées.
  → Règle à ajouter : toute insertion dans une FAQ balisée livre systématiquement le texte JSON-LD mis à jour, sans balises.
