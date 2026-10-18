# Facture électronique 2026 — ce que fait Naturo Pro

État au 18/10/2026. Règles relevées sur les sources officielles listées en fin de fichier ;
à revérifier avant toute évolution (le cadre bouge encore).

## Le cadre, pour une naturopathe

- **La naturopathie n'est pas exonérée de TVA** (BOFiP BOI-TVA-CHAMP-30-10-20-10 §210 :
  « naturothérapeute » hors exonération) : toutes les utilisatrices sont dans le champ de la
  réforme, en franchise en base (art. 293 B) ou assujetties.
- **Depuis le 01/09/2026** : toute entreprise doit pouvoir **recevoir** ses factures fournisseurs
  par une plateforme agréée (PA). Sanction : mise en demeure, puis 500 € par trimestre.
- **Au 01/09/2027** (micro-entreprises et PME) :
  - émission électronique via une PA vers les clients professionnels assujettis établis en France ;
  - e-reporting des opérations avec des particuliers (franchise : un envoi par bimestre civil) ;
  - statut « Encaissée » (code 212) envoyé à chaque paiement d'une prestation ;
  - nouvelles mentions sur **toutes** les factures, particuliers compris : SIREN du client,
    catégorie d'opération (biens, services, mixte), option pour la TVA sur les débits.
- Formats admis : CII ou UBL en profil EN 16931 (ou EXTENDED-CTC-FR), ou Factur-X (PDF/A-3 +
  CII). Les profils MINIMUM, BASIC WL et BASIC sont hors socle.

## Ce que fait l'application (lot 1A)

| Exigence | Où |
|---|---|
| Factur-X EN 16931 (PDF/A-3b + `factur-x.xml`) pour toute facture ou avoir émis | `server/einvoicing/pdf.ts`, `facturx-xml.ts` |
| Un seul modèle pour le PDF et le XML (cohérence imposée par le format mixte) | `server/einvoicing/document.ts` |
| Franchise : catégorie `E`, code `VATEX-FR-FRANCHISE`, SIREN en BT-32 (règle BR-E-02) | `documentToFacturx` |
| B2B : SIREN acheteur, adresses électroniques `0225`, notes `PMD`/`PMT`/`AAB`, cadre `S1`/`B1`/`M1` | `documentToFacturx` |
| Avoir : type `381`, montants positifs, référence BT-25/BT-26 à la facture d'origine | `docType = "avoir"`, `creditedInvoiceId` |
| Numéro légal attribué à l'**émission** (brouillon = `BROUILLON-…`) : aucun trou possible | `storage.issueInvoice` |
| Mentions : « EI », SIRET, n° TVA, RCS/capital, date de prestation, nature de l'opération, mentions B2B, médiateur, 293 B | `pdf.ts`, réglages |
| Contrôle de conformité affiché dans l'éditeur et les réglages | `server/einvoicing/compliance.ts` |
| SIREN/SIRET/TVA contrôlés (Luhn, clé TVA) ; recherche dans l'annuaire public | `identifiers.ts`, `GET /api/company-lookup` |
| Livre des recettes par date d'encaissement, journal des factures émises | `GET /api/stats/recettes.csv`, `ventes.csv` |
| Suivi du seuil de franchise (37 500 € / 41 250 € en 2026 pour les services) | `GET /api/einvoicing/status` |

Polices : Noto Sans (Apache 2.0) réduite au jeu latin, embarquée en base64
(`server/einvoicing/fonts.ts`) — le déploiement n'envoie que `dist/index.cjs`.

## Validation

La CI génère des Factur-X avec le vrai code (`script/facturx-samples.ts`) et les valide
(`script/facturx-validate.py`) : XSD Factur-X EN 16931, schématron Factur-X EN 16931,
schématron français **BR-FR flux 2** pour le B2B, structure PDF/A-3b. En local :

```bash
npm run facturx:samples
python -I script/facturx-validate.py .facturx-samples
```

(dépendances : `pip install factur-x==7.7 saxonche==13.1.0 pikepdf==10.17.0 lxml`).
Contrôlé aussi le 18/10/2026 avec le schématron CEN EN 16931 1.3.17. **Non vérifié avec
veraPDF** (validation PDF/A complète) : seule la structure PDF/A-3b est contrôlée.

## Lot 1B — raccordement à la plateforme agréée (à faire)

Plateforme retenue : **Super PDP** (immatriculée le 22/12/2025), API documentée sur
`https://www.superpdp.tech/openapi/` (spécification `https://api.superpdp.tech/openapi/superpdp.json`,
plus l'API normalisée AFNOR XP Z12-013 flux et annuaire).

- Chaque praticienne connecte **son** compte Super PDP (OAuth 2.1, flux « authorization code »,
  pré-remplissage `login_hint` + `superpdp_company_number`) ; Super PDP gère la vérification
  d'identité, l'accord formel et l'inscription à l'annuaire.
- Émission : `POST /v1.beta/invoices` accepte le PDF Factur-X tel quel (`external_id` = id de la
  facture, `processing_rule` B2B/B2C). Les factures B2C alimentent l'e-reporting automatiquement.
- Statuts : `GET /v1.beta/invoice_events` (pas de webhook) ; « Encaissée » : `POST
  /v1.beta/invoice_events` avec `fr:212`.
- Réception : `GET /v1.beta/invoices?direction=in` + `/download`.
- Régime de TVA (fréquence de l'e-reporting) : `PATCH /v1.beta/companies`.
- Prérequis de Julien : compte développeur Super PDP et application OAuth (URL de retour
  `https://app.ecole-naturo.fr/api/einvoicing/superpdp/callback`).

## Sources

- impots.gouv.fr : « Je découvre la facturation électronique » (MAJ 26/05/2026), FAQ « Je
  découvre » et « J'approfondis » (01/09/2026), guide de démarrage (juillet 2026), liste des
  plateformes agréées (13/10/2026), spécifications externes v3.2 (30/04/2026).
- Légifrance : loi n° 2026-103 de finances pour 2026 (art. 123), décret n° 2026-677 et arrêté
  du 27/07/2026, décret n° 2022-1299 (nouvelles mentions) modifié par le décret n° 2024-266.
- BOFiP : BOI-TVA-DECLA-20-30-50 et -60 (e-reporting, 30/09/2026), BOI-TVA-DECLA-30-20-20-10
  (mentions), BOI-TVA-CHAMP-30-10-20-10 (professions de santé).
- FNFE-MPE : Factur-X 1.09.2 (04/08/2026). Bibliothèque `factur-x` (Akretion) 7.7 pour les
  XSD et schématrons, dont `BR-FR-Flux2-Schematron-CII.xslt`.
