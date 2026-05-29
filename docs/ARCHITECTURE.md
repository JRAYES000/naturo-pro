# Architecture — Naturo Pro

## Vue d'ensemble

Application **monolithique fullstack TypeScript** : un seul process Node.js sert à la fois l'API REST et le frontend (SPA React buildé). Pas de microservices, pas de serveurless, pas de WebSocket.

```
┌──────────────────────────────────────────────────────────────┐
│                  Navigateur (client final)                   │
│                                                              │
│   SPA React (Wouter hash routing) ←→ fetch /api/...          │
└──────────────────────────────────────────────────────────────┘
                          │ HTTP(S)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│              Node.js + Express (port 3000)                   │
│                                                              │
│   ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│   │   /api/*   │  │  /assets/*  │  │  fallback → index.html│ │
│   │  routes.ts │  │  static.ts  │  │       (SPA)           │ │
│   └─────┬──────┘  └─────────────┘  └──────────────────────┘ │
│         │                                                    │
│         ▼                                                    │
│   ┌───────────┐   ┌──────────┐   ┌──────────┐  ┌─────────┐ │
│   │ storage.ts│   │  auth.ts │   │ email.ts │  │ google.ts│ │
│   │  (Drizzle)│   │ (session)│   │ (Mailjet)│  │ (OAuth) │ │
│   └─────┬─────┘   └──────────┘   └──────────┘  └─────────┘ │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
   ┌─────────────────┐
   │  SQLite (dev)   │  ← fichier local `data.db`
   │  ou MySQL (prod)│  ← serveur distant
   └─────────────────┘
```

## Choix structurants

### Bundle backend unique
Le script `script/build.ts` utilise **esbuild** pour produire un seul fichier `dist/index.cjs` contenant tout le code serveur + ses dépendances. Pas de `node_modules` à transférer en prod. Démarrage instantané.

### Frontend dans le même bundle
Vite build le frontend dans `dist/public/`, qui est servi en static par `server/static.ts`. Les routes API ont priorité, le reste retombe sur `index.html` (SPA fallback).

### Hash routing (Wouter)
Toutes les URLs frontend sont en `/#/...` (ex: `/#/agenda`, `/#/clients/42`). Pourquoi ? Pour que **n'importe quel chemin se résolve sur le serveur** sans configuration de rewrite (utile sur des hébergements basiques comme Hostinger). Inconvénient : pas de SEO. Acceptable car l'app derrière login.

### Driver DB switché à l'exécution
`server/db.ts` lit `process.env.DB_DRIVER` :
- `sqlite` → ouvre `data.db` via `better-sqlite3`, schéma = `shared/schema.ts`
- `mysql` → connexion pool via `mysql2`, schéma = `shared/schema-mysql.ts`

`shared/schema-active.ts` ré-exporte le bon ensemble de tables selon `DB_DRIVER`, ce qui permet au code applicatif d'importer `from "@shared/schema-active"` sans se soucier du driver.

> ⚠️ **Risque connu** : ajouter une table → il faut l'ajouter dans les 2 schémas + `schema-active.ts`. Incident Phase 3.5-C où `emailTemplates` manquait dans le schéma MySQL → 500 en prod.

## Modules backend

### `server/index.ts`
Entry point : créé l'app Express, charge `.env`, branche `auth.ts` puis `routes.ts`, démarre le HTTP server.

### `server/auth.ts`
- Sessions Express avec `express-session` + `connect-better-sqlite3` (ou table MySQL en prod).
- Hash password : **bcrypt** (10 rounds).
- Cookie httpOnly, secure en prod, SameSite=Lax.
- Middleware `requireAuth` qui rejette 401 si pas connecté.

### `server/db.ts`
Connexion DB selon `DB_DRIVER`. Exporte `db` (instance Drizzle) consommé par `storage.ts`.

### `server/storage.ts`
**Couche d'accès données** — toutes les requêtes Drizzle vivent ici. Interface `IStorage` typée. Pattern : `getX(id)`, `listX(filters)`, `createX(input)`, `updateX(id, patch)`, `deleteX(id)`.

### `server/routes.ts` ⚠️
**3000+ lignes** — toutes les routes API dans un seul fichier, organisées par phase. Sections actuelles (de mémoire, ordre approximatif) :
- Auth (`/api/login`, `/api/register`, `/api/me`, ...)
- Catégories / prestations
- Disponibilités / congés
- Clients
- Appointments / agenda
- Booking public (`/api/public/:slug/...`)
- Page de gestion publique (`/api/public/manage/:token/...`)
- Rappels (auto cron + manuel)
- Templates email
- Facturation
- Google Calendar OAuth

**Candidat clair à la modularisation** — voir `ROADMAP.md`.

### `server/email.ts`
Wrapper Mailjet SMTP via `nodemailer`. Helper `sendEmail(cfg, to, subject, html, text, attachments)`.

### `server/email-templates/`
- `defaults.ts` — templates HTML par défaut pour `confirmation` / `reminder_d1` / `cancellation`.
- `render.ts` — interpolateur `{{x.y}}` + blocs `{{#if x.y}}...{{/if}}` + HTML escape.
- `confirmation.ts` — fallback hardcodé pour la confirmation booking (compatibilité historique).
- `render-user.ts` — helper `renderUserTemplate(userId, kind, vars)` : DB → defaults → null.

### `server/ics.ts`
Génère un fichier `.ics` (RFC 5545) attaché à l'email de confirmation pour ajouter le RDV au calendrier du client.

### `server/google.ts`
OAuth 2.0 Google + push/update/delete d'events sur Google Calendar du praticien si connecté.

### `server/invoices.ts`
Génération de factures PDF (via `pdfkit`) et stockage des metadata.

### `server/seed.ts`
Crée les comptes Marie/Julien + données de démo (clients, RDV, catégories) en mode SQLite uniquement, au premier démarrage.

## Modules frontend

### `client/src/App.tsx`
Router Wouter + `useHashLocation`. Toutes les pages enregistrées ici. Layout principal via `AppLayout.tsx` (sidebar nav + zone contenu).

### Pages principales
- `Login.tsx` / `Register.tsx` / `ForgotPassword.tsx` / `ResetPassword.tsx` / `VerifyEmail.tsx` — flow d'auth
- `Onboarding.tsx` — premier setup post-register
- `Dashboard.tsx` — page d'accueil après login
- `Agenda.tsx` — vue calendrier principale
- `Clients.tsx` / `ClientDetail.tsx` / `ConsultationNote.tsx` — gestion clients
- `Categories.tsx` — prestations
- `Availability.tsx` — horaires + congés
- `Reminders.tsx` — page de gestion des rappels
- `EmailTemplates.tsx` — éditeur de templates email
- `Settings.tsx` — paramètres compte
- `Invoices.tsx` / `InvoiceEditor.tsx` — facturation
- `PublicPage.tsx` / `PublicPageEditor.tsx` — page publique du praticien
- `BookingFlow.tsx` — flow de réservation côté client (sans login)
- `BookingManage.tsx` — page publique d'annulation/report
- `Landing.tsx` — landing avant login

### `client/src/lib/queryClient.ts`
Configuration TanStack Query + helper `apiRequest(method, url, body?)` qui :
- Gère le préfixe `/api`
- Inclut les cookies (credentials: include)
- Parse JSON automatiquement
- Throw une erreur typée sur 4xx/5xx

## Flow d'une réservation publique

```
Client visite /p/julien-rayes
  ↓
GET /api/public/julien-rayes/categories     → liste prestations
GET /api/public/julien-rayes/availability   → créneaux libres
  ↓
Client choisit créneau + remplit infos
  ↓
POST /api/public/julien-rayes/book          → crée appointment
  ↓
sendBookingConfirmationEmail(appointment)
  ├─ renderUserTemplate(userId, 'confirmation', vars) → DB ou défauts
  ├─ buildIcsForAppointment(appointment)              → .ics attachment
  └─ sendEmail(cfg, clientEmail, subject, html, text, [icsAttachment])
  ↓
Si Google Calendar connecté : pushEventToCalendar(...)
  ↓
Client reçoit email avec .ics + lien /manage/:token
```

## Flow d'une annulation client

```
Client clique sur lien /#/manage/:token dans l'email
  ↓
GET /api/public/manage/:token       → récupère détails RDV
  ↓
Client clique "Annuler"
POST /api/public/manage/:token/cancel
  ↓
storage.updateAppointment(id, { status: 'cancelled', clientCancelledAt: now })
  ↓
sendCancellationNotification(praticien)
  ├─ renderUserTemplate(userId, 'cancellation', vars) → DB ou défauts
  └─ sendEmail(cfg, practitioner.email, subject, html, text)
```

## Schéma DB (principales tables)

- `users` — comptes praticien (email, password hash, name, slug public)
- `clients` — clients du praticien (firstName, lastName, email, phone, notes)
- `categories` — prestations (name, durationMinutes, priceCents, location, color)
- `appointments` — RDV (clientId, categoryId, userId, startAt, endAt, status, confirmToken, cancelToken, ...)
- `availability` — horaires hebdomadaires par praticien (dayOfWeek, startTime, endTime)
- `breaks` — congés ponctuels (startAt, endAt)
- `email_templates` — templates personnalisés (userId, kind, subject, bodyHtml)
- `invoices` — factures émises
- `sessions` — sessions Express (table technique)

Voir `shared/schema.ts` et `shared/schema-mysql.ts` pour la définition exacte.

## Points d'attention

1. **`server/routes.ts` géant** — à splitter en sous-fichiers (~6-8 fichiers).
2. **3 schémas DB à synchroniser** — alternative : générer le schéma MySQL depuis le SQLite via un script, ou utiliser uniquement MySQL en dev aussi.
3. **Pas de tests automatisés** — à ajouter (Vitest pour unit, Playwright pour E2E sur les flows critiques : booking, login, annulation).
4. **Sessions stockées en DB** — OK pour scale modeste, à surveiller à 100+ users actifs concurrents.
5. **Aucun rate limiting** — à ajouter sur `/api/login`, `/api/public/*/book` pour prévenir abuse.
