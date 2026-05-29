# Roadmap — Naturo Pro

État au passage à Claude Code. Les chantiers sont classés par impact business attendu, pas par ordre chronologique.

---

## Court terme — Cleanup post-export (Phase 4.0)

Petites tâches à faire idéalement dans les premières sessions Claude Code pour rendre le projet plus maintenable.

| Tâche | Effort | Priorité |
|---|---|---|
| **Splitter `server/routes.ts`** (3000+ lignes) en `server/routes/{auth,booking,clients,categories,availability,reminders,email-templates,public,invoices}.ts` + un `index.ts` qui les enregistre | ~3-4h | Haute |
| **Unifier les schémas DB** : générer `schema-mysql.ts` depuis `schema.ts` via un script, ou décider d'utiliser MySQL aussi en dev | ~2h | Moyenne |
| **Ajouter tests Vitest** sur `storage.ts` (au moins les fonctions critiques : booking, ensureCancelToken, getEmailTemplate) | ~3h | Moyenne |
| **Ajouter tests Playwright E2E** sur 3 flows : login, booking public, annulation /manage | ~4h | Moyenne |
| **Rate limiting** sur `/api/login` + `/api/public/*/book` (via `express-rate-limit`) | ~1h | Haute (sécurité) |
| **Helmet + CORS strict** + CSP headers | ~1h | Moyenne |

- Type-check : 6 erreurs `tsc` préexistantes dans `server/routes.ts` (regex es5, types `email_log.userId`, query params Express). À fixer pendant le split du fichier.
- Bootstrap DDL obsolète dans `server/storage.ts` (`CREATE TABLE IF NOT EXISTS`) : ne reflète plus `shared/schema.ts` (manque `resend_api_key`, `billing_*`, multi-tenant Phase 3...). À décider : (a) supprimer le DDL bootstrap et faire de `npm run db:push` une étape obligatoire de setup dev, ou (b) régénérer le DDL depuis le schéma. Piège actuel : un nouveau dev sans `db:push` obtient des tables incomplètes silencieusement.
- Build bundle CJS → ESM : éliminerait le hack `import.meta.url || __filename` et les 3 warnings esbuild. Demande de revoir `build.ts`, l'extension `.cjs` → `.mjs`, et le script `start` côté Hostinger.

---

## Moyen terme — Features business (Phase 4-5)

Classés par **impact CA**.

### 🥇 A. Paiements Stripe (Phase 4)
**Pourquoi** : transforme l'app en générateur de revenus direct. Le praticien peut demander un acompte au moment de la réservation, ce qui réduit drastiquement les no-shows.

**Scope** :
- Intégration Stripe Connect (chaque praticien connecte son compte Stripe)
- Configuration par catégorie : acompte fixe / pourcentage / paiement total
- Page de checkout intégrée au flow de booking public
- Webhook Stripe → marque le RDV `paid`
- Remboursement automatique si annulation hors délai (configurable)
- Tableau de bord praticien : encaissé du mois, à venir, remboursé

**Effort estimé** : 2-3 sessions denses.

### 🥈 B. Rappels SMS (Phase 5)
**Pourquoi** : les emails sont lus à ~40%, les SMS à ~95%. Réduit massivement les no-shows.

**Scope** :
- Intégration Twilio ou Brevo SMS
- Option par praticien : SMS J-1 / SMS H-2 / les deux
- Toggle par RDV (override par défaut)
- Coût : ~5-7 cts/SMS — décider si inclus ou facturé séparément (probablement inclus dans un plan payant)

**Effort estimé** : 1-2 sessions.

### 🥉 C. Landing page publique (Phase 4-bis)
**Pourquoi** : aujourd'hui `app.ecole-naturo.fr` redirige direct vers le login. Aucun moyen d'acquérir des praticiens via du SEO/SEA.

**Scope** :
- Landing sur `ecole-naturo.fr` ou nouveau domaine `naturopro.fr` avec :
  - Hero + pitch ("L'agenda pensé pour les naturopathes")
  - Features visuelles (captures réelles de l'app)
  - Pricing (gratuit jusqu'à X RDV / 19€/mois illimité)
  - Témoignages
  - CTA "Essayer gratuitement"
- Onboarding fluide pour les nouveaux praticiens (déjà partiellement présent avec `Onboarding.tsx`)

**Effort estimé** : 1 session pour le markup + 1 pour la copy + visuels.

### D. Multi-praticiens (cabinet partagé)
**Pourquoi** : déblocage B2B (cabinets de 3-5 praticiens). Marché plus rentable que les solos.

**Scope** :
- Notion de "cabinet" parent d'utilisateurs
- Agendas séparés par praticien mais visibles globalement par l'admin du cabinet
- Page publique `/cabinet/:slug` qui laisse choisir le praticien
- Facturation cabinet centralisée

**Effort estimé** : 2-3 sessions (gros impact sur le schéma DB).

### E. Stats & exports (Phase 5)
**Pourquoi** : feature "produit pro" qui justifie l'abonnement payant.

**Scope** :
- Tableau de bord : CA prévu / encaissé, taux de remplissage, no-show rate, top prestations
- Export CSV des RDV / clients / factures pour la compta
- Email récap hebdomadaire au praticien

**Effort estimé** : 1-2 sessions.

---

## Long terme — Conformité & maintenance

### F. Conformité RGPD
- Export des données client à la demande (déjà partiellement fait via "Demande de données")
- Suppression complète d'un client avec anonymisation des RDV passés
- CGU + politique de confidentialité (générer un texte fait par un juriste)
- Chiffrement au repos des notes de séance (sensibles médicales)
- Logs d'accès (qui a vu quoi quand)

### G. Migration Supabase (volontairement repoussée)
À reconsidérer uniquement quand :
- 50+ praticiens actifs
- Besoin réel de RLS Postgres (multi-tenancy strict)
- Besoin de temps-réel (chat, notifications push)
- Besoin de Supabase Auth (OAuth Google/Apple sans coder)

Aujourd'hui : **MySQL Hostinger suffit largement**.

### H. Réécriture Next.js
Volontairement écartée. Le stack actuel (Vite + Wouter + Express) est :
- Simple à comprendre
- Bundle unique facile à déployer
- Pas de cold start
- Hash routing résilient

Une migration Next.js apporterait : SEO côté landing (mais on peut faire un site séparé), Server Components (gain perf modeste pour une app derrière login), App Router. **Coût largement supérieur au gain pour ce projet.**

---

## Petits chantiers UX

- Notes de séance avec template/historique structuré (déjà commencé)
- Recherche globale (clients, RDV) — Cmd+K palette
- Vue mobile native du calendrier (l'actuel est responsive mais perfectible)
- Email de relance "RDV passé → laissez un avis Google"
- Templates de séance pré-remplis
- Import/export ICS pour synchroniser avec Outlook/Apple Calendar
- Tags clients (allergies, traitement en cours...) avec coloration
- Recherche disponibilités multi-praticien

---

## Reco priorisée (mon avis si je devais choisir)

Si l'objectif est de **monétiser cette année** :

1. **C** (Landing) — sans porte d'entrée publique, personne ne s'inscrit
2. **A** (Stripe) — sans paiement, pas de CA
3. **B** (SMS) — feature différenciante qui justifie le prix premium
4. **E** (Stats) — argument de vente pour les pros
5. **D** (Multi-praticiens) — quand tu auras 50+ praticiens solo, attaquer le B2B
