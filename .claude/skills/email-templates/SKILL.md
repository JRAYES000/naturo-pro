---
name: email-templates
description: >
  Fonctionnement des templates e-mail de Naturo Pro (confirmation, rappel J-1, annulation,
  relance) : kinds, helper renderUserTemplate, variables disponibles. À charger quand la
  tâche touche server/email-templates/, la page /app/email-templates ou l'envoi d'e-mails
  aux clients et praticiens.
---

# Templates email

Les templates email sont **éditables en DB par l'utilisateur** depuis `/app/email-templates`.
La liste des kinds fait foi dans le type `EmailKind` (`server/email-templates/defaults.ts`) ;
aujourd'hui quatre :
- `confirmation` : envoyé au client après booking
- `reminder_d1` : rappel automatique J-1
- `cancellation` : notification au praticien quand un client annule via `/manage/:token`
- `relance` : envoyé au client `RELANCE_DAYS` jours après son dernier RDV s'il n'en a pas de
  nouveau planifié (`server/routes/helpers/reminders.ts`). Opt-in : la séquence ne s'active
  que si la praticienne a enregistré ce template depuis `/app/email-templates`. Variable
  propre : `bookingLink` (lien de prise de RDV de la page publique).

Le helper `renderUserTemplate(userId, kind, vars)` (dans `server/email-templates/render-user.ts`) :
1. Cherche un template personnalisé en DB
2. Sinon utilise `getDefaultTemplate(kind)` de `defaults.ts`
3. Interpole les variables `{{x.y}}` et les blocs conditionnels `{{#if x.y}}...{{/if}}`
4. Retourne `null` en cas d'erreur DB pour permettre le fallback hardcodé

**Variables disponibles** : la liste fait foi dans l'interface `TemplateVars`
(`server/email-templates/render.ts`) : `client.name`, `client.email`, `appointment.date`,
`appointment.time`, `appointment.duration`, `appointment.category`, `appointment.address`,
`appointment.meetLink`, `practitioner.name`, `practitioner.email`, `cancelLink`,
`bookingLink`. Une variable absente du contexte reste telle quelle (`{{x.y}}`) dans l'e-mail.

Ajouter un kind : le type `EmailKind`, `DEFAULT_TEMPLATES` (`defaults.ts`) et `VALID_KINDS`
(`server/routes/email-templates.ts`).

**Après modification** : `npm test`, puis rendre les quatre kinds par défaut et vérifier
qu'aucun `{{…}}` ne reste dans le HTML produit.
