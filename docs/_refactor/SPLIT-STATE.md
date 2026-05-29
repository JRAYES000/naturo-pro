# Split de `server/routes.ts` — état & reprise (Phase 4.0)

> Fichier de passation pour reprendre le refactor dans une nouvelle session.
> **Temporaire** : ce dossier `docs/_refactor/` est supprimé au commit final du refactor.

## Où on en est

- Branche : **`refactor/split-routes`** (créée depuis `main`). **Rien n'est poussé.**
- `main` intacte : `f53e989` "fix: compat Windows/dev local + bundle CJS" — ne jamais y toucher sans accord explicite.
- `server/routes.ts` : 2877 → ~1513 lignes (rétréci au fil des étapes).

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

### Étapes restantes (ordre)
`7. reminders` → `invoices` → `admin` → `google` → `internal`+crons → **`public`/booking/manage` (dernier — PRÉVENIR l'utilisateur avant d'attaquer).

- `appointments` (fait) : routes CRUD + détail + `/:id/note` + `/api/notes/:id`, avec `patchAppointmentSchema` et `noteContentSchema`. Importe `syncApptToGoogle` + `createInvoiceFromAppointment` depuis `server/routes/helpers/`. ⚠️ `/api/appointments/:id/send-reminder` migre avec le domaine `reminders` (étape 7), pas `appointments`.
- `email-templates` (fait) : 4 routes `/api/email-templates*`. `defaults.ts`/`render.ts` sont des feuilles sans imports → repassées en imports statiques (le lazy `await import` "anti-cycle" était superflu). Aucun seed au démarrage.
- `clients` confirmé **séparable** d'`appointments` (déjà migré).

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
