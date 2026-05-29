# Split de `server/routes.ts` — état & reprise (Phase 4.0)

> Fichier de passation pour reprendre le refactor dans une nouvelle session.
> **Temporaire** : ce dossier `docs/_refactor/` est supprimé au commit final du refactor.

## Où on en est

- Branche : **`refactor/split-routes`** (créée depuis `main`). **Rien n'est poussé.**
- `main` intacte : `f53e989` "fix: compat Windows/dev local + bundle CJS" — ne jamais y toucher sans accord explicite.
- `server/routes.ts` : 2877 → ~456 lignes (rétréci au fil des étapes ; reste cœur middlewares + AUTH + orchestration).

### Étapes faites
| Étape | Domaine | Module créé |
|---|---|---|
| 0 | socle | `server/routes/helpers/{tokens,html,google-sync,invoices,email-sending,reminders}.ts`, `cron.ts`, `_context.ts`, `index.ts` + filet de sécurité (`script/routes-inventory.ts`, `script/smoke-routes.ts`, scripts npm `routes:inventory`/`smoke`, `docs/_refactor/routes-inventory.txt`) |
| 1 | categories | `server/routes/categories.ts` |
| 2 | availability | `server/routes/availability.ts` |
| 3 | profile | `server/routes/profile.ts` |
| 4 | clients | `server/routes/clients.ts` |
| 5 | appointments | `server/routes/appointments.ts` |
| 6 | email-templates | `server/routes/email-templates.ts` |
| 7 | reminders | `server/routes/reminders.ts` |
| 8 | invoices | `server/routes/invoices.ts` |
| 9 | admin | `server/routes/admin.ts` |
| 10 | google | `server/routes/google.ts` |
| 11 | internal+crons | `server/routes/internal.ts` (les crons in-process vivent déjà dans `cron.ts`, étape 0) |
| 12 | public/booking/manage | `server/routes/public.ts` + `server/routes/limiters.ts` + `_context.ts` complété |

### Étapes restantes (ordre)
`13. auth` (extraire `/api/auth/*` dans `server/routes/auth.ts`, `registerAuthRoutes(app, ctx)` avec `ctx.authLimiter`) → `14. final` (routes.ts ne contient plus que middlewares + hack + startCrons + orchestration ; décider : supprimer routes.ts au profit de routes/index.ts, ou garder un orchestrateur minimal ; recommandation à proposer + suppression de `docs/_refactor/`).

- `appointments` (fait) : routes CRUD + détail + `/:id/note` + `/api/notes/:id`, avec `patchAppointmentSchema` et `noteContentSchema`. Importe `syncApptToGoogle` + `createInvoiceFromAppointment` depuis `server/routes/helpers/`.
- `email-templates` (fait) : 4 routes `/api/email-templates*`. `defaults.ts`/`render.ts` sont des feuilles sans imports → repassées en imports statiques (le lazy `await import` "anti-cycle" était superflu). Aucun seed au démarrage.
- `reminders` (fait) : `/api/reminders/log`, `/api/reminders/stats`, et `/api/appointments/:id/send-reminder` (rappel manuel PHASE 3.5-D, migré ici). Le rappel manuel construit son email inline (`renderReminderEmail`) → n'utilise PAS `helpers/reminders.ts`. ⚠️ Les crons `/api/internal/send-reminders` + `/api/internal/send-daily-recap` (qui consomment `helpers/reminders.ts`) **restent dans `routes.ts`** → domaine `internal`+crons.
- `invoices` (fait) : CRUD `/api/invoices*` + `from-appointment/:id` + `:id/pdf` (stream binaire, verbatim) + `:id/send`. Importe la lib `../invoices` + helpers `createInvoiceFromAppointment` & `getEmailConfigForUser`.
- `clients` confirmé **séparable** d'`appointments` (déjà migré).

- `admin` (fait) : les 2 blocs (email-log scoped + users/impersonate/extend-trial/me) consolidés dans `server/routes/admin.ts`, register placé à l'emplacement du 1er bloc (admin/users remonte ~140 lignes — sans danger, aucune route non-admin entre les deux ne partage de path/method). `userWithStats` + schemas déplacés avec. `adminLimiter` reste en `app.use("/api/admin", …)` dans routes.ts → pas de ctx. L'erreur tsc préexistante du `email-log` a migré routes.ts → admin.ts (total constant 6).

- `google` (fait) : 5 routes (`/api/auth/google`, `/callback`, `/api/google/status`, `/disconnect`, `/sync-import`) dans `server/routes/google.ts`. ⚠️ Le hack `(registerRoutes as any).__importFromGoogleForUser = importFromGoogleForUser;` **est resté dans `routes.ts`** (verbatim, juste après le register call).
- `internal`+crons (fait) : les 3 endpoints (`/api/internal/sync-google-all`, `/send-reminders`, `/send-daily-recap`) dans `server/routes/internal.ts` (`registerInternalRoutes`). **Deux styles de protection conservés verbatim** : sync-google-all check inline `process.env.INTERNAL_CRON_TOKEN` (403/query-fallback) ; les 2 autres via `checkInternalToken`+const `INTERNAL_TOKEN` (401, header `x-internal-token`). Const `INTERNAL_TOKEN` retirée de routes.ts (devenue morte ; `APP_URL` reste, utilisée par `/api/rdv/cancel`). **Découverte** : `cron.ts` (étape 0) importe `importFromGoogleForUser` directement → le hack `__importFromGoogleForUser` est en réalité **mort** (personne ne le lit), mais conservé verbatim sur demande de Julien. `startCrons()` reste appelé depuis routes.ts.

- `public`/booking/manage (fait) : 10 routes dans `server/routes/public.ts` (`registerPublicRoutes(app, ctx)`), regroupant les 3 blocs jadis dispersés (page publique+booking, tokens `/api/rdv/*`, manage `/api/public/manage/*`). Tout remonté à l'emplacement du 1er bloc public — ordre Express sûr (aucun chevauchement de path avec les routes non-publiques intercalées). **Limiters** : extraits en singletons dans `server/routes/limiters.ts` ; `routes.ts` les importe (au lieu de les définir inline) ; `_context.ts.createContext()` réexpose les **mêmes instances** + `APP_URL`. **`req.tenantUserId`** : déjà dans `AuthedRequest` (`server/auth.ts`), pas d'augmentation inline → rien à déplacer (pas de `express.d.ts`). **APP_URL** : retiré de routes.ts (devenu mort), fourni via `ctx.APP_URL`.
  - ✅ **Étape 12.5 — bookingLimiter (changement comportement, séparé du refactor)** : `bookingLimiter` (dead code détecté à l'étape 12) branché sur `POST /api/public/:slug/book` dans un commit isolé. **1er changement d'inventaire depuis l'étape 0** : ligne du book passe `[]` → `[ctx.bookingLimiter]`. Micro-écart au "handler verbatim" : `String(req.params.slug)` (coercion type-only, no-op runtime) pour neutraliser le quirk de typage Express (middleware → `req.params` inféré `string|string[]`) et garder tsc à 6. Voir `docs/HISTORY.md`.
  - public.ts ≈ 480 lignes < 700 → un seul fichier (pas de split public-booking/public-manage pour l'instant).

### Ce qui RESTE dans routes.ts (cœur, non splitté)
- Middlewares globaux : `cookieParser`, `attachUser`, détection sous-domaine tenant (`BASE_DOMAIN`), trial-guard, + `app.use` des limiters (`publicLimiter`/`adminLimiter`/`apiLimiter`) maintenant importés de `./routes/limiters`.
- Domaine **AUTH** (jamais prévu comme étape séparée) : register/login/logout/me, verify-email, forgot/reset password, onboarding, GDPR export+delete.
- Le hack `__importFromGoogleForUser`, l'appel `startCrons()`, la const `APP_URL`.
- Domaine **public/booking/manage** (DERNIER, à cadrer avec Julien) : `/api/public/_self`, `/api/public/:slug`, `/api/public/:slug/availability`, `/api/public/:slug/book` (bookingLimiter), `/api/rdv/confirm/:token`, `/api/rdv/cancel/:token`, et les routes `/api/public/manage/:token*` (PHASE 3.5-B). Tokens magiques + rate-limit → c'est là que `ctx`/limiters servent.

## Pattern de migration (par étape)

1. Créer `server/routes/<domaine>.ts` exportant `register<Domaine>(app[, ctx])`.
   - Handlers **verbatim** : mêmes messages d'erreur, mêmes codes HTTP, même ordre des `await`. Zéro reformulation.
   - Déplacer les schémas Zod **locaux** (ex. `patch<X>Schema`) avec leur domaine.
   - Imports **strictement limités** à ce que le module consomme.
   - `ctx` (via `createContext` de `server/routes/_context.ts`) seulement pour les domaines à rate-limiter : **auth, public, admin**. Les autres : `register<Domaine>(app)`.
2. Dans `server/routes.ts` : ajouter l'import et **remplacer le bloc de routes par `register<Domaine>(app)` à l'emplacement EXACT** (ordre de matching Express préservé — ni plus haut ni plus bas).
3. Suppression dans `routes.ts` : **transformation ancrée-contenu** (script jetable `tsx` qui slice entre 2 sous-chaînes ASCII uniques, fail-safe si ancre absente/non-unique). **Ne pas** faire d'Edit manuel sur des blocs contenant du non-ASCII (`é`, `—`, `•`, `─`) — ça échoue.

## Garde-fou complet par étape (tout doit passer avant commit)

1. `npm run routes:inventory` → `git diff docs/_refactor/routes-inventory.txt` **strictement vide** (75 routes, mêmes paths/middlewares ; le fichier est *file-agnostic* donc déplacer une route entre fichiers ne change rien).
2. `npm run check` → **6 erreurs `tsc` préexistantes**, **0 nouvelle** (elles peuvent migrer de fichier — total constant = 6).
3. `npm run build` → `dist/index.cjs` produit, **3 warnings `import.meta` cosmétiques** (db/storage/google), aucun nouveau.
4. `npm run dev` (background) puis `npm run smoke` → **toutes vertes** (login démo `marie@demo.fr`/`demo1234`). Stopper le dev ensuite (libérer le port 3000).

Bonus utile : ajouter 1-2 routes du domaine migré au smoke (`script/smoke-routes.ts`).

## Conventions

- **Commit atomique par étape**, message `refactor(routes): étape N — domaine <x>`, co-author Claude. **Jamais de push** sans OK explicite.
- **Recap groupé toutes les 2-3 étapes** (pas après chaque commit).
- S'arrêter et prévenir si : un garde-fou casse, un domaine s'avère inséparable d'un autre (fusionner alors en une étape), ou avant `public/booking/manage`.
- Windows/PowerShell, Node 24, pas de `&` PowerShell ; dev server lancé en background.

## Fin du refactor

Quand `server/routes.ts` ne contient plus de routes : le supprimer, faire de `server/routes/index.ts` le point d'entrée (`server/index.ts` importe alors `./routes`), **supprimer `docs/_refactor/`** (inventaire + ce fichier), garde-fou final, puis proposer le merge.
