# Accueil 20379 (https://ecole-naturo.fr/) : blocs de renfort prêts à coller

Date : 2026-09-14. Source lue : `wp/home-20379.html`, `wp/home-20379.meta.json`, `wp/page-home.json` (schema Yoast), `wp/urls.txt`.
Règle de ce fichier : **aucune réécriture du corps**. Uniquement des blocs à AJOUTER ou des remplacements CIBLÉS, chacun avec son ancre exacte (texte de balise existant). Le template natif de l'accueil et son CSS ne sont pas touchés ; les blocs ajoutés réutilisent les classes déjà présentes sur la page (`ecn-sec`, `ecn-wrap`, `ecn-h2`, `ecn-q`, `ecn-a`).

Aucune mention du CPF n'existe sur l'accueil (0 occurrence de « CPF » et « Compte Formation » dans la source) : rien à retirer sur ce point. Le mot « Qualiopi » n'apparaît pas dans la source : il n'est donc utilisé nulle part ci-dessous (voir point 6 pour la phrase ambiguë qui y fait allusion).

---

## 1. Balises Yoast (remplacement)

Où : Yoast SEO, onglet SEO de la page 20379. Remplace les champs existants (`Formation Naturopathe à Distance | École Naturo` / `École de naturopathie et sophrologie 100 % à distance, dès 1 490 €…`).

| Champ | Valeur | Longueur |
|---|---|---|
| `yoast_title` | `Formation naturopathe à distance : 1 200 h, 6 ou 24 mois` | 56 car. |
| `yoast_desc` | `Cursus certifiant de 1 200 h, 100 % en ligne, en 6 ou 24 mois. Dès 1 490 € ou 6x sans frais. 800 apprenants, 94 % de satisfaction, 4,9/5 sur Google.` | 148 car. |
| `focus_kw` | `formation naturopathe à distance` | |

Chaque chiffre de la description est lu sur la page : 1 200 h, 6 ou 24 mois, 1 490 € / 6x sans frais, 800 apprenants, 94 % de satisfaction, 4,9/5 sur Google.

---

## 2. Bloc E-E-A-T « Qui enseigne et qui certifie » (ajout)

Où : **juste APRÈS** l'aside existant qui se termine par :

```html
<a href="https://ecole-naturo.fr/formation-sophrologie/">Formation sophrologie : notre cursus certifié</a> — 40 h d&rsquo;outils sophrologiques intégrés à notre formation de naturopathe.</p></aside>
```

et **juste AVANT** `<section class="ensn-admission-contact">`.

Toutes les URL ci-dessous sont dans `wp/urls.txt` (eva-mischler, sabrina-dussart, solene-geoffroy, notre-equipe, qui-sommes-nous, conditions-generales-de-vente, reglement-interieur, mentions-legales, politiques-de-confidentialite). Le téléphone et l'adresse e-mail figurent dans les sources (pied de page de la page 42322, FAQ « certificat » de la page 42322, schema Yoast de l'accueil) ; les horaires viennent de l'accueil (« Du lundi au samedi, de 11h à 20h »).

```html
<section class="ecn-sec" id="qui-enseigne"><div class="ecn-wrap">
<h2 class="ecn-h2">Qui enseigne et qui certifie</h2>
<p>Les cours sont conçus et animés par <strong>trois professionnelles en activité</strong>, joignables sur le forum privé tout au long de votre formation :</p>
<ul>
<li><a href="https://ecole-naturo.fr/eva-mischler/"><strong>Eva Mischler</strong></a>, naturopathe et formatrice depuis 2017, plus de 800 personnes accompagnées en consultations, ateliers et conférences. Elle assure les masterclasses de naturopathie et la vérification des contenus de ce site.</li>
<li><a href="https://ecole-naturo.fr/sabrina-dussart/"><strong>Sabrina Dussart</strong></a>, naturopathe formée au CENATHO (école FENA), diplômée en psychologie, autrice aux éditions Jouvence. Elle intervient sur l&rsquo;accompagnement psycho-émotionnel et les techniques psycho-corporelles.</li>
<li><a href="https://ecole-naturo.fr/solene-geoffroy/"><strong>Solène Geoffroy</strong></a>, diététicienne-nutritionniste diplômée d&rsquo;État, formatrice en BTS Diététique. Elle enseigne la nutrition et prépare aux blocs de compétences du BTS.</li>
</ul>
<p>Vous êtes suivi(e) côté administratif et orientation par <strong>Alex Ostwald</strong>, responsable pédagogique, et <strong>Aline Garcia</strong>, conseillère pédagogique. L&rsquo;équipe complète est présentée sur <a href="https://ecole-naturo.fr/notre-equipe/">notre page équipe</a> et l&rsquo;histoire de l&rsquo;école sur <a href="https://ecole-naturo.fr/qui-sommes-nous/">qui sommes-nous</a>.</p>
<h3>Qui délivre le certificat</h3>
<p>Le certificat de praticien professionnel de conseiller(ère) en diététique et naturopathie et l&rsquo;attestation de suivi de formation sont délivrés par l&rsquo;<strong>École de Naturopathie &amp; Sophrologie (SAS)</strong>, organisme de formation déclaré sous le numéro <strong>11757002275</strong> auprès du préfet de la région Île-de-France, SIRET 924 997 539 00011, siège au 229 rue Saint-Honoré, 75001 Paris. Cette déclaration ne vaut pas agrément de l&rsquo;État : le certificat atteste d&rsquo;un parcours professionnalisant, non assimilable à un diplôme d&rsquo;État.</p>
<h3>Nous contacter</h3>
<p>Par e-mail : <a href="mailto:contact@ecole-naturo.fr">contact@ecole-naturo.fr</a>. Par téléphone : <a href="tel:+33756813444">07 56 81 34 44</a>, du lundi au samedi de 11 h à 20 h. Ou en réservant un <a href="https://ecole-naturo.fr/rdv/">rendez-vous téléphonique gratuit de 30 minutes</a>.</p>
<h3>Conditions de vente, d&rsquo;annulation et de rétractation</h3>
<p>Les modalités de paiement, d&rsquo;annulation et le droit de rétractation de 14 jours sont détaillés dans nos <a href="https://ecole-naturo.fr/conditions-generales-de-vente/">conditions générales de vente</a>. Le fonctionnement de la formation est décrit dans le <a href="https://ecole-naturo.fr/reglement-interieur/">règlement intérieur</a>. Voir aussi nos <a href="https://ecole-naturo.fr/mentions-legales/">mentions légales</a> et notre <a href="https://ecole-naturo.fr/politiques-de-confidentialite/">politique de confidentialité</a>.</p>
</div></section>
```

Point à vérifier avant de coller : le « droit de rétractation de 14 jours » est repris de la page 42322 (« Paiement sécurisé · rétractation 14 jours »). Confirmer que les CGV le formulent bien ainsi, sinon retirer les mots « et le droit de rétractation de 14 jours ».

---

## 3. Section « Reconnaissance et cadre légal, en toute transparence » (ajout)

Où : **juste AVANT** la balise existante :

```html
<section class="ecn-sec" id="faq"><div class="ecn-wrap"><h2 class="ecn-h2">Questions fréquentes sur la formation en naturopathie</h2>
```

C'est l'intention dominante de la SERP sur « formation naturopathie » (relevé du 26/07/2026 : « reconnue par l'État » en tête des recherches associées). Les deux liens cibles sont dans `wp/urls.txt`.

```html
<section class="ecn-sec ecn-cream" id="reconnaissance"><div class="ecn-wrap">
<h2 class="ecn-h2">Reconnaissance et cadre légal, en toute transparence</h2>
<p class="ecn-appr-lead"><strong>La naturopathie n&rsquo;est pas une profession réglementée en France.</strong> Aucune école, publique ou privée, ne délivre de diplôme d&rsquo;État de naturopathe, et notre certification n&rsquo;est pas inscrite au RNCP. Notre certificat de praticien professionnel atteste d&rsquo;un parcours professionnalisant de 1 200 heures ; il ne vaut ni diplôme d&rsquo;État, ni agrément. Voici précisément ce qu&rsquo;il garantit, et ce qu&rsquo;il ne garantit pas.</p>
<h3>Ce que la certification garantit</h3>
<ul>
<li>Un organisme de formation <strong>déclaré</strong> sous le numéro 11757002275 auprès du préfet de la région Île-de-France, dont les références légales sont publiques (SIRET 924 997 539 00011).</li>
<li>Un cursus de <strong>1 200 heures</strong>, dont 144 h de masterclasses vidéo, suivi à distance avec des formatrices identifiées et joignables.</li>
<li>À l&rsquo;issue : un <strong>certificat de praticien professionnel</strong> de conseiller(ère) en diététique et naturopathie et une attestation de suivi de formation.</li>
<li>Des indicateurs publiés : 800 apprenants accompagnés depuis 2024, 94 % de satisfaction, 4,9/5 sur Google.</li>
</ul>
<h3>Ce qu&rsquo;elle ne garantit pas</h3>
<ul>
<li>Elle n&rsquo;est <strong>pas un diplôme d&rsquo;État</strong> et n&rsquo;est pas inscrite au RNCP.</li>
<li>Elle ne confère <strong>pas le statut de professionnel de santé</strong> : le naturopathe-conseil accompagne et éduque, il ne pose pas de diagnostic, ne prescrit pas et ne se substitue jamais à un médecin.</li>
<li>Elle ne remplace pas la pratique supervisée en cabinet, que vous pouvez organiser en complément auprès d&rsquo;un praticien.</li>
</ul>
<h3>Un diplôme d&rsquo;État en option : le BTS Diététique</h3>
<p>Notre parcours prépare, en option, aux blocs de compétences du <strong>BTS Diététique</strong>, qui est un diplôme d&rsquo;État (niveau bac requis pour cette option uniquement). Les taux de présence à l&rsquo;examen et de réussite seront publiés dès réception des résultats officiels de la session de mai/juin 2026.</p>
<dl>
<dt>Diplôme d&rsquo;État</dt><dd>Délivré par l&rsquo;État (par exemple le BTS Diététique). Il n&rsquo;en existe aucun en naturopathie.</dd>
<dt>Titre RNCP</dt><dd>Certification enregistrée au Répertoire national des certifications professionnelles. Notre certificat de naturopathie n&rsquo;y est pas inscrit.</dd>
<dt>Certificat d&rsquo;école</dt><dd>Document délivré par l&rsquo;organisme de formation à l&rsquo;issue du parcours. C&rsquo;est le cas de notre certificat de praticien professionnel.</dd>
<dt>Attestation de suivi</dt><dd>Justificatif des heures de formation suivies, remis avec le certificat.</dd>
</dl>
<p>Pour aller plus loin : <a href="https://ecole-naturo.fr/blog/formation-naturopathie-reconnue-par-letat/">formation naturopathie reconnue par l&rsquo;État, ce qui existe vraiment</a> et <a href="https://ecole-naturo.fr/diplome-naturopathie/">diplôme de naturopathie : ce que les écoles délivrent réellement</a>. Pour comparer les cursus sur des critères vérifiables : <a href="https://ecole-naturo.fr/comparatif-formations-naturopathie/">notre comparatif des formations en naturopathie</a>.</p>
</div></section>
```

Notes : « 144 h de masterclasses vidéo » est lu sur l'accueil (bloc Programme). Les définitions du `<dl>` sont générales et ne contiennent aucun chiffre. La phrase « notre certification n'est pas inscrite au RNCP » est volontairement limitée à l'école (la page 42322 généralise à « toutes les formations de naturopathie », ce qui peut devenir faux : [À VÉRIFIER PAR JULIEN]).

---

## 4. FAQ enrichie (remplacement)

Où : dans `<section class="ecn-sec" id="faq">`, remplacer **tout le contenu de `<div class="ecn-faq">`** (les 10 `<details class="ecn-q">` existants, du premier `<details class="ecn-q"><summary><h3>Le certificat de praticien de l’École Naturo est-il reconnu ?</h3>` au dernier `</details>` avant `</div></div></section>`) par les 10 blocs ci-dessous. Le H2 et le `<div class="ecn-sub">` restent.

Trois questions opérationnelles existantes (« L'école délivre-t-elle des conventions de stage ? », « Quand puis-je commencer ma formation ? », « Comment suis-je évalué(e) pendant la formation ? ») peuvent être conservées **à la suite** des 10 nouvelles, telles quelles : elles ne figurent pas dans le schema FAQPage, ce qui est autorisé.

Chaque réponse fait 40 à 60 mots (comptage : 58, 54, 54, 58, 58, 56, 55, 59, 57, 53), est autonome, et correspond mot pour mot au schema du point 5.

```html
<details class="ecn-q"><summary><h3>Le certificat de praticien de l&rsquo;École Naturo est-il reconnu par l&rsquo;État ?</h3></summary><div class="ecn-a"><p>Non, et aucun certificat de naturopathie ne l&rsquo;est : <strong>la naturopathie n&rsquo;est pas une profession réglementée en France</strong>, aucune école ne délivre de diplôme d&rsquo;État et notre certification n&rsquo;est pas inscrite au RNCP. Notre certificat de praticien professionnel de conseiller(ère) en diététique et naturopathie atteste d&rsquo;un parcours de 1 200 heures suivi auprès d&rsquo;un organisme de formation déclaré.</p></div></details>
<details class="ecn-q"><summary><h3>Quels documents recevez-vous à la fin de la formation ?</h3></summary><div class="ecn-a"><p>Vous obtenez deux documents : un <strong>certificat de praticien professionnel de conseiller(ère) en diététique et naturopathie</strong> et une <strong>attestation de suivi de formation</strong>. Ils sont délivrés après un délai minimum de 3 mois d&rsquo;inscription, une fois les questionnaires d&rsquo;auto-évaluation réalisés et une première connexion au forum Discord effectuée. Il n&rsquo;y a pas d&rsquo;examen final.</p></div></details>
<details class="ecn-q"><summary><h3>Combien de temps dure la formation de naturopathe à distance ?</h3></summary><div class="ecn-a"><p>Le cursus représente <strong>1 200 heures de formation</strong>. Vous le suivez en <strong>6 mois</strong> avec la formule intensive ou en <strong>24 mois</strong> avec la formule sérénité. Les sessions démarrent chaque premier lundi du mois, par groupes de 40 personnes maximum, et vos ressources pédagogiques restent accessibles à vie, bien après la fin de l&rsquo;accompagnement.</p></div></details>
<details class="ecn-q"><summary><h3>Quel rythme de travail prévoir chaque semaine ?</h3></summary><div class="ecn-a"><p>Comptez <strong>environ 2 heures par semaine en formule 24 mois</strong>, avec 2 modules recommandés par semaine, et un rythme plus soutenu en formule 6 mois. Le fil hebdomadaire est fixe : études de cas le lundi, visioconférence collective le dimanche de 18 h à 19 h, toutes enregistrées. Une pause de 30 jours maximum est possible sur demande.</p></div></details>
<details class="ecn-q"><summary><h3>Combien coûte la formation et peut-on payer en plusieurs fois ?</h3></summary><div class="ecn-a"><p>La formation coûte <strong>1 490 € en formule intensive</strong> (6 mois), réglable en 6 mensualités de 248 € sans frais, ou <strong>3 000 € en formule sérénité</strong> (24 mois), réglable en 10 mensualités de 300 € sans frais, par carte bancaire et sans frais cachés. Les grandes écoles présentielles facturent de 11 500 € à 12 995 €.</p></div></details>
<details class="ecn-q"><summary><h3>Comment suis-je accompagné(e) pendant la formation ?</h3></summary><div class="ecn-a"><p>Trois formatrices en activité répondent à vos questions, sans limite, sur le forum privé Discord, <strong>sous 48 heures ouvrées</strong>. Chaque dimanche, une visioconférence collective limitée à 40 personnes traite un thème ou un cas. En formule 24 mois, vous bénéficiez en plus de 6 visioconférences privées en 1-to-1 et d&rsquo;un coaching business pour lancer votre activité.</p></div></details>
<details class="ecn-q"><summary><h3>Quels sont les débouchés après la formation ?</h3></summary><div class="ecn-a"><p>Vous pouvez exercer comme <strong>praticien naturopathe en cabinet libéral</strong>, à domicile ou en consultation en ligne, ou comme conseiller en naturopathie en magasin bio, parapharmacie, spa ou centre de bien-être. D&rsquo;autres débouchés existent : ateliers d&rsquo;hygiène de vie en entreprise, conférences, contenus spécialisés. Le naturopathe accompagne et éduque, il ne pose pas de diagnostic médical.</p></div></details>
<details class="ecn-q"><summary><h3>Quelle différence avec une formation en présentiel ?</h3></summary><div class="ecn-a"><p>Le cursus se suit <strong>sans aucun jour de présentiel obligatoire</strong> : plateforme accessible 24 h/24, vidéos, PDF, visioconférences en direct et replays. Vous économisez déplacements et hébergement, pour 1 490 € à 3 000 € contre 11 500 € à 12 995 € en présentiel. La pratique clinique supervisée en cabinet peut s&rsquo;organiser en complément auprès d&rsquo;un praticien local.</p></div></details>
<details class="ecn-q"><summary><h3>Faut-il un diplôme ou des prérequis pour s&rsquo;inscrire ?</h3></summary><div class="ecn-a"><p>Non. <strong>Aucun diplôme ni compétence préalable n&rsquo;est exigé</strong> pour le certificat de praticien professionnel, avec ou sans parcours médical. L&rsquo;enseignement démarre de zéro et progresse du simple vers le complexe, avec un glossaire intégré. Seule exception : le niveau bac est requis si vous choisissez de préparer en option le BTS Diététique, qui est un diplôme d&rsquo;État.</p></div></details>
<details class="ecn-q"><summary><h3>Peut-on se reconvertir en naturopathe à 40 ou 50 ans ?</h3></summary><div class="ecn-a"><p>Oui. <strong>La reconversion professionnelle est le premier profil de nos élèves</strong> : enseignement, comptabilité, commerce, banque, ressources humaines, mais aussi infirmiers, kinés ou coachs qui élargissent leur pratique. Aucune condition d&rsquo;âge n&rsquo;est exigée à l&rsquo;inscription, et le rythme à distance permet de se former en parallèle d&rsquo;un emploi, sans démissionner avant d&rsquo;être prêt(e).</p></div></details>
```

Point à confirmer avant publication (question 10) : « Aucune condition d'âge n'est exigée à l'inscription » n'est pas écrit dans les sources actuelles ; c'est la lecture logique de « ouverte à tout le monde, peu importe votre niveau » et « aucun diplôme ni compétence préalable ». Si une condition existe (majorité, par exemple), reformuler la phrase dans le HTML **et** dans le schema.

---

## 5. JSON-LD complet (ajout)

Où : en fin de contenu, **juste APRÈS** le dernier `<div>` existant qui commence par `<strong>Formation naturopathe près de chez vous :</strong>` (liste des villes) et se termine par `Clermont-Ferrand</a></div>`.

Cohérence texte visible / schema, vérifiée élément par élément :

| Élément du schema | Où il est affiché sur l'accueil (après ajout des blocs 2, 3, 4) |
|---|---|
| Nom, adresse, SIRET, NDA | Bloc « références légales » existant + bloc 2 |
| Téléphone, e-mail, horaires | Bloc 2 (aujourd'hui le téléphone n'est pas affiché sur l'accueil : le bloc 2 corrige ce point) |
| Logo | Fichier déjà déclaré par Yoast (`cropped-cropped-logo-centre_lwsoptimized.jpg`), affiché dans l'en-tête du site |
| Formatrices, titres, réseaux | Section « Vos formatrices » existante (liens Instagram / LinkedIn / site présents dans la source) |
| Fondateur Antoine Rayes | Déjà dans le schema Yoast ; [À VÉRIFIER PAR JULIEN] qu'il est nommé sur /qui-sommes-nous/ ou /notre-equipe/, sinon retirer la clé `founder` |
| 1 200 h, 6 / 24 mois, 1 490 € / 3 000 €, +25 / +100 visios, 6 visios 1-to-1 | Hero + section Tarifs existante |
| Note 4,9/5 sur 32 avis | Badge Google + section avis + « Nos indicateurs » |
| 10 Q/R | Bloc 4, texte identique |

Attention aux doublons : Yoast émet déjà un `Organization` / `LocalBusiness` / `EducationalOrganization` avec l'@id `https://ecole-naturo.fr/#organization`. Le bloc ci-dessous **réutilise ce même @id** pour que les deux descriptions fusionnent au lieu de créer une seconde entité. Yoast n'émet ni `Course` ni `FAQPage`. Remplacer les deux valeurs `[À COMPLÉTER PAR JULIEN …]` du tableau `sameAs` (ou supprimer ces lignes) **avant** de coller, puis tester sur https://search.google.com/test/rich-results et https://validator.schema.org/.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "EducationalOrganization",
      "@id": "https://ecole-naturo.fr/#organization",
      "name": "École de Naturopathie & Sophrologie",
      "alternateName": "École Naturo",
      "legalName": "ECOLE DE NATUROPATHIE & SOPHROLOGIE",
      "url": "https://ecole-naturo.fr/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://ecole-naturo.fr/wp-content/uploads/2025/08/cropped-cropped-logo-centre_lwsoptimized.jpg",
        "width": 512,
        "height": 512
      },
      "description": "Organisme de formation à distance en naturopathie, diététique et nutrition, déclaré sous le numéro 11757002275 auprès du préfet de la région Île-de-France.",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "229 rue Saint-Honoré",
        "postalCode": "75001",
        "addressLocality": "Paris",
        "addressCountry": "FR"
      },
      "telephone": "+33756813444",
      "email": "contact@ecole-naturo.fr",
      "contactPoint": [
        {
          "@type": "ContactPoint",
          "contactType": "conseil pédagogique",
          "telephone": "+33756813444",
          "email": "contact@ecole-naturo.fr",
          "availableLanguage": "fr",
          "areaServed": [
            "FR",
            "BE",
            "CH"
          ],
          "hoursAvailable": {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday"
            ],
            "opens": "11:00",
            "closes": "20:00"
          }
        }
      ],
      "identifier": [
        {
          "@type": "PropertyValue",
          "propertyID": "SIRET",
          "value": "924 997 539 00011"
        },
        {
          "@type": "PropertyValue",
          "propertyID": "Numéro de déclaration d'activité (NDA)",
          "value": "11757002275"
        }
      ],
      "founder": {
        "@type": "Person",
        "name": "Antoine Rayes",
        "jobTitle": "Président et fondateur"
      },
      "employee": [
        {
          "@id": "https://ecole-naturo.fr/#eva-mischler"
        },
        {
          "@id": "https://ecole-naturo.fr/#sabrina-dussart"
        },
        {
          "@id": "https://ecole-naturo.fr/#solene-geoffroy"
        }
      ],
      "sameAs": [
        "https://www.facebook.com/people/Ecole-Naturo/61575311985744/",
        "https://www.youtube.com/@ecole-naturo",
        "https://maps.google.com/?cid=1797251576494720555",
        "[À COMPLÉTER PAR JULIEN : URL Instagram de l'école]",
        "[À COMPLÉTER PAR JULIEN : URL LinkedIn de l'école]"
      ]
    },
    {
      "@type": "Course",
      "@id": "https://ecole-naturo.fr/#course",
      "name": "Formation naturopathe à distance",
      "description": "Cursus certifiant de 1 200 heures, 100 % en ligne, réalisable en 6 ou 24 mois : masterclasses en naturopathie, 14 cas cliniques, préparation au BTS Diététique en option et programme Naturopreneur. Certificat de praticien professionnel de conseiller(ère) en diététique et naturopathie.",
      "url": "https://ecole-naturo.fr/",
      "inLanguage": "fr",
      "image": "https://ecole-naturo.fr/wp-content/uploads/2025/10/formation-naturopathe-a-distance.png",
      "provider": {
        "@id": "https://ecole-naturo.fr/#organization"
      },
      "educationalCredentialAwarded": "Certificat de praticien professionnel de conseiller(ère) en diététique et naturopathie",
      "timeRequired": "PT1200H",
      "teaches": [
        "Fondements et philosophie de la naturopathie",
        "Systèmes et organes du corps",
        "Phytothérapie et remèdes naturels",
        "Techniques manuelles et énergétiques",
        "Immunité et psychologie",
        "Études de cas cliniques (14 cas)",
        "Préparation au BTS Diététique (option)",
        "Programme Naturopreneur : lancer son activité"
      ],
      "hasCourseInstance": [
        {
          "@type": "CourseInstance",
          "name": "Formule intensive, 6 mois",
          "courseMode": "online",
          "location": {
            "@type": "VirtualLocation",
            "url": "https://ecole-naturo.fr/"
          },
          "courseWorkload": "PT1200H",
          "courseSchedule": {
            "@type": "Schedule",
            "repeatFrequency": "Weekly",
            "repeatCount": 25,
            "duration": "PT1H"
          },
          "offers": {
            "@type": "Offer",
            "category": "Tuition",
            "price": "1490",
            "priceCurrency": "EUR",
            "availability": "https://schema.org/InStock",
            "url": "https://ecole-naturo.fr/#tarifs"
          },
          "instructor": [
            {
              "@id": "https://ecole-naturo.fr/#eva-mischler"
            },
            {
              "@id": "https://ecole-naturo.fr/#sabrina-dussart"
            },
            {
              "@id": "https://ecole-naturo.fr/#solene-geoffroy"
            }
          ],
          "description": "6 mois d'accompagnement, plus de 25 visioconférences collectives le dimanche soir, questions illimitées aux formatrices, ressources accessibles à vie. 1 490 € ou 6 mensualités de 248 € sans frais."
        },
        {
          "@type": "CourseInstance",
          "name": "Formule sérénité, 24 mois",
          "courseMode": "online",
          "location": {
            "@type": "VirtualLocation",
            "url": "https://ecole-naturo.fr/"
          },
          "courseWorkload": "PT1200H",
          "courseSchedule": {
            "@type": "Schedule",
            "repeatFrequency": "Weekly",
            "repeatCount": 100,
            "duration": "PT1H"
          },
          "offers": {
            "@type": "Offer",
            "category": "Tuition",
            "price": "3000",
            "priceCurrency": "EUR",
            "availability": "https://schema.org/InStock",
            "url": "https://ecole-naturo.fr/#tarifs"
          },
          "instructor": [
            {
              "@id": "https://ecole-naturo.fr/#eva-mischler"
            },
            {
              "@id": "https://ecole-naturo.fr/#sabrina-dussart"
            },
            {
              "@id": "https://ecole-naturo.fr/#solene-geoffroy"
            }
          ],
          "description": "24 mois d'accompagnement, plus de 100 visioconférences collectives, 6 visioconférences privées en 1-to-1, coaching business, ressources accessibles à vie. 3 000 € ou 10 mensualités de 300 € sans frais."
        }
      ],
      "offers": {
        "@type": "AggregateOffer",
        "lowPrice": "1490",
        "highPrice": "3000",
        "priceCurrency": "EUR",
        "offerCount": "2",
        "availability": "https://schema.org/InStock",
        "url": "https://ecole-naturo.fr/#tarifs"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "32",
        "bestRating": "5",
        "worstRating": "1"
      },
      "audience": {
        "@type": "EducationalAudience",
        "educationalRole": "adultes en reconversion professionnelle, professionnels de santé et du bien-être"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://ecole-naturo.fr/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Le certificat de praticien de l’École Naturo est-il reconnu par l’État ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Non, et aucun certificat de naturopathie ne l’est : la naturopathie n’est pas une profession réglementée en France, aucune école ne délivre de diplôme d’État et notre certification n’est pas inscrite au RNCP. Notre certificat de praticien professionnel de conseiller(ère) en diététique et naturopathie atteste d’un parcours de 1 200 heures suivi auprès d’un organisme de formation déclaré."
          }
        },
        {
          "@type": "Question",
          "name": "Quels documents recevez-vous à la fin de la formation ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Vous obtenez deux documents : un certificat de praticien professionnel de conseiller(ère) en diététique et naturopathie et une attestation de suivi de formation. Ils sont délivrés après un délai minimum de 3 mois d’inscription, une fois les questionnaires d’auto-évaluation réalisés et une première connexion au forum Discord effectuée. Il n’y a pas d’examen final."
          }
        },
        {
          "@type": "Question",
          "name": "Combien de temps dure la formation de naturopathe à distance ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Le cursus représente 1 200 heures de formation. Vous le suivez en 6 mois avec la formule intensive ou en 24 mois avec la formule sérénité. Les sessions démarrent chaque premier lundi du mois, par groupes de 40 personnes maximum, et vos ressources pédagogiques restent accessibles à vie, bien après la fin de l’accompagnement."
          }
        },
        {
          "@type": "Question",
          "name": "Quel rythme de travail prévoir chaque semaine ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Comptez environ 2 heures par semaine en formule 24 mois, avec 2 modules recommandés par semaine, et un rythme plus soutenu en formule 6 mois. Le fil hebdomadaire est fixe : études de cas le lundi, visioconférence collective le dimanche de 18 h à 19 h, toutes enregistrées. Une pause de 30 jours maximum est possible sur demande."
          }
        },
        {
          "@type": "Question",
          "name": "Combien coûte la formation et peut-on payer en plusieurs fois ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "La formation coûte 1 490 € en formule intensive (6 mois), réglable en 6 mensualités de 248 € sans frais, ou 3 000 € en formule sérénité (24 mois), réglable en 10 mensualités de 300 € sans frais, par carte bancaire et sans frais cachés. Les grandes écoles présentielles facturent de 11 500 € à 12 995 €."
          }
        },
        {
          "@type": "Question",
          "name": "Comment suis-je accompagné(e) pendant la formation ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Trois formatrices en activité répondent à vos questions, sans limite, sur le forum privé Discord, sous 48 heures ouvrées. Chaque dimanche, une visioconférence collective limitée à 40 personnes traite un thème ou un cas. En formule 24 mois, vous bénéficiez en plus de 6 visioconférences privées en 1-to-1 et d’un coaching business pour lancer votre activité."
          }
        },
        {
          "@type": "Question",
          "name": "Quels sont les débouchés après la formation ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Vous pouvez exercer comme praticien naturopathe en cabinet libéral, à domicile ou en consultation en ligne, ou comme conseiller en naturopathie en magasin bio, parapharmacie, spa ou centre de bien-être. D’autres débouchés existent : ateliers d’hygiène de vie en entreprise, conférences, contenus spécialisés. Le naturopathe accompagne et éduque, il ne pose pas de diagnostic médical."
          }
        },
        {
          "@type": "Question",
          "name": "Quelle différence avec une formation en présentiel ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Le cursus se suit sans aucun jour de présentiel obligatoire : plateforme accessible 24 h/24, vidéos, PDF, visioconférences en direct et replays. Vous économisez déplacements et hébergement, pour 1 490 € à 3 000 € contre 11 500 € à 12 995 € en présentiel. La pratique clinique supervisée en cabinet peut s’organiser en complément auprès d’un praticien local."
          }
        },
        {
          "@type": "Question",
          "name": "Faut-il un diplôme ou des prérequis pour s’inscrire ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Non. Aucun diplôme ni compétence préalable n’est exigé pour le certificat de praticien professionnel, avec ou sans parcours médical. L’enseignement démarre de zéro et progresse du simple vers le complexe, avec un glossaire intégré. Seule exception : le niveau bac est requis si vous choisissez de préparer en option le BTS Diététique, qui est un diplôme d’État."
          }
        },
        {
          "@type": "Question",
          "name": "Peut-on se reconvertir en naturopathe à 40 ou 50 ans ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Oui. La reconversion professionnelle est le premier profil de nos élèves : enseignement, comptabilité, commerce, banque, ressources humaines, mais aussi infirmiers, kinés ou coachs qui élargissent leur pratique. Aucune condition d’âge n’est exigée à l’inscription, et le rythme à distance permet de se former en parallèle d’un emploi, sans démissionner avant d’être prêt(e)."
          }
        }
      ]
    },
    {
      "@type": "Person",
      "@id": "https://ecole-naturo.fr/#eva-mischler",
      "name": "Eva Mischler",
      "jobTitle": "Naturopathe et formatrice",
      "url": "https://ecole-naturo.fr/eva-mischler/",
      "worksFor": {
        "@id": "https://ecole-naturo.fr/#organization"
      },
      "sameAs": [
        "https://www.linkedin.com/in/instinctnaturo/",
        "https://www.instagram.com/instinctnaturo/",
        "https://www.instinctnaturo.com/"
      ]
    },
    {
      "@type": "Person",
      "@id": "https://ecole-naturo.fr/#sabrina-dussart",
      "name": "Sabrina Dussart",
      "jobTitle": "Naturopathe CENATHO-FENA, autrice aux éditions Jouvence",
      "url": "https://ecole-naturo.fr/sabrina-dussart/",
      "worksFor": {
        "@id": "https://ecole-naturo.fr/#organization"
      },
      "sameAs": [
        "https://www.linkedin.com/in/sabrina-dussart-79b180152/",
        "https://www.instagram.com/sabrina.dussart/",
        "https://www.sabrina-dussart.com/"
      ]
    },
    {
      "@type": "Person",
      "@id": "https://ecole-naturo.fr/#solene-geoffroy",
      "name": "Solène Geoffroy",
      "jobTitle": "Diététicienne-nutritionniste diplômée d'État, formatrice",
      "url": "https://ecole-naturo.fr/solene-geoffroy/",
      "worksFor": {
        "@id": "https://ecole-naturo.fr/#organization"
      },
      "sameAs": [
        "https://www.linkedin.com/in/sol%C3%A8ne-geoffroy-8525b5156/",
        "https://www.instagram.com/sgeoffroy.diet/"
      ]
    }
  ]
}
</script>
```

Remarque : la page 42322 (programme) porte son propre `Course` (@id `…/formation-naturopathie-a-distance/#course`). Deux entités `Course` pour un même cursus sont tolérées mais pas idéales ; si tu veux une seule entité, remplace sur la page 42322 l'@id par `https://ecole-naturo.fr/#course` et garde l'accueil comme URL canonique du cours.

---

## 6. Mentions à SUPPRIMER ou REFORMULER sur l'accueil

CPF : aucune occurrence, rien à faire. Superlatifs, affirmations non vérifiables et allusions ambiguës repérés dans la source :

| # | Phrase exacte dans la source | Problème | Reformulation |
|---|---|---|---|
| 1 | `<h3>Le meilleur rapport qualité-prix</h3>` | Superlatif de supériorité non vérifiable | `<h3>Un tarif 4 à 10 fois inférieur aux écoles présentielles</h3>` (le paragraphe suivant, chiffré, reste inchangé) |
| 2 | `— une note dans le top 3 du marché, sur des avis 100% identifiés.` | Classement non vérifiable (aucune source) | Supprimer le membre de phrase ; garder : `32 avis Google vérifiés et 800 apprenant(e)s accompagné(e)s depuis 2024, sur des avis 100 % identifiés.` |
| 3 | `animées par nos formatrices agréées` | « Agréées » par qui ? Aucun agrément n'existe en naturopathie ; contradiction avec la section reconnaissance | `animées par nos formatrices en activité` |
| 4 | `<p>Un organisme de formation déclaré, certifié et transparent</p>` | « Certifié » sans nommer la certification (le mot Qualiopi n'apparaît nulle part sur la page) | Si la certification Qualiopi est en cours de validité : `Un organisme de formation déclaré, certifié Qualiopi et transparent` et l'écrire aussi dans les références légales. Sinon : `Un organisme de formation déclaré et transparent` |
| 5 | `La certification qualité a été délivrée au titre de la catégorie « actions de formation ». Cet enregistrement ne vaut pas agrément de l’État : …` | Première phrase = formule Qualiopi sans le nom ni le numéro ; invérifiable pour le lecteur | Si Qualiopi valide : `Certification Qualiopi n° [À COMPLÉTER PAR JULIEN], délivrée au titre de la catégorie « actions de formation ».` Sinon supprimer la première phrase et garder `Cet enregistrement ne vaut pas agrément de l’État : …` |
| 6 | `et c&rsquo;est précisément ce que notre programme vous garantit. ✅` (FAQ « reconnu ») | Garantie de résultat (« accompagner efficacement vos clients ») : promesse non tenable | Remplacée dans la nouvelle FAQ (point 4). Si l'ancienne réponse est conservée quelque part : `et c&rsquo;est ce que notre programme vise.` |
| 7 | `La naturopathie est reconnue par l’<strong>Organisation mondiale de la santé (OMS)</strong> comme la troisième médecine traditionnelle mondiale` | Affirmation attribuée à l'OMS sans source ; formulation contestée | `L’Organisation mondiale de la santé (OMS) classe la naturopathie parmi les médecines traditionnelles et complémentaires` + lien vers la page OMS correspondante [À VÉRIFIER PAR JULIEN : URL de la stratégie OMS sur les médecines traditionnelles] |
| 8 | `(pas d’interprétation de bilans biologiques, contrairement à certains concurrents)` | Dénigrement de concurrents non nommés | `(pas d’interprétation de bilans biologiques, qui relève du médecin)` |
| 9 | `La quasi-totalité des concurrents ne publient aucun SLA.` | Affirmation sur les concurrents non sourcée | Supprimer la phrase ; garder l'engagement chiffré `réponse en moins de 48 h ouvrées, dimanche inclus`. |
| 10 | `un naturopathe gagne en moyenne entre <strong>1 800 € et 4 500 € net par mois</strong> … un débutant démarre plutôt entre 1 200 € et 1 900 €` | Chiffres externes sans source visible sur l'accueil | Garder uniquement si la page /salaire-naturopathe/ cite sa source ; sinon [À VÉRIFIER PAR JULIEN] et ajouter « selon [source] » |
| 11 | `Le seul cursus de naturopathie du comparatif qui prépare aussi à un diplôme d’État` | Acceptable car limité au comparatif ; à conserver tel quel | Aucun changement, vérifier simplement que le comparatif est à jour |

Emoji : la source en utilise dans les FAQ (🎓 ✅) ; les 10 nouvelles réponses n'en contiennent aucun.

---

## Vérifications dures (template-durci-journal.md §2)

| # | Vérification | Verdict | Détail |
|---|---|---|---|
| 1 | Auteur réel, nommé, qualifié pour CE sujet | OK | Le bloc « Contenu vérifié par Eva Mischler, naturopathe et formatrice » existe déjà en bas de l'accueil (daté du 9 juin 2026 : le passer à la date de mise en ligne des blocs). Le bloc 2 rend les trois formatrices vérifiables (pages, LinkedIn, titres). |
| 2 | Aucune affirmation santé non sourcée | OK dans les blocs livrés | Les blocs 2 à 5 ne contiennent aucune affirmation d'effet sur la santé. Deux affirmations de la source sont signalées au point 6 (OMS, salaires). |
| 3 | Aucune promesse thérapeutique | OK | Aucun « soigne / guérit / traite ». Rappel « accompagne et éduque, ne pose pas de diagnostic, ne prescrit pas » dans le bloc 3 et la FAQ 7. La « garantie » de la FAQ existante est retirée (point 6, ligne 6). |
| 4 | Aucun chiffre, étude ou source inventé | OK | Tous les chiffres sont lus sur l'accueil ou la page 42322 : 1 200 h, 144 h, 6 / 24 mois, 1 490 € / 248 €, 3 000 € / 300 €, 11 500 € / 12 995 €, 800 apprenants, 94 %, 4,9/5, 32 avis, 40 personnes par session, 48 h ouvrées, 3 mois, 30 jours de pause, 2 modules par semaine, 2 h par semaine. Aucun chiffre externe ajouté. |
| 5 | Aucune URL interne devinée | OK | 15 URL internes utilisées, toutes présentes dans `wp/urls.txt` : /, /eva-mischler/, /sabrina-dussart/, /solene-geoffroy/, /notre-equipe/, /qui-sommes-nous/, /rdv/, /conditions-generales-de-vente/, /reglement-interieur/, /mentions-legales/, /politiques-de-confidentialite/, /blog/formation-naturopathie-reconnue-par-letat/, /diplome-naturopathie/, /comparatif-formations-naturopathie/, /formation-sophrologie/ (ancre existante). Les URL externes des réseaux (LinkedIn, Instagram, sites des formatrices, Facebook, YouTube, Maps) sont copiées telles quelles depuis la source. |
| 6 | Information gain démontrable | OK | La section « Reconnaissance et cadre légal » répond frontalement à l'intention dominante de la SERP (vérification), avec une liste de définitions Diplôme d'État / RNCP / certificat d'école / attestation qu'aucune page concurrente ne présente sur sa page d'accueil, et une FAQ citable de 10 réponses autonomes. |
| 7 | Chiffres canoniques conformes | À RECOUPER | Mémoire projet `ecole-naturo-canonical-eeat-facts` non chargée dans cette session : recoupement fait uniquement entre les pages sources. Divergences à trancher : 31 avis (page 42322) contre 32 (accueil) ; « 600+ » (page 42322) contre « plus de 800 » (accueil, page auteur) pour Eva. |
| 8 | Journal renseigné | OK | Ci-dessous. |

## Journal

- [ERREUR CONSTATÉE] L'accueil contient trois affirmations de supériorité ou de classement non vérifiables (« le meilleur rapport qualité-prix », « top 3 du marché », « formatrices agréées ») qui coexistent avec une section très honnête sur la non-reconnaissance. Règle à ajouter : sur une page money YMYL, auditer les superlatifs et les qualificatifs d'autorité (« agréé », « certifié », « reconnu ») en même temps que la section transparence, car la contradiction entre les deux est visible par un Quality Rater.
- [ERREUR CONSTATÉE] La source fait allusion à une certification qualité sans jamais la nommer (« La certification qualité a été délivrée au titre de la catégorie… »). Règle à ajouter : une certification n'est citée que nommée et numérotée ; une allusion sans nom est soit complétée, soit supprimée.
- [ERREUR CONSTATÉE] Le téléphone de l'école figurait dans le schema Yoast mais nulle part dans le texte visible de l'accueil. Règle à ajouter : avant de livrer un JSON-LD, lister chaque propriété et pointer l'endroit exact où elle est affichée ; toute propriété sans emplacement visible est soit affichée, soit retirée du schema.
- [ERREUR CONSTATÉE] Une réponse de FAQ demandée par le brief (« âge ») n'a pas de source dans les pages fournies. Règle à ajouter : quand une question de FAQ imposée n'est pas couverte par les sources, formuler la réponse la plus prudente déductible des sources et la signaler explicitement comme point à confirmer, dans le HTML et dans le schema.
