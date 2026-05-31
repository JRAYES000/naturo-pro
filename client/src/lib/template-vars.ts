/**
 * client/src/lib/template-vars.ts — PHASE 3.5-C
 *
 * Liste des variables interpolables disponibles dans les templates email.
 * Utilisée par la page EmailTemplates.tsx pour afficher les badges cliquables.
 *
 * REMARQUE : Ce fichier est géré exclusivement par la phase 3.5-C.
 * Les autres agents ne doivent pas le modifier.
 */

export interface TemplateVariable {
  /** Placeholder exact à insérer, ex: {{client.name}} */
  placeholder: string;
  /** Label en français affiché dans l'UI */
  label: string;
  /** Valeur d'exemple pour la prévisualisation */
  example: string;
}

/**
 * Variables disponibles dans les templates email.
 * Ordre intentionnel : données client, rendez-vous, praticien, puis lien.
 */
export const TEMPLATE_VARS: TemplateVariable[] = [
  {
    placeholder: "{{client.name}}",
    label: "Nom du client",
    example: "Marie Dupont",
  },
  {
    placeholder: "{{client.email}}",
    label: "Email du client",
    example: "marie@exemple.fr",
  },
  {
    placeholder: "{{appointment.date}}",
    label: "Date FR (ex. « samedi 9 mai 2026 »)",
    example: "samedi 9 mai 2026",
  },
  {
    placeholder: "{{appointment.time}}",
    label: "Heure (ex. « 14h00 »)",
    example: "14h00",
  },
  {
    placeholder: "{{appointment.duration}}",
    label: "Durée (ex. « 60 min »)",
    example: "60 min",
  },
  {
    placeholder: "{{appointment.category}}",
    label: "Nom de la prestation",
    example: "Consultation naturopathie",
  },
  {
    placeholder: "{{appointment.address}}",
    label: "Adresse du cabinet (ou vide)",
    example: "12 rue de la Paix, Paris",
  },
  {
    placeholder: "{{appointment.meetLink}}",
    label: "Lien visio Google Meet (si RDV en visio)",
    example: "https://meet.google.com/abc-defg-hij",
  },
  {
    placeholder: "{{practitioner.name}}",
    label: "Nom du praticien",
    example: "Dr. Julien Rayes",
  },
  {
    placeholder: "{{practitioner.email}}",
    label: "Email du praticien",
    example: "contact@cabinet-naturo.fr",
  },
  {
    placeholder: "{{cancelLink}}",
    label: "Lien d'annulation (rempli automatiquement)",
    example: "https://example.fr/annuler/TOKEN",
  },
];
