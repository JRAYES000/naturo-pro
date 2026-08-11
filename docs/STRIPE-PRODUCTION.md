# Bascule de l'abonnement Stripe en production

> Lot 1, action 8 — le passage en production se réduit au remplacement de
> **trois variables d'environnement**, dans l'ordre ci-dessous. Aucun
> changement de code. Document destiné à Julien : les clés de production ne
> font pas partie de la mission du collaborateur (décision 2 du 04/08/2026).

## Ce que couvrent ces clés — et ce qu'elles ne couvrent pas

- **Couvert** : l'abonnement du praticien à Naturo Pro (19 €/mois, palier
  unique). Routes : `POST /api/billing/create-checkout-session`,
  `POST /api/billing/webhook`.
- **Non couvert** : les acomptes encaissés par chaque praticien à la
  réservation. Chaque praticien garde SA clé Stripe personnelle en base
  (`users.stripe_secret_key`, page Réglages) — rien à changer de ce côté.

## Les trois variables, dans l'ordre

| Ordre | Variable | Où obtenir la valeur de production |
|---|---|---|
| 1 | `STRIPE_SUBSCRIPTION_SECRET_KEY` | Dashboard Stripe (mode **Live**) → Developers → API keys → *Secret key* (`sk_live_…`) |
| 2 | `STRIPE_PRICE_ID_19` | Dashboard Stripe (mode Live) → Product catalog → créer/ouvrir le produit « Abonnement Naturo Pro » → prix récurrent **19,00 € / mois** → copier l'identifiant (`price_…`) |
| 3 | `STRIPE_WEBHOOK_SECRET` | Dashboard Stripe (mode Live) → Developers → Webhooks → *Add endpoint* → URL `https://app.ecole-naturo.fr/api/billing/webhook`, événements `checkout.session.completed` et `customer.subscription.deleted` → copier le *Signing secret* (`whsec_…`) |

L'ordre compte : le Price (2) doit exister avant de tester un checkout, et le
webhook (3) doit pointer vers l'URL de production avant la première vraie
souscription, sinon le compte payé ne serait pas débloqué automatiquement.

## Procédure

1. Ouvrir `.env` sur le serveur de production (Hostinger) et remplacer les
   valeurs de test des trois variables par les valeurs Live ci-dessus.
2. Redémarrer l'application (le process Passenger relit l'environnement).
3. Vérifier, dans cet ordre :
   - `POST /api/billing/create-checkout-session` avec un compte gratuit ne
     répond plus `501` mais `{ url: "https://checkout.stripe.com/…" }` ;
   - une souscription test réelle (carte réelle, puis remboursement) passe le
     compte en `plan = active` — les 6 routes payantes passent de 402 à 200 ;
   - une résiliation depuis le Dashboard Stripe repasse le compte en
     `plan = free` (402 sur les routes payantes, socle gratuit conservé).
4. Les événements `subscription_started` / `subscription_canceled`
   apparaissent dans Admin → Conversion (`/#/admin/analytics`).

## En cas de retour arrière

Remettre les trois valeurs `sk_test_…` / `price_…` (test) / `whsec_…` (test) :
le mode test et le mode production ne partagent ni clients ni abonnements.
