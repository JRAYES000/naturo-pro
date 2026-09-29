# CLAUDE.md — Instructions pour Claude Code

Lu automatiquement à chaque session. Règles dures, conventions, et carte du code pour éviter
de chercher.

---

## 🚨 Règles absolues (ne JAMAIS violer)

1. **Déploiement prod : autonomie autorisée (2026-06-06).** Je peux committer, pousser et
   déployer en prod de ma propre initiative, sans demander. Garde-fous de **qualité**, pas de
   permission : `npm run check` **et** `npm test` doivent passer avant d'expédier. **PRÉVENIR**
   avant toute opération destructrice sur la base prod (DROP/wipe, suppression de données
   réelles).
2. **Ne JAMAIS commit de secrets** (mots de passe, clés API, tokens, IPs serveur). **Repo public.**
3. **Toute UI en français** — utilisatrices = praticiennes francophones. (La règle porte sur les
   textes de l'interface produit, pas seulement sur la conversation.)
4. **Ne pas migrer de stack** (Supabase / Next.js / autre) sans validation explicite. Express +
   Drizzle + Wouter + Vite est un choix assumé.
5. **L'auth reste maison + bcrypt** — pas de Supabase Auth, NextAuth, Clerk, ni `express-session`.

## État de la production — à vérifier avant de promettre une mise en ligne

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
  clé **de chaque praticienne** (`users.stripe_secret_key`, `server/stripe.ts` + `routes/helpers/
  stripe-booking.ts`) — API REST par `fetch`, sans dépendance npm ni webhook, rattrapage
  périodique. (b) Abonnement système (`server/stripe-subscription.ts`, `routes/billing.ts`,
  `STRIPE_WEBHOOK_SECRET`). Ne pas confondre les deux.
- `users.plan` (défaut `trial`) + `trialEndsAt`. Le garde de `server/routes/index.ts` renvoie un
  402 (`PLAN_UPGRADE_REQUIRED`) sur les fonctions payantes ; `shared/plan-access.ts` porte le
  gating par plan. Traiter la prod comme un service payant : régression = cliente bloquée.

## Stack — ce que le code ne dit pas au premier coup d'œil

- Auth : **sessions maison** — `crypto.randomBytes` + table `sessions` + cookie httpOnly
  (`server/auth.ts`), mots de passe en bcrypt. `@types/express-session` traîne en devDependency
  **sans le paquet runtime** : c'est un résidu mort, ne pas « réparer » l'auth en l'installant.
- Email : **Resend** (`server/email.ts`), API HTTP. Une clé **par praticienne**
  (`users.resendApiKey`, configurée dans `server/routes/profile.ts`), `RESEND_API_KEY` système en
  repli. **Il n'y a plus aucun Mailjet dans le code.** Une adresse Gmail/Orange ne se vérifie
  pas chez Resend : sur « domain is not verified », `sendEmail` renvoie par la clé système, au
  nom de la praticienne et avec son adresse en reply-to (`unverifiedDomainFallback`).
- IA : **OpenRouter uniquement**. `server/mistral.ts` garde son nom historique mais route vers
  OpenRouter (`deepseek/deepseek-v4-flash`) ; `server/rag.ts` y route aussi les embeddings
  `mistralai/mistral-embed-2312`. « Mistral » n'est qu'un nom de fichier et un nom de modèle.
- Node 24, mais pas de champ `engines` dans `package.json` et `@types/node` encore en 20.x.
- Fuseaux (cabinet vs visiteuse) : `server/timezone.ts` — source de plusieurs bugs, lire avant
  d'y toucher.

## Carte du code — où trouver quoi

**Backend** — `server/routes/index.ts` est l'orchestrateur (middlewares globaux + `register*`).
Aucune route inline : chaque domaine vit dans son module.

**Data** : tout passe par `server/storage.ts` (~1500 lignes). Schémas dans `shared/`.

**Frontend** : `client/src/pages/*.tsx` (1 page = 1 route), `client/src/components/`,
`client/src/lib/queryClient.ts` (→ `apiRequest`), `client/src/lib/tenant.ts`.

## Conventions de code

### Frontend
- **TOUS les appels API via `apiRequest` de `@/lib/queryClient`** — jamais `fetch()` brut. Deux
  exceptions subsistent dans `client/src/pages/Settings.tsx` (export RGPD et suppression de
  compte) : ne pas s'en servir comme précédent.
- **TanStack Query v5** : forme objet uniquement, `useQuery({ queryKey, queryFn })`.
- **Query keys hiérarchiques** : `['/api/clients', clientId]` (tableau), pas de template string.
- **Toujours invalider après mutation** : `queryClient.invalidateQueries({ queryKey: [...] })`.
- **Wouter + `useHashLocation`** — URLs en `/#/agenda`, jamais path-based. `<Router hook={useHashLocation}>`
  enveloppe `<Switch>`, pas l'inverse.
- **Formulaires** : `useForm` + `zodResolver` + insert schema de `@shared/schema.ts`.
- **Test IDs** : `data-testid="button-{action}-{target}"` (interactif),
  `data-testid="text-{content}-{id}"` (affichage dynamique).
- **Tailwind** : utility classes du thème (`leaf-bg`, `card-naturo`, `btn-primary-naturo`, `table-naturo`).
- **Rayons : jamais de valeur arbitraire.** L'échelle du thème est `rounded-sm` 6px (puces),
  `rounded-md` 10px (boutons, champs), `rounded-lg` 12px (cartes), `rounded-xl` 16px (dialogues).
  Un `rounded-[Npx]` signale que l'échelle est mal réglée — corriger `tailwind.config.ts`, pas la page.
- **Élévation : filet OU ombre, jamais les deux.** Une carte se pose au filet 1px (`card-naturo`).
  L'ombre est réservée aux surfaces qui flottent vraiment : menus, dialogues, popovers, toasts.
- **Icônes : lucide uniquement.** Pas d'emoji ni de glyphe unicode en guise d'icône. Pour un conseil
  ou un avertissement dans un `HelpNote`, utiliser `<HelpTip>` / `<HelpWarn>`.
- **Titres : pas de classe de poids.** La hiérarchie h1→h4 (poids + interlettrage) vient de
  `index.css`. Ajouter `font-bold` sur un titre ré-aplatit les quatre niveaux.
- **Couleurs** : primary `#186749`, accent `#17EC9B`, dark `#1b4332`.
- **Toast** : `useToast` depuis `@/hooks/use-toast`.
- **❌ Jamais `localStorage` / `sessionStorage` / cookies client** pour de la donnée persistante.

### Backend
- **Tout passe par `storage`** — pas de requête Drizzle directe dans les routes.
- **Validation Zod sur tous les body** avant de toucher la DB.
- **Drizzle better-sqlite3 est SYNCHRONE** : `.get()` (single), `.all()` (array), `.run()`
  (mutation). Ne **jamais** destructurer la query builder.
- **Schéma actif** : `shared/schema-active.ts` exporte le bon schéma selon `DB_DRIVER`.
  ⚠️ Nouvelle table = l'ajouter dans **les 3 fichiers** : `shared/schema.ts`,
  `shared/schema-mysql.ts`, `shared/schema-active.ts`. `shared/schema-drift.test.ts` échoue si
  les deux schémas divergent, si une table à `user_id` échappe au cascade RGPD, ou si une table
  déclarée n'est pas créée.
- **Un changement de schéma ne part pas en prod tout seul** : `npm run db:push` ne touche que le
  SQLite local. La prod se livre par `npm run db:generate:mysql`, dont la migration générée dans
  `migrations-mysql/` est le seul dossier expédié par `deploy.yml`.
- **Nouvelle route** = nouveau handler dans le module de domaine existant, jamais dans
  `server/routes/index.ts`. Nouveau domaine = nouveau fichier + `register*` câblé dans l'index.

### Naming
- Variables camelCase. Fichiers kebab-case (helpers), PascalCase (composants React).
- Routes API : `/api/...`, sous-groupées. **Public sans auth** : préfixe `/api/public/...`.

## Base de données — trois pièges

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

## Variables d'environnement

Toutes les variables sont documentées dans `.env.example`.

## Workflow

1. Comprendre la demande, puis lire les fichiers concernés (utiliser la carte ci-dessus).
2. Si > 200 lignes à changer, proposer un plan avant.
3. Implémenter en respectant les conventions.
4. **Vérifier — les deux sont obligatoires avant d'expédier :**
   - `npm run check` — types (tsc). ⚠️ `tsconfig.json` exclut `**/*.test.ts` : les tests ne sont
     pas type-checkés.
   - `npm test` — suite unitaire (`server/**`, `shared/**`, `client/src/**`)
5. Selon le changement, ajouter la vérification pertinente :
   - `npm run smoke` — routes **critiques** (après touche au routing). **Exige `npm run dev`
     déjà lancé sur :3000.**
   - `npm run test:e2e` — parcours fonctionnel. **Exige aussi un serveur lancé** (la CI le
     démarre elle-même). Une URL d'API inconnue répond 404 : un test qui vise une route
     inexistante échoue, et bloque le déploiement.
   - `npm run test:ui` — Playwright (démarre son propre serveur, SQLite jetable, 3 projets).
   - `npm run routes:inventory` — régénère `docs/routes-inventory.txt`.
   - `npm run seo:check` — rejoue les contrôles SEO sur la prod.
6. Tester dans le navigateur : lancer la config **`naturo-dev`** de `.claude/launch.json`
   (`npm run dev`, port 3000) via l'outil de preview, pas via un shell détaché.
7. Toute logique non triviale ajoutée laisse **un** test à côté (`*.test.ts`, `node:test`).
8. `npm run build` → `dist/index.cjs` + `dist/public/`. Déploiement : `docs/DEPLOY.md`.

Compte de démo (`server/seed.ts`) : `marie@demo.fr`, mot de passe `demo1234`.

## Anti-patterns

- ❌ `fetch()` brut client → `apiRequest`
- ❌ `localStorage` client → backend
- ❌ Drizzle direct dans les routes → `storage`
- ❌ Router inline dans `server/routes/index.ts` → module de domaine
- ❌ Livrer sur `npm run check` seul → `npm test` aussi, et regarder la CI
- ❌ Changer le schéma sans `db:generate:mysql` → la prod ne verra jamais la colonne
- ❌ `npm install` sans demander → `package-lock.json` + repo public
- ❌ Refactoriser sans demander → app en prod avec des comptes payants
- ❌ Toucher `vite.config.ts` / `drizzle.config.ts` / `script/build.ts` sans nécessité absolue

## Ressources

- Emails clients : `server/email-templates/` (`defaults.ts`, `render.ts`, `render-user.ts`),
  route `server/routes/email-templates.ts`, page `client/src/pages/EmailTemplates.tsx`.
- `.claude/launch.json` — configs de dev (`naturo-dev`, port 3000). **Gitignoré** : absent d'un
  clone frais.
- `docs/DEPLOY.md` — déploiement prod. ⚠️ Il décrit encore `deploy.yml` comme « à créer » et pose
  une « règle absolue : ne jamais déployer sans validation », qui contredit la règle 1 ci-dessus.
  **C'est `CLAUDE.md` qui fait foi.** **Le WordPress `ecole-naturo.fr` vit sur le MÊME compte
  SSH que l'app** (alias `naturo-prod`) : `domains/ecole-naturo.fr/public_html`, avec `wp-cli`
  en `/usr/local/bin/wp`. Pas besoin d'une seconde clé — celle du déploiement suffit. Utile dès
  qu'une action SEO demande de toucher au site principal (maillage interne, redirections).
- **Action admin en prod sans session navigateur** (créer un compte, activer un plan) : mes
  identifiants admin Naturo Pro ne sont ni dans `secrets.md` ni dans le Chrome piloté. Passer par
  SSH `naturo-prod` + `mysql -h 127.0.0.1` avec les variables `DB_*` du `.env` distant
  (`domains/app.ecole-naturo.fr/nodejs/`). Le hash bcrypt se génère en local avec `bcryptjs`.
  Fait le 2026-09-06 pour le compte 37.
- **`docs/SEO-TRACKING.md` — état du SEO, action par action. À lire AVANT tout nouvel audit SEO :
  `npm run seo:check` rejoue les tests sur la prod et dit ce qui tient. Ne relancer une analyse
  complète que sur ce qui échoue.** Audit d'origine : `docs/AUDIT-SEO-2026-08-15.md`.
- `docs/routes-inventory.txt` — inventaire généré de toutes les routes (`npm run routes:inventory`)
- `docs/RECETTE.md`, `docs/STRIPE-PRODUCTION.md`, `docs/NOTE-MODELE-IA.md`,
  `docs/DESIGN-CONFORMITE-2026-08-16.md` — les plus récents.
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/HISTORY.md`, `docs/AUDIT-2026-07-28.md`,
  `docs/superpowers/` — **archives de juin-juillet 2026**. `ARCHITECTURE.md` décrit encore
  `email.ts (Mailjet)` ; `README.md` décrit un `server/routes.ts` supprimé et un script
  `db:push:mysql` qui n'existe pas. Ne pas s'y fier sans recouper avec le code.
