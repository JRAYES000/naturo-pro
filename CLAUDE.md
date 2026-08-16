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
2. **Ne JAMAIS commit de secrets** (mots de passe, clés API, tokens, IPs serveur). Repo public.
3. **Toute UI en français** — utilisateurs = praticiens francophones.
4. **Ne pas migrer de stack** (Supabase / Next.js / autre) sans validation explicite. Express +
   Drizzle + Wouter + Vite est un choix assumé.
5. **L'auth reste Express + bcrypt** — pas de Supabase Auth, NextAuth, Clerk.

## Contexte business

- **Utilisateur** : Julien Rayes, entrepreneur français basé à Sofia, formateur en naturopathie
  éligible CPF.
- **Cible** : praticiens en naturopathie / thérapeutes — agenda + booking + facturation simple.
- **Prod** : `app.ecole-naturo.fr`. **Multi-tenant** : chaque praticien a un sous-domaine
  `{slug}.app.ecole-naturo.fr` (détection dans `server/routes/index.ts`, injecte
  `req.tenantUserId` / `req.tenantSlug`).
- **Monétisation implémentée** : Stripe (`server/stripe.ts`, `server/routes/helpers/stripe-booking.ts`),
  colonne `users.plan` (défaut `trial`) + `trialEndsAt`, **trial-guard** qui bloque les mutations
  après expiration. Traiter la prod comme un service payant : régression = client bloqué.

## Stack technique

- Frontend : **React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Wouter** (hash routing)
- State : **TanStack Query v5** + react-hook-form + Zod
- Backend : **Node.js 24 + Express + TypeScript** (bundle unique via esbuild)
- ORM : **Drizzle** — DB dev **SQLite** (better-sqlite3), DB prod **MySQL 8** (Hostinger Cloud Pro)
- Auth : **sessions Express + bcrypt** (cookie httpOnly)
- Email : **Mailjet SMTP** · IA : Mistral + OpenRouter (`server/mistral.ts`, `server/rag.ts`)

## Carte du code — où trouver quoi

**Backend** — `server/routes/index.ts` est l'orchestrateur (middlewares globaux + `register*`).
Aucune route inline : chaque domaine vit dans son module.

| Domaine | Fichier |
|---|---|
| Auth, inscription, reset password | `server/routes/auth.ts` |
| RDV, agenda | `server/routes/appointments.ts` |
| Clients, anamnèse, notes | `server/routes/clients.ts`, `server/routes/anamnese.ts` |
| Booking public, page publique, Stripe checkout | `server/routes/public.ts` |
| Dispos, catégories, forfaits | `server/routes/availability.ts`, `categories.ts`, `packages.ts` |
| Factures | `server/routes/invoices.ts` + `server/routes/helpers/invoices.ts` + `server/pdf.ts` |
| Rappels J-1, crons | `server/routes/reminders.ts`, `cron.ts` + `helpers/reminders.ts` |
| Templates email | `server/routes/email-templates.ts` (voir le skill projet, plus bas) |
| Google Calendar | `server/routes/google.ts` + `helpers/google-sync.ts` + `server/google.ts` |
| Admin, assistant IA, contenu | `server/routes/admin.ts`, `assistant-admin.ts`, `content.ts` |
| Stats, solutions, programmes, docs, discussions | `server/routes/<domaine>.ts` (fichiers homonymes) |
| Rate-limiters, contexte partagé | `server/routes/limiters.ts`, `server/routes/_context.ts` |

**Data** : tout passe par `server/storage.ts` (~1500 lignes). Schémas dans `shared/`.

**Frontend** : `client/src/pages/*.tsx` (1 page = 1 route), `client/src/components/`,
`client/src/lib/queryClient.ts` (→ `apiRequest`), `client/src/lib/tenant.ts`.

## Conventions de code

### Frontend
- **TOUS les appels API via `apiRequest` de `@/lib/queryClient`** — jamais `fetch()` brut.
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
  `shared/schema-mysql.ts`, `shared/schema-active.ts`. (Incident historique Phase 3.5-C.)
- **Nouvelle route** = nouveau handler dans le module de domaine existant, jamais dans
  `server/routes/index.ts`. Nouveau domaine = nouveau fichier + `register*` câblé dans l'index.

### Naming
- Variables camelCase. Fichiers kebab-case (helpers), PascalCase (composants React).
- Routes API : `/api/...`, sous-groupées. **Public sans auth** : préfixe `/api/public/...`.

## Variables d'environnement

Voir `.env.example`. Les critiques :

| Variable | Rôle |
|---|---|
| `DB_DRIVER` | `sqlite` (dev) ou `mysql` (prod) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Config MySQL |
| `SESSION_SECRET` | 32+ chars (`openssl rand -hex 32`) |
| `COOKIE_NAME` | `naturo_sid` en prod |
| `MAILJET_API_KEY` / `MAILJET_API_SECRET` / `MAIL_FROM` / `MAIL_FROM_NAME` | Email |
| `PUBLIC_URL` | URL publique (liens dans les emails) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth Calendar (optionnel) |

## Workflow

1. Comprendre la demande, puis lire les fichiers concernés (utiliser la carte ci-dessus).
2. Si > 200 lignes à changer, proposer un plan avant.
3. Implémenter en respectant les conventions.
4. **Vérifier — les deux sont obligatoires avant d'expédier :**
   - `npm run check` — types (tsc)
   - `npm test` — suite unitaire (`server/**`, `shared/**`, `client/src/**`)
5. Selon le changement, ajouter la vérification pertinente :
   - `npm run smoke` — toutes les routes répondent (après touche au routing)
   - `npm run test:e2e` — parcours fonctionnel complet
   - `npm run test:ui` — Playwright (après touche à l'UI)
   - `npm run routes:inventory` — régénère `docs/routes-inventory.txt`
6. Tester dans le navigateur : lancer la config **`naturo-dev`** de `.claude/launch.json`
   (`npm run dev`, port 3000) via l'outil de preview, pas via un shell détaché.
7. Toute logique non triviale ajoutée laisse **un** test à côté (`*.test.ts`, `node:test`).
8. `npm run build` → `dist/index.cjs` + `dist/public/`. Déploiement : `docs/DEPLOY.md`.

`npm run db:push` tourne automatiquement en `predev` / `pretest`.

## Anti-patterns

- ❌ `fetch()` brut client → `apiRequest`
- ❌ `localStorage` client → backend
- ❌ Drizzle direct dans les routes → `storage`
- ❌ Router inline dans `server/routes/index.ts` → module de domaine
- ❌ Livrer sur `npm run check` seul → `npm test` aussi
- ❌ `npm install` sans demander → `package-lock.json` + surface de sécurité
- ❌ Refactoriser sans demander → app en prod avec des comptes payants
- ❌ Toucher `vite.config.ts` / `drizzle.config.ts` / `script/build.ts` sans nécessité absolue

## Ressources

- `.claude/skills/email-templates/` — **skill projet** : kinds, `renderUserTemplate`, variables
  disponibles. Le charger dès qu'on touche `server/email-templates/`, la page `/app/email-templates`
  ou l'envoi d'emails aux clients.
- `.claude/launch.json` — configs de dev (`naturo-dev`, port 3000).
- `docs/ARCHITECTURE.md` — vue d'ensemble
- `docs/DEPLOY.md` — déploiement prod. **Le WordPress `ecole-naturo.fr` vit sur le MÊME compte
  SSH que l'app** (alias `naturo-prod`) : `domains/ecole-naturo.fr/public_html`, avec `wp-cli`
  en `/usr/local/bin/wp`. Pas besoin d'une seconde clé — celle du déploiement suffit. Utile dès
  qu'une action SEO demande de toucher au site principal (maillage interne, redirections).
- `docs/ROADMAP.md` — features prévues · `docs/HISTORY.md` — phases livrées
- `docs/AUDIT-2026-07-28.md` — dernier audit du code
- **`docs/SEO-TRACKING.md` — état du SEO, action par action. À lire AVANT tout nouvel audit SEO :
  `npm run seo:check` rejoue les tests sur la prod et dit ce qui tient. Ne relancer une analyse
  complète que sur ce qui échoue.** Audit d'origine : `docs/AUDIT-SEO-2026-08-15.md`.
- `docs/routes-inventory.txt` — inventaire généré de toutes les routes (`npm run routes:inventory`)
- `docs/superpowers/{specs,plans}/` — specs et plans d'implémentation
