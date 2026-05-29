# Naturo Pro

Application web de gestion de cabinet pour praticiens en naturopathie (et thérapeutes en général) : agenda, prise de rendez-vous publique, gestion clients, rappels email automatiques, templates d'emails personnalisables, facturation.

> **Statut** : application en production, utilisée par de vrais praticiens. Phase 3.5.5 livrée (templates email DB-éditables + ICS attachment + notifications d'annulation).

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Wouter (hash routing) |
| State / data | TanStack Query v5 + react-hook-form + Zod |
| Backend | Node.js 24 + Express + TypeScript |
| ORM | Drizzle ORM |
| DB (dev) | SQLite via `better-sqlite3` |
| DB (prod) | MySQL 8 |
| Auth | Sessions Express + bcrypt (pas de JWT) |
| Email | Mailjet SMTP |
| Build | `tsx` + esbuild (custom build script dans `script/build.ts`) |

## Démarrage rapide (dev local)

Prérequis : **Node.js 20+** (24 recommandé pour matcher la prod), **npm**, **git**.

```bash
git clone https://github.com/JRAYES000/naturo-pro.git
cd naturo-pro
npm install
cp .env.example .env
# Édite .env : laisse DB_DRIVER=sqlite pour le dev local, génère un SESSION_SECRET
npm run dev
```

L'app démarre sur `http://localhost:3000` (frontend Vite + backend Express sur le même port).

### Comptes de démo

En mode SQLite, le seed crée automatiquement deux comptes :

- `marie@demo.fr` / `demo1234` (id=1, slug `marie-dupont`)
- `julien@demo.fr` / `demo1234` (id=2, slug `julien-rayes`)

## Structure du projet

```
naturo-pro/
├── client/                 # Frontend React (Vite)
│   ├── src/
│   │   ├── pages/         # Pages principales (Agenda, Clients, Booking, ...)
│   │   ├── components/    # Composants partagés + ui/ (shadcn)
│   │   ├── lib/           # queryClient, utils
│   │   └── App.tsx        # Router Wouter + useHashLocation
│   └── index.html
├── server/                 # Backend Express
│   ├── index.ts           # Entry point
│   ├── routes.ts          # ⚠️ 3000+ lignes — candidat au split
│   ├── storage.ts         # Couche d'accès DB (Drizzle queries)
│   ├── auth.ts            # Sessions + bcrypt
│   ├── db.ts              # Connexion SQLite ou MySQL selon DB_DRIVER
│   ├── email.ts           # Envoi via Mailjet SMTP
│   ├── email-templates/   # Templates HTML + interpolation {{vars}}
│   ├── ics.ts             # Génération .ics RFC 5545
│   ├── google.ts          # OAuth Google Calendar
│   ├── invoices.ts        # Facturation
│   └── seed.ts            # Données de démo (SQLite uniquement)
├── shared/                 # Schémas Drizzle partagés client ↔ server
│   ├── schema.ts          # SQLite (dev)
│   ├── schema-mysql.ts    # MySQL (prod)
│   └── schema-active.ts   # Sélecteur runtime selon DB_DRIVER
├── migrations/             # SQL manuel pour la prod MySQL
├── script/build.ts        # Build custom (esbuild + Vite)
└── docs/                   # Documentation projet
    ├── ARCHITECTURE.md
    ├── ROADMAP.md
    ├── DEPLOY.md
    └── HISTORY.md
```

## Scripts disponibles

| Commande | Effet |
|---|---|
| `npm run dev` | Dev server (Vite + Express sur :3000) |
| `npm run build` | Build prod (bundle backend `dist/index.cjs` + frontend `dist/public/`) |
| `npm start` | Lance le bundle prod |
| `npm run check` | TypeScript type-check sans build |
| `npm run db:push` | Drizzle push schéma SQLite |
| `npm run db:push:mysql` | Drizzle push schéma MySQL |

## Fonctionnalités principales

- **Agenda** : vue jour/semaine/mois, drag & drop, créneaux multi-prestations
- **Page publique de booking** : URL `/p/:slug`, choix prestation → créneau → infos client → confirmation email + .ics
- **Gestion clients** : fiches, historique, notes de séance, recherche
- **Catégories / prestations** : durée, prix, lieu, couleur
- **Disponibilités** : horaires hebdomadaires + congés ponctuels
- **Rappels J-1 automatiques** + envoi manuel depuis l'agenda
- **Templates email personnalisables** (`/app/email-templates`) avec variables `{{client.name}}`, `{{appointment.date}}`, etc. + bloc conditionnel `{{#if x.y}}...{{/if}}`
- **Page publique de gestion RDV** (`/manage/:token`) : le client peut annuler ou demander un report sans login
- **Notifications praticien** : email automatique en cas d'annulation client
- **Facturation** : génération de factures PDF
- **Intégration Google Calendar** : push/sync bidirectionnel optionnel

## Documentation complète

- [`CLAUDE.md`](./CLAUDE.md) — instructions pour Claude Code (règles dures, conventions)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — vue d'ensemble du système
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — features prévues (Stripe, SMS, multi-praticien...)
- [`docs/DEPLOY.md`](./docs/DEPLOY.md) — procédure de déploiement
- [`docs/HISTORY.md`](./docs/HISTORY.md) — historique des releases (Lots 1-5, Phases 3 à 3.5.5)

## Licence

MIT
