# Split de `server/routes.ts` — état & reprise (Phase 4.0)

> Fichier de passation pour reprendre le refactor dans une nouvelle session.
> **Temporaire** : ce dossier `docs/_refactor/` est supprimé au commit final du refactor.

## Où on en est

- Branche : **`refactor/split-routes`** (créée depuis `main`). **Rien n'est poussé.**
- `main` intacte : `f53e989` "fix: compat Windows/dev local + bundle CJS" — ne jamais y toucher sans accord explicite.
- `server/routes.ts` : 2877 → ~1103 lignes (rétréci au fil des étapes).

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

### Étapes restantes (ordre)
`9. admin` → `google` → `internal`+crons → **`public`/booking/manage` (dernier — PRÉVENIR l'utilisateur avant d'attaquer).

- `appointments` (fait) : routes CRUD + détail + `/:id/note` + `/api/notes/:id`, avec `patchAppointmentSchema` et `noteContentSchema`. Importe `syncApptToGoogle` + `createInvoiceFromAppointment` depuis `server/routes/helpers/`.
- `email-templates` (fait) : 4 routes `/api/email-templates*`. `defaults.ts`/`render.ts` sont des feuilles sans imports → repassées en imports statiques (le lazy `await import` "anti-cycle" était superflu). Aucun seed au démarrage.
- `reminders` (fait) : `/api/reminders/log`, `/api/reminders/stats`, et `/api/appointments/:id/send-reminder` (rappel manuel PHASE 3.5-D, migré ici). Le rappel manuel construit son email inline (`renderReminderEmail`) → n'utilise PAS `helpers/reminders.ts`. ⚠️ Les crons `/api/internal/send-reminders` + `/api/internal/send-daily-recap` (qui consomment `helpers/reminders.ts`) **restent dans `routes.ts`** → domaine `internal`+crons.
- `invoices` (fait) : CRUD `/api/invoices*` + `from-appointment/:id` + `:id/pdf` (stream binaire, verbatim) + `:id/send`. Importe la lib `../invoices` + helpers `createInvoiceFromAppointment` & `getEmailConfigForUser`.
- `clients` confirmé **séparable** d'`appointments` (déjà migré).

### Cartographie des domaines restants (relevé étape 8 — pour anticiper)
- ⚠️ **`admin` n'est PAS contigu** : 2 blocs séparés dans `routes.ts` — (a) `/api/admin/email-log` (scoped user, `requireAuth` **seul**, fait des `import()` dynamiques de `db`/`emailLog`/`eq`) ; (b) `/api/admin/users*` + `impersonate` + `extend-trial` + `/api/admin/me` (`requireAuth`+`requireAdmin`). Entre les deux : routes publiques `/api/rdv/*` + internes. `requireAdmin`/`isAdminEmail` viennent déjà de `../auth` (exportés proprement, pas inline). Le bloc admin/users s'appuie sur un helper `userWithStats(...)` défini dans `routes.ts` → à déplacer dans le module admin avec lui (vérifier ses dépendances).
- **`google`** : routes `/api/auth/google` + `/api/auth/google/callback` (dans la section AUTH), `/api/google/status`, `/api/google/disconnect`, `/api/google/sync-import`. ⚠️ Le hack `(registerRoutes as any).__importFromGoogleForUser = importFromGoogleForUser;` **RESTE dans `routes.ts`** (registerRoutes pas en scope ailleurs ; lu par le module cron). `/api/internal/sync-google-all` → domaine internal+crons.
- **`internal`+crons** : `/api/internal/sync-google-all`, `/api/internal/send-reminders`, `/api/internal/send-daily-recap` — protégées par token `X-Internal-Token` (const `INTERNAL_TOKEN`). Consomment `importFromGoogleForUser`, `sendRemindersForUser`, `sendDailyRecapForUser` (helpers Étape 0).

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
