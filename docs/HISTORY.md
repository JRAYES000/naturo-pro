# Historique des releases — Naturo Pro

Récap des phases livrées avant le passage à Claude Code.

---

## Phase 0 — Fondations (initial)

- Architecture Express + Vite + Drizzle
- Schéma DB initial : users, clients, categories, appointments, availability
- Auth sessions Express + bcrypt
- Agenda basique
- Page publique de booking minimal

---

## Phase 0.5-0.7 — Polissage initial

- Onboarding nouveaux praticiens
- Categories avec durée/prix/lieu/couleur
- Congés ponctuels (`breaks`)
- Email de confirmation booking
- `cancelToken` sur appointments (Phase 0.7)
- Récap par défaut J-1 (`reminders` settings)

---

## Lots 1-5 — Sécurité & robustesse

### Lot 1 — Validation Zod
- Toutes les routes API validées par Zod avant DB
- Erreurs structurées

### Lot 2 — Audit isolation
- Vérification que chaque user ne peut voir/modifier que ses propres données
- Middleware `requireAuth` + filtre `userId` systématique sur les queries

### Lot 3 — Robustesse erreurs
- Try/catch + error boundaries frontend
- Logs structurés serveur

### Lot 4 — Performance
- Index DB sur les colonnes fréquemment filtrées
- Query batching côté TanStack Query

### Lot 5 — Sécurité finale
- Audit isolation 16/16 PASS (chaque endpoint testé)
- Cookies httpOnly + secure + SameSite
- Hash bcrypt 10 rounds
- Bundle md5 `6afde2c77c4b2b77745d30432243dac1`

---

## Phase 3 — Booking polish + Reminders UI

Deux chantiers livrés en parallèle via sous-agents :

**Chantier Booking** : 9 améliorations UX sur le flow public
- BookingStepIndicator (barre de progression)
- BookingConfirmation (page de confirmation visuelle)
- Validation client côté frontend
- Meilleur affichage des créneaux indisponibles
- Récap avant validation

**Chantier Reminders** : nouvelle page `/app/reminders`
- Liste des RDV avec statut de rappel (envoyé / pas envoyé / désactivé)
- Toggle par RDV
- Trigger manuel d'envoi de rappel

Bundle md5 `0d4dc35960...`

---

## Phase 3.5 — 4 chantiers parallèles

Quatre features livrées en parallèle avec règles strictes anti-conflit (sections délimitées dans routes.ts) :

### 3.5-A — Email confirmation + ICS
- Refactor `sendBookingConfirmationEmail` en template HTML structuré
- Pièce jointe `.ics` (RFC 5545) générée par `server/ics.ts`
- Le client peut ajouter le RDV à son calendrier en 1 clic
- Hook avec Phase 3.5-B : `ensureCancelToken` appelé pour générer le lien de gestion

### 3.5-B — Page publique de gestion RDV
- Route `/manage/:token` (frontend) et `/api/public/manage/:token/*` (backend)
- Le client peut **annuler** son RDV sans login (token unique dans l'email)
- Le client peut **demander un report** (formulaire libre)
- Notification au praticien sur annulation

### 3.5-C — Éditeur de templates email
- Nouvelle page `/app/email-templates` (sidebar entry "Templates email" avec icône MailOpen)
- 3 templates éditables : `confirmation`, `reminder_d1`, `cancellation`
- Variables documentées dans la sidebar : `{{client.name}}`, `{{appointment.date}}`, etc.
- Preview en direct
- Table `email_templates` (userId, kind, subject, bodyHtml) avec contrainte unique (userId, kind)
- **Incident corrigé** : la table manquait dans `schema-mysql.ts` → 500 en prod sur GET /api/email-templates. Fix + manuel CREATE TABLE.

### 3.5-D — Rappel manuel depuis l'agenda
- Bouton "Envoyer le rappel" sur chaque RDV dans l'agenda
- Réutilise la logique de `sendRemindersForUser` pour un seul RDV
- Indicateur visuel "Rappel envoyé"

Bundle prod Phase 3.5 : md5 `daf50f512c9e1e0416f25307858f5b4b`

---

## Phase 3.5.5 — Branchement templates DB sur les envois

**Objectif** : faire en sorte que les templates éditables (Phase 3.5-C) soient réellement utilisés lors des envois email (ils ne servaient à rien avant ça : édités en DB mais jamais lus par le code d'envoi).

### Livré

- **Helper `server/email-templates/render-user.ts`** : `renderUserTemplate(userId, kind, vars)` qui essaie d'abord le template DB, fallback sur les défauts, retourne `null` en cas d'erreur pour permettre au caller de fallback sur le rendu hardcodé legacy.
- **Syntaxe conditionnelle** ajoutée à `render.ts` : `{{#if x.y}}...{{/if}}` (vide = bloc retiré). Remplace l'ancien hack `{{addr}}<p>...</p>{{addr}}`.
- **Templates par défaut nettoyés** (`defaults.ts`) :
  - `confirmation` et `reminder_d1` : adresse en bloc conditionnel
  - `cancellation` : reformulé pour s'adresser **au praticien** (le destinataire de l'email) avec détails complets du RDV annulé
- **3 sites de branchement** dans `server/routes.ts` :
  1. `sendBookingConfirmationEmail` (kind `confirmation`)
  2. `sendRemindersForUser` (kind `reminder_d1`, avec migration de `cancelLink` vers `/#/manage/...`)
  3. `POST /api/public/manage/:token/cancel` (kind `cancellation` envoyé au praticien)

Bundle prod : md5 `c8f31972505f82e08b19fdf372fe614f`

---

## Compat Windows / dual ESM-CJS (premier setup dev sous Claude Code)

**Contexte** : reprise du projet sur une machine Windows 11 / PowerShell / Node 24, sans WSL. Le projet (développé sous Linux) ne démarrait pas en l'état. Corrections de portabilité, sans changement fonctionnel.

### Le hack `import.meta.url || __filename`

Le projet est en `"type": "module"` (ESM). En dev, `tsx` exécute du vrai ESM où `import.meta.url` existe. Mais le build prod bundle en **CJS** (`dist/index.cjs` via esbuild), format dans lequel `import.meta` n'existe pas : esbuild le remplace par un objet vide `{}`, donc `import.meta.url` devient `undefined`.

Les drivers DB et `googleapis` sont chargés via un `require()` paresseux (volontaire : éviter de charger `mysql2` en dev SQLite et `better-sqlite3` en prod MySQL). En ESM, `require` n'existe pas → on le recrée avec `createRequire(...)`. D'où le pattern, dans `server/db.ts`, `server/storage.ts`, `server/google.ts` :

```ts
const require = createRequire(import.meta.url || __filename);
```

- **Dev (tsx/ESM)** : `import.meta.url` est une URL `file://…` valide → utilisée. `__filename` (absent en ESM) n'est jamais évalué grâce au court-circuit `||`.
- **Prod (esbuild/CJS)** : `import.meta.url` → `undefined` → fallback sur `__filename`, natif en CJS.

⚠️ **Sans le fallback `__filename`, le bundle crashait au boot** (`TypeError: createRequire(undefined)`) — un build « réussi » mais non déployable. Toujours valider un build via `node dist/index.cjs` (DB_DRIVER=sqlite) avant deploy.

### 3 warnings esbuild attendus (cosmétiques)

Le build émet 3 × `"import.meta" is not available with the "cjs" output format and will be empty`. **Normaux et sans impact** : le token `import.meta.url` reste dans la source, mais le runtime est correct via `__filename`. Ce hack pourra disparaître si le bundle passe un jour en format ESM (voir ROADMAP Phase 4.0).

### Autres corrections de portabilité

- `cross-env` dans les scripts `dev`/`start` (Windows ne reconnaît pas `NODE_ENV=x` en préfixe).
- `require()` → imports ESM statiques dans `shared/schema-active.ts`.
- `reusePort: process.platform === "linux"` dans `server/index.ts` (ENOTSUP sur Windows/macOS).
- `better-sqlite3` + `@types/better-sqlite3` ajoutés en devDependencies (volontairement hors deps prod = MySQL).
- `.gitignore` : ajout des fichiers SQLite WAL/SHM/journal.

---

## Hardening — bookingLimiter activé sur `/api/public/:slug/book`

Découvert pendant le refactor (split de `server/routes.ts`, étape 12) : le rate-limiter
`bookingLimiter` était **défini mais jamais appliqué** (dead code). Activé à l'étape 12.5
dans un commit isolé (changement de comportement, distinct du refactor verbatim).

- **Pourquoi** : `POST /api/public/:slug/book` est un endpoint **public non-authentifié** qui
  **crée des données en DB** (un RDV) → cible évidente de spam/abus.
- **Seuils** (inchangés depuis la définition d'origine, voir `server/routes/limiters.ts`) :
  `windowMs: 60 * 60 * 1000` (1 h), `max: 30` réservations / IP / heure,
  `standardHeaders: true`, `legacyHeaders: false`,
  message : « Trop de réservations depuis cette adresse. »
- **Impact inventaire** : 1er changement de `routes-inventory.txt` depuis le début du split —
  la ligne `POST /api/public/:slug/book` passe de `[]` à `[ctx.bookingLimiter]`.

---

## Convention de versioning interne

Pas de tags git semantic-version. Les "phases" sont des jalons internes informels :
- `Lot X` = chantier sécurité/robustesse
- `Phase X.Y` = jalon fonctionnel
- `Phase X.Y-A/B/C/D` = sous-chantier parallèle d'une phase

L'identification précise d'une version en prod se fait via **md5 du bundle** `dist/index.cjs`.

---

## Backups conservés en prod (au moment du passage à Claude Code)

| Tag | md5 |
|---|---|
| `dist/index.cjs.bak.before-lot1` | (avant Lot 1) |
| `dist/index.cjs.bak.before-lot24` | (avant Lot 2+4) |
| `dist/index.cjs.bak.before-lot5` | `0d4dc35960...` |
| `dist/index.cjs.bak.before-phase3-booking-relances` | (avant Phase 3) |
| `dist/index.cjs.bak.before-phase35` | `0d4dc35960...` |
| `dist/index.cjs.bak.before-phase355` | `daf50f512c9...` |
| `dist/index.cjs` (actuel) | `c8f31972505f82e08b19fdf372fe614f` |

Un cleanup périodique de ces backups est à prévoir (garder les 3 derniers max).
