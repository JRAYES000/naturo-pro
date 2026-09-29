/**
 * server/email-fallback.test.ts
 *
 * Une praticienne qui met sa propre clé Resend avec une adresse Gmail voyait tous
 * ses emails refusés (« The gmail.com domain is not verified ») : confirmations,
 * rappels et récap ne partaient plus. `unverifiedDomainFallback` décide du renvoi
 * par la config système, sous son nom et avec son adresse en réponse.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { unverifiedDomainFallback, type EmailConfig } from "./email";

const SYSTEM: EmailConfig = { apiKey: "re_system", fromAddress: "noreply@ecole-naturo.fr", fromName: "Naturo Pro" };
const PRATICIENNE: EmailConfig = {
  apiKey: "re_praticienne",
  fromAddress: "celine@gmail.com",
  fromName: "Céline",
  replyTo: null,
};
const REFUS = "The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains";

test("domaine non vérifié → config système, nom et adresse de la praticienne conservés", () => {
  assert.deepEqual(unverifiedDomainFallback(PRATICIENNE, REFUS, SYSTEM), {
    apiKey: "re_system",
    fromAddress: "noreply@ecole-naturo.fr",
    fromName: "Céline",
    replyTo: "celine@gmail.com",
  });
});

test("un reply-to explicite de la praticienne est gardé", () => {
  const cfg = { ...PRATICIENNE, replyTo: "cabinet@exemple.fr" };
  assert.equal(unverifiedDomainFallback(cfg, REFUS, SYSTEM)?.replyTo, "cabinet@exemple.fr");
});

test("autre erreur Resend → pas de repli", () => {
  assert.equal(unverifiedDomainFallback(PRATICIENNE, "API key is invalid", SYSTEM), null);
});

test("pas de clé système → pas de repli", () => {
  assert.equal(unverifiedDomainFallback(PRATICIENNE, REFUS, null), null);
});

test("la config système elle-même refusée → pas de boucle", () => {
  assert.equal(unverifiedDomainFallback(SYSTEM, REFUS, SYSTEM), null);
});
