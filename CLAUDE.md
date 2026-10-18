# CLAUDE.md — naturo-pro

↗ : détail dans `docs/claude-details.md` (section du même intitulé), à lire quand le sujet se
présente.

## Règles absolues

1. **Déploiement prod autonome.** Avant d'expédier : `npm run check` **et** `npm test` verts.
   **Prévenir** avant toute opération destructrice sur la base prod (DROP, wipe, suppression de
   données réelles). ↗
2. **Ne jamais commiter de secret** (mot de passe, clé API, token, IP serveur) : **dépôt public**.
3. **Toute UI en français** (textes de l'interface, pas seulement la conversation) :
   utilisatrices = praticiennes francophones.
4. **Pas de migration de stack** (Supabase, Next.js…) sans validation explicite : Express +
   Drizzle + Wouter + Vite est un choix assumé.
5. **Auth maison + bcrypt** (`server/auth.ts`, table `sessions`) : ni Supabase Auth, NextAuth,
   Clerk ni `express-session`. Son `@types` en devDependency est un résidu mort, pas un oubli. ↗

## État de la production ↗

**Le déploiement part sur CI verte, pas sur le push** : CI rouge = rien ne part, en silence
(`Déploiement` en `skipped`). Après un push, `gh run list --limit 6` doit montrer `Déploiement`
en `success`.

## Contexte business ↗

- Cible : praticiennes en naturopathie, thérapeutes (agenda, booking, facturation simple).
- Prod `app.ecole-naturo.fr`, multi-tenant : un sous-domaine `{slug}.app.ecole-naturo.fr` par
  praticienne, détecté dans `server/routes/index.ts`.
- **Stripe, deux modèles à ne pas confondre** : encaissement des RDV par la clé de chaque
  praticienne (`server/stripe.ts`), abonnement système (`server/stripe-subscription.ts`).
- `users.plan` (défaut `trial`) : 402 `PLAN_UPGRADE_REQUIRED` sur les fonctions payantes
  (`shared/plan-access.ts`). Traiter la prod en service payant : régression = cliente bloquée.

## Stack

- Email : **Resend** (`server/email.ts`), clé par praticienne, `RESEND_API_KEY` système en repli,
  y compris sur domaine non vérifié. Plus aucun Mailjet. ↗
- IA : **OpenRouter uniquement**, malgré les noms `server/mistral.ts` et `mistral-embed`. ↗
- Node 24, sans champ `engines` dans `package.json` ; `@types/node` encore en 20.x.
- Fuseaux cabinet / visiteuse : lire `server/timezone.ts` avant d'y toucher (source de bugs).
- **Facture électronique 2026** : `server/einvoicing/` (Factur-X EN 16931 en PDF/A-3, un seul
  modèle pour PDF et XML). Numéro légal attribué à l'**émission** (brouillon = `BROUILLON-…`),
  avoir = `docType "avoir"` à montants positifs. Règles, sources et lot 1B (Super PDP) :
  `docs/EFACTURATION-2026.md`. La CI valide les Factur-X (XSD + schématrons BR-FR).
- **Accès sans mot de passe ni session classique** : double authentification (TOTP), espace
  cliente (lien magique, cookie `naturo_portal`), liens publics de devis et factures. ↗ (section
  « Auth maison + bcrypt »)

## Carte du code

- Backend : `server/routes/index.ts` orchestre (middlewares globaux + `register*`), sans route
  inline : nouvelle route dans son module de domaine, nouveau domaine = nouveau fichier +
  `register*` dans l'index. Data : `server/storage.ts` (~1500 lignes). Schémas : `shared/`.
- Frontend, sous `client/src/` : `pages/*.tsx` (1 page = 1 route), `components/`,
  `lib/queryClient.ts` (`apiRequest`), `lib/tenant.ts`.
- Emails clients : `server/email-templates/`, route et page associées ↗. Variables
  d'environnement : toutes dans `.env.example`.

## Conventions

### Frontend
- **API via `apiRequest`** (`@/lib/queryClient`), jamais `fetch()` brut. Les deux exceptions de
  `Settings.tsx` (export RGPD, suppression de compte) ne font pas précédent.
- TanStack Query v5 : forme objet `useQuery({ queryKey, queryFn })`, query keys en tableau
  hiérarchique (`['/api/clients', clientId]`, pas de template string),
  `queryClient.invalidateQueries({ queryKey: [...] })` après chaque mutation.
- **Wouter + `useHashLocation`** : URLs `/#/agenda`, jamais path-based.
  `<Router hook={useHashLocation}>` enveloppe `<Switch>`.
- Formulaires : `useForm` + `zodResolver` + insert schema de `@shared/schema.ts`.
- Test IDs : `data-testid="button-{action}-{target}"` (interactif),
  `data-testid="text-{content}-{id}"` (affichage dynamique).
- Thème : classes `leaf-bg`, `card-naturo`, `btn-primary-naturo`, `table-naturo` ; couleurs
  primary `#186749`, accent `#17EC9B`, dark `#1b4332`. Toast : `useToast` (`@/hooks/use-toast`).
- **Rayons : jamais de valeur arbitraire.** `rounded-sm` 6px (puces), `rounded-md` 10px
  (boutons, champs), `rounded-lg` 12px (cartes), `rounded-xl` 16px (dialogues). Un
  `rounded-[Npx]` signale une échelle mal réglée : corriger `tailwind.config.ts`, pas la page.
- **Élévation : filet OU ombre, jamais les deux.** Carte au filet 1px (`card-naturo`), ombre
  réservée à ce qui flotte (menus, dialogues, popovers, toasts).
- **Icônes lucide uniquement**, ni emoji ni glyphe unicode en guise d'icône ; dans un
  `HelpNote`, `<HelpTip>` / `<HelpWarn>`.
- **Titres sans classe de poids** : h1→h4 viennent de `index.css`, un `font-bold` les aplatit.
- **Jamais `localStorage`, `sessionStorage` ni cookie client** pour du persistant : backend.

### Backend
- **Tout passe par `storage`**, jamais de Drizzle direct dans les routes. **Zod sur chaque body**
  avant la DB.
- **Drizzle better-sqlite3 est synchrone** : `.get()` (un), `.all()` (liste), `.run()`
  (mutation). Ne jamais destructurer le query builder.
- **Nouvelle table = 3 fichiers** : `shared/schema.ts`, `shared/schema-mysql.ts`,
  `shared/schema-active.ts` (schéma actif selon `DB_DRIVER`). `shared/schema-drift.test.ts`
  échoue sur schémas divergents, table à `user_id` hors cascade RGPD ou table déclarée non créée.
- **Schéma vers la prod : `npm run db:generate:mysql`** (migration dans `migrations-mysql/`, seul
  dossier expédié par `deploy.yml`). `db:push` ne touche que le SQLite local : sans migration, la
  prod ne voit jamais la colonne.

### Naming
- Variables camelCase ; fichiers kebab-case (helpers), PascalCase (composants React). Routes
  `/api/...` sous-groupées ; publiques sans auth en `/api/public/...`.

## Base de données — pièges ↗

- **`migrations/` est mort** : ne jamais le rejouer. Livrable réel : `migrations-mysql/`.
- `drizzle.config.ts` vise `./migrations-sqlite`, inexistant : `drizzle-kit generate` sans
  `--config` crée un dossier fantôme.
- `npm run db:push` (`drizzle-kit push --force`) tourne seul en `predev` et `pretest` et
  supprime sans demander les colonnes retirées : `npm run dev` après un changement de schéma
  peut perdre des données locales.
- `data.db` est en WAL : le lire ou le copier seul donne un état partiel. Passer par
  `sqlite3 data.db`.

## Workflow

1. Comprendre la demande, lire les fichiers concernés (carte ci-dessus). Plus de 200 lignes à
   changer : proposer un plan avant.
2. Obligatoires (règle 1) : `npm run check` (tsc ; `tsconfig.json` exclut `**/*.test.ts`, les
   tests ne sont pas type-checkés) et `npm test` (`server/**`, `shared/**`, `client/src/**`).
3. Selon le changement ↗ : `npm run smoke` (routing) et `npm run test:e2e` (parcours) exigent
   un serveur lancé (`npm run dev`) ; `npm run test:ui` (Playwright, son propre serveur) ;
   `npm run routes:inventory` (→ `docs/routes-inventory.txt`) ; `npm run seo:check` (SEO prod).
   Route d'API inexistante = 404 : le test e2e qui la vise échoue et bloque le déploiement.
4. Navigateur : config `naturo-dev` de `.claude/launch.json` (`npm run dev`, :3000 ; gitignoré,
   absent d'un clone frais) via l'outil de preview, pas un shell détaché.
5. Toute logique non triviale ajoutée laisse **un** test à côté (`*.test.ts`, `node:test`).
6. `npm run build` → `dist/index.cjs` + `dist/public/`. Compte de démo (`server/seed.ts`) :
   `marie@demo.fr` / `demo1234`.

## Anti-patterns

- `npm install` sans demander (`package-lock.json`, dépôt public).
- Refactoriser sans demander (app en prod, comptes payants).
- Toucher `vite.config.ts`, `drizzle.config.ts` ou `script/build.ts` sans nécessité absolue.

## Ressources

- **`docs/DEPLOY.md` est périmé** et contredit la règle 1 : `CLAUDE.md` fait foi. ↗
- **WordPress `ecole-naturo.fr`** : même compte SSH que l'app (`naturo-prod`). ↗
- **Action admin en prod sans session navigateur** (créer un compte, activer un plan) : SSH
  `naturo-prod` + `mysql`. ↗
- **SEO : lire `docs/SEO-TRACKING.md` AVANT tout nouvel audit.** `npm run seo:check` dit ce qui
  tient ; n'analyser à fond que ce qui échoue.
- **Docs du dépôt** ↗ : archives de juin-juillet 2026 (`docs/ARCHITECTURE.md`, `ROADMAP.md`,
  `HISTORY.md`, `AUDIT-2026-07-28.md`, `superpowers/`) et `README.md` à recouper avec le code.
