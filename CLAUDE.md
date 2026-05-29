# CLAUDE.md — Instructions pour Claude Code

Ce fichier est lu automatiquement par Claude Code à chaque session. Il contient les règles dures, conventions, et contexte essentiel pour travailler efficacement sur Naturo Pro.

---

## 🚨 Règles absolues (ne JAMAIS violer)

1. **Ne JAMAIS déployer en production sans validation explicite de l'utilisateur.** Toujours demander confirmation avant `scp` du bundle ou modification de la prod.
2. **Ne JAMAIS commit de secrets** (mots de passe, clés API, tokens, IPs serveur). Le repo est public.
3. **Toute UI doit être en français** — l'app est utilisée par des praticiens francophones.
4. **Ne pas migrer vers Supabase / Next.js / autre stack** sans validation explicite. Le stack actuel (Express + Drizzle + Wouter + Vite) est volontairement conservé.
5. **L'auth reste Express + bcrypt** — pas de Supabase Auth, pas de NextAuth, pas de Clerk.

## Contexte business

- **Utilisateur** : Julien Rayes, entrepreneur français basé à Sofia (Bulgarie), digital marketer et formateur en naturopathie éligible CPF.
- **Cible** : praticiens en naturopathie (et thérapeutes en général) qui veulent un agenda + booking + facturation simple.
- **Statut** : en production sur app.ecole-naturo.fr, 2 comptes réels (Marie demo, Julien owner). Pas encore monétisé.

## Stack technique

- Frontend : **React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Wouter** (hash routing avec `useHashLocation`)
- State : **TanStack Query v5** + react-hook-form + Zod
- Backend : **Node.js 24 + Express + TypeScript** (bundle unique via esbuild)
- ORM : **Drizzle**
- DB dev : **SQLite** (better-sqlite3)
- DB prod : **MySQL 8** (hébergement Hostinger Cloud Pro)
- Email : **Mailjet SMTP**
- Auth : **sessions Express + bcrypt** (cookie httpOnly)

## Conventions de code

### Frontend
- **TOUS les appels API passent par `apiRequest` de `@/lib/queryClient`** — jamais `fetch()` brut.
- **TanStack Query v5** : utiliser uniquement la forme objet `useQuery({ queryKey, queryFn })`.
- **Query keys hiérarchiques** : `['/api/clients', clientId]` (tableau), pas de template strings.
- **Toujours invalider après mutation** : `queryClient.invalidateQueries({ queryKey: [...] })`.
- **Wouter avec `useHashLocation`** — URLs en `/#/agenda`, jamais path-based. Le `<Router hook={useHashLocation}>` enveloppe `<Switch>`, pas l'inverse.
- **Formulaires** : `useForm` + `zodResolver` + insert schema de `@shared/schema.ts`.
- **Tests IDs** : `data-testid="button-{action}-{target}"` pour interactif, `data-testid="text-{content}-{id}"` pour affichage dynamique.
- **Tailwind** : utiliser les utility classes du thème (`leaf-bg`, `card-naturo`, `rounded-[15px] py-6 font-bold`).
- **Couleurs thème** : primary `#186749`, accent `#17EC9B`, dark `#1b4332`.
- **Toast** : `useToast` depuis `@/hooks/use-toast`.
- **❌ Jamais `localStorage` / `sessionStorage` / cookies côté client** pour de la donnée persistante — utiliser le backend.

### Backend
- **Tout passe par `storage` (`server/storage.ts`)** — pas de requête Drizzle directe dans les routes.
- **Validation Zod sur tous les body** avant de toucher la DB.
- **Drizzle better-sqlite3 est SYNCHRONE** : `.get()` (single), `.all()` (array), `.run()` (mutation). Ne **jamais** destructurer la query builder.
- **Schéma actif** : `shared/schema-active.ts` exporte le bon schéma selon `process.env.DB_DRIVER`. ⚠️ Si tu ajoutes une table, l'ajouter dans **les 3 fichiers** : `schema.ts`, `schema-mysql.ts`, `schema-active.ts`. (Voir incident historique Phase 3.5-C.)
- **`server/routes.ts` fait 3000+ lignes** — c'est un candidat évident pour modularisation. Si tu veux le splitter, propose un plan d'abord (probablement en `server/routes/{auth,booking,clients,reminders,email-templates,public}.ts`).

### Naming / Patterns
- **Variables** : camelCase TS.
- **Fichiers** : kebab-case pour les helpers, PascalCase pour les composants React.
- **Routes API** : `/api/...` toujours, sous-groupées (`/api/clients`, `/api/appointments`, `/api/public/...`).
- **Page publique sans auth** : préfixe `/api/public/...`.

## Variables d'environnement

Voir `.env.example`. Les variables critiques :

| Variable | Rôle |
|---|---|
| `DB_DRIVER` | `sqlite` (dev) ou `mysql` (prod) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Config MySQL si `DB_DRIVER=mysql` |
| `SESSION_SECRET` | Chaîne 32+ chars (générer via `openssl rand -hex 32`) |
| `COOKIE_NAME` | `naturo_sid` en prod, défaut sinon |
| `MAILJET_API_KEY` / `MAILJET_API_SECRET` | SMTP |
| `MAIL_FROM` / `MAIL_FROM_NAME` | Expéditeur |
| `PUBLIC_URL` | URL publique de l'app (utilisée dans les liens email) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth Google Calendar (optionnel) |

## Templates email

Les templates email sont **éditables en DB par l'utilisateur** depuis `/app/email-templates`. Trois "kinds" :
- `confirmation` : envoyé au client après booking
- `reminder_d1` : rappel automatique J-1
- `cancellation` : notification au praticien quand un client annule via `/manage/:token`

Le helper `renderUserTemplate(userId, kind, vars)` (dans `server/email-templates/render-user.ts`) :
1. Cherche un template personnalisé en DB
2. Sinon utilise `getDefaultTemplate(kind)` de `defaults.ts`
3. Interpole les variables `{{x.y}}` et les blocs conditionnels `{{#if x.y}}...{{/if}}`
4. Retourne `null` en cas d'erreur DB pour permettre le fallback hardcodé

**Variables disponibles** : `client.name`, `client.email`, `appointment.date`, `appointment.time`, `appointment.duration`, `appointment.category`, `appointment.address`, `practitioner.name`, `practitioner.email`, `cancelLink`.

## Workflow de développement recommandé

1. Comprendre la demande de l'utilisateur avant de coder.
2. Lire les fichiers concernés (`server/routes.ts`, schéma, composants).
3. Si > 200 lignes à changer, proposer un plan avant.
4. Implémenter en respectant les conventions ci-dessus.
5. `npm run check` pour vérifier les types.
6. `npm run dev` pour tester localement.
7. **Demander validation avant de build / déployer.**
8. Build : `npm run build` (produit `dist/index.cjs` + `dist/public/`).
9. Déploiement prod : voir `docs/DEPLOY.md`.

## Anti-patterns à éviter

- ❌ `fetch()` brut côté client → utiliser `apiRequest`
- ❌ `localStorage` côté client → utiliser le backend
- ❌ Requêtes Drizzle directes dans les routes → passer par `storage`
- ❌ Modifier les 3 schémas séparément → utiliser `schema-active.ts` quand possible
- ❌ Ajouter `npm install` sans demander → impact sur `package-lock.json` + sécurité
- ❌ Refactoriser sans demander → l'app est en prod, risque de régression
- ❌ Toucher à `vite.config.ts` / `drizzle.config.ts` / `script/build.ts` sans nécessité absolue

## Ressources

- `docs/ARCHITECTURE.md` — vue d'ensemble du système
- `docs/ROADMAP.md` — features prévues (Stripe, SMS, multi-praticien...)
- `docs/DEPLOY.md` — procédure de déploiement
- `docs/HISTORY.md` — récap des phases livrées
