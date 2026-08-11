/**
 * server/routes/helpers/booking-notification.test.ts — Lot 3
 *
 * La praticienne n'était prévenue d'une réservation en ligne qu'en cas
 * d'annulation ou de report. Ce test verrouille le rendu de la notification
 * « nouvelle réservation » : sujet exploitable, lien vers le bon chemin
 * (/#/app/agenda — /#/agenda est une page 404), échappement HTML.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNewBookingNotification } from "./email-sending";

test("renderNewBookingNotification — sujet, contenu et lien agenda corrects", () => {
  const r = renderNewBookingNotification({
    clientName: "Marie Durand",
    rdvDateText: "vendredi 14 août 2026 à 14h30",
    categoryName: "Bilan naturopathique",
    clientEmail: "marie@ex.fr",
    clientPhone: "06 12 34 56 78",
    depositCents: 2000,
    appUrl: "https://app.ecole-naturo.fr",
  });
  assert.equal(r.subject, "Nouvelle réservation — Marie Durand, vendredi 14 août 2026 à 14h30");
  assert.ok(r.html.includes("Bilan naturopathique"));
  assert.ok(r.html.includes("20,00 €"));
  assert.ok(r.html.includes("https://app.ecole-naturo.fr/#/app/agenda"));
  assert.ok(!r.html.includes('/#/agenda"'), "le lien /#/agenda (sans /app) est une page 404");
  assert.ok(r.text.includes("marie@ex.fr"));
});

test("renderNewBookingNotification — nom vide et HTML échappé", () => {
  const r = renderNewBookingNotification({
    clientName: "  ",
    rdvDateText: "demain",
    clientEmail: "<script>x</script>",
  });
  assert.ok(r.subject.includes("(cliente inconnue)"));
  assert.ok(!r.html.includes("<script>"));
});
