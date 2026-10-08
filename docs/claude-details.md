# Détails du CLAUDE.md — naturo-pro

Annexe du `CLAUDE.md`, lue à la demande. Ne jamais l'importer par `@` : elle serait chargée à
chaque session. Le `CLAUDE.md` garde chaque règle en une ligne, marquée ↗. Chaque section
ci-dessous porte le même intitulé et reprend le texte d'origine complet, déplacé le 2026-10-08 :
incident, raison, dates, procédure.

## Déploiement prod autonome

Règle 1 du `CLAUDE.md`, texte d'origine :

**Déploiement prod : autonomie autorisée (2026-06-06).** Je peux committer, pousser et
déployer en prod de ma propre initiative, sans demander. Garde-fous de **qualité**, pas de
permission : `npm run check` **et** `npm test` doivent passer avant d'expédier. **PRÉVENIR**
avant toute opération destructrice sur la base prod (DROP/wipe, suppression de données
réelles).

## Auth maison + bcrypt

Règle 5 du `CLAUDE.md` : **l'auth reste maison + bcrypt** — pas de Supabase Auth, NextAuth,
Clerk, ni `express-session`.

Auth : **sessions maison** — `crypto.randomBytes` + table `sessions` + cookie httpOnly
(`server/auth.ts`), mots de passe en bcrypt. `@types/express-session` traîne en devDependency
**sans le paquet runtime** : c'est un résidu mort, ne pas « réparer » l'auth en l'installant.

## État de la production

**Le déploiement n'est pas déclenché par le push mais par une CI verte** (`deploy.yml` sur
`workflow_run` de `ci.yml`). Un push sur `main` avec CI rouge ne déploie **rien**, en silence :
le job `Déploiement` apparaît en `skipped`.

Précédent : du 15/08 au 29/09/2026, la CI est restée rouge et **aucun** déploiement n'est parti
(prod figée au 12/08). Cause : `test:e2e` appelait des routes d'anamnèse inexistantes, masquées
tant que toute URL inconnue répondait 200. **Après un push, vérifier que `Déploiement` est en
`success`** — `gh run list --limit 6` dit l'état réel.

## Contexte business

- **Utilisateur** : Julien Rayes, entrepreneur français basé à Sofia, formateur en naturopathie
  éligible CPF.
- **Cible** : praticiennes en naturopathie / thérapeutes — agenda + booking + facturation simple.
- **Prod** : `app.ecole-naturo.fr`. **Multi-tenant** : chaque praticienne a un sous-domaine
  `{slug}.app.ecole-naturo.fr` (détection dans `server/routes/index.ts` d'après `BASE_DOMAIN`,
  injecte `req.tenantUserId` / `req.tenantSlug`).
- **Monétisation** : Stripe, **deux modèles distincts**. (a) Encaissement de rendez-vous avec la
  clé **de chaque praticienne** (`users.stripe_secret_key`, `server/stripe.ts` +
  `routes/helpers/stripe-booking.ts`) — API REST par `fetch`, sans dépendance npm ni webhook,
  rattrapage périodique. (b) Abonnement système (`server/stripe-subscription.ts`,
  `routes/billing.ts`, `STRIPE_WEBHOOK_SECRET`). Ne pas confondre les deux.
- `users.plan` (défaut `trial`) + `trialEndsAt`. Le garde de `server/routes/index.ts` renvoie un
  402 (`PLAN_UPGRADE_REQUIRED`) sur les fonctions payantes ; `shared/plan-access.ts` porte le
  gating par plan. Traiter la prod comme un service payant : régression = cliente bloquée.

## Email

Email : **Resend** (`server/email.ts`), API HTTP. Une clé **par praticienne**
(`users.resendApiKey`, configurée dans `server/routes/profile.ts`), `RESEND_API_KEY` système en
repli. **Il n'y a plus aucun Mailjet dans le code.** Une adresse Gmail/Orange ne se vérifie
pas chez Resend : sur « domain is not verified », `sendEmail` renvoie par la clé système, au
nom de la praticienne et avec son adresse en reply-to (`unverifiedDomainFallback`).

## IA

IA : **OpenRouter uniquement**. `server/mistral.ts` garde son nom historique mais route vers
OpenRouter (`deepseek/deepseek-v4-flash`) ; `server/rag.ts` y route aussi les embeddings
`mistralai/mistral-embed-2312`. « Mistral » n'est qu'un nom de fichier et un nom de modèle.

## Emails clients

Emails clients : `server/email-templates/` (`defaults.ts`, `render.ts`, `render-user.ts`),
route `server/routes/email-templates.ts`, page `client/src/pages/EmailTemplates.tsx`.

## Base de données — pièges

- **`migrations/` est mort.** 17 `.sql` d'avant le 28/07/2026, joués à la main à l'époque ;
  `migrations/README.md` interdit de les rejouer. Le livrable réel est **`migrations-mysql/`**.
- **`drizzle.config.ts` pointe vers `./migrations-sqlite`, dossier qui n'existe pas.** Un
  `drizzle-kit generate` sans `--config` créerait un dossier fantôme. Pour la prod, toujours
  `npm run db:generate:mysql`.
- **`npm run db:push` est `drizzle-kit push --force`** et tourne **automatiquement** en `predev`
  et en `pretest`. Le `--force` supprime sans demander les colonnes retirées du schéma : lancer
  `npm run dev` après un changement de schéma peut faire perdre des données locales.

`data.db` est en mode WAL : `data.db-wal` peut peser plus que la base elle-même. **Lire ou
copier `data.db` seul donne un état partiel** — passer par `sqlite3 data.db`.

## Selon le changement

Étape 3 du workflow, texte d'origine :

- `npm run smoke` — routes **critiques** (après touche au routing). **Exige `npm run dev`
  déjà lancé sur :3000.**
- `npm run test:e2e` — parcours fonctionnel. **Exige aussi un serveur lancé** (la CI le
  démarre elle-même). Une URL d'API inconnue répond 404 : un test qui vise une route
  inexistante échoue, et bloque le déploiement.
- `npm run test:ui` — Playwright (démarre son propre serveur, SQLite jetable, 3 projets).
- `npm run routes:inventory` — régénère `docs/routes-inventory.txt`.
- `npm run seo:check` — rejoue les contrôles SEO sur la prod.

## `docs/DEPLOY.md` est périmé

`docs/DEPLOY.md` — déploiement prod. ⚠️ Il décrit encore `deploy.yml` comme « à créer » et pose
une « règle absolue : ne jamais déployer sans validation », qui contredit la règle 1 du
`CLAUDE.md`. **C'est `CLAUDE.md` qui fait foi.**

## WordPress `ecole-naturo.fr`

**Le WordPress `ecole-naturo.fr` vit sur le MÊME compte SSH que l'app** (alias `naturo-prod`) :
`domains/ecole-naturo.fr/public_html`, avec `wp-cli` en `/usr/local/bin/wp`. Pas besoin d'une
seconde clé — celle du déploiement suffit. Utile dès qu'une action SEO demande de toucher au
site principal (maillage interne, redirections).

## Action admin en prod sans session navigateur

**Action admin en prod sans session navigateur** (créer un compte, activer un plan) : mes
identifiants admin Naturo Pro ne sont ni dans `secrets.md` ni dans le Chrome piloté. Passer par
SSH `naturo-prod` + `mysql -h 127.0.0.1` avec les variables `DB_*` du `.env` distant
(`domains/app.ecole-naturo.fr/nodejs/`). Le hash bcrypt se génère en local avec `bcryptjs`.
Fait le 2026-09-06 pour le compte 37.

## Docs du dépôt

- **`docs/SEO-TRACKING.md` — état du SEO, action par action. À lire AVANT tout nouvel audit SEO :
  `npm run seo:check` rejoue les tests sur la prod et dit ce qui tient. Ne relancer une analyse
  complète que sur ce qui échoue.** Audit d'origine : `docs/AUDIT-SEO-2026-08-15.md`.
- `docs/routes-inventory.txt` — inventaire généré de toutes les routes (`npm run routes:inventory`).
- `docs/RECETTE.md`, `docs/STRIPE-PRODUCTION.md`, `docs/NOTE-MODELE-IA.md`,
  `docs/DESIGN-CONFORMITE-2026-08-16.md` — les plus récents.
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/HISTORY.md`, `docs/AUDIT-2026-07-28.md`,
  `docs/superpowers/` — **archives de juin-juillet 2026**. `ARCHITECTURE.md` décrit encore
  `email.ts (Mailjet)` ; `README.md` décrit un `server/routes.ts` supprimé et un script
  `db:push:mysql` qui n'existe pas. Ne pas s'y fier sans recouper avec le code.
