# Recette manuelle — parcours d'argent (action 20, Lot 2)

Checklist à dérouler dans un navigateur avant toute ouverture commerciale, sans
solliciter de praticiens (décision 9). La partie automatisée vit dans
`server/recette-parcours-argent.test.ts` (+ tests unitaires du Lot 1) et tourne
à chaque `npm test` / CI.

Pré-requis : un compte de test dont l'essai est forcé expiré en base
(`UPDATE users SET trial_ends_at = 1 WHERE id = <id>` en dev SQLite), et les 3
variables Stripe de test posées (sinon les étapes 2-3 s'arrêtent au 501 attendu).

## 1. Blocage gratuit

- [ ] Connexion avec le compte essai expiré : agenda, fiches clients
      (coordonnées seules) et page publique fonctionnent.
- [ ] Chaque écran payant (Programmes, Factures, Anamnèse, Rappels, Templates
      email, Forfaits, Naturobot, Studio, Stats, Documents, Solutions, Notes de
      consultation, Google Agenda) affiche l'état bloqué FeatureGate avec CTA —
      jamais une erreur technique.
- [ ] Une 2e prestation ne peut pas être créée (402, message explicite).
- [ ] L'export RGPD et la suppression de compte restent accessibles.

## 2. Souscription → déblocage

- [ ] Clic sur le CTA « Passer à Naturo Pro — 19 €/mois » → Checkout Stripe
      (mode test) s'ouvre.
- [ ] Paiement carte test `4242 4242 4242 4242` → retour dans l'app.
- [ ] Après le webhook `checkout.session.completed` : les 13 écrans payants
      fonctionnent (recharger la page), plan « active » visible côté admin.
- [ ] `analytics_events` contient `subscribe_click` puis `subscription_started`.

## 3. Résiliation → re-blocage

- [ ] Résiliation de l'abonnement (portail Stripe de test ou
      `customer.subscription.deleted` simulé).
- [ ] Retour à l'état bloqué du point 1 (402 sur route payante, FeatureGate),
      socle gratuit toujours fonctionnel.
- [ ] `analytics_events` contient `subscription_canceled`.

Rappel : tant que la décision « pas de monétisation » du 11/08/2026 tient, les
clés Stripe restent absentes en prod et `create-checkout-session` répond 501 —
c'est le comportement attendu, pas une anomalie.
