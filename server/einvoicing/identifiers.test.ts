import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidSiren, isValidSiret, sirenFrom, siretFrom, frenchVatNumber,
  isValidVatNumber, normalizeVatNumber, formatSiren, countryCode,
} from "./identifiers";

test("SIREN et SIRET — clé de Luhn", () => {
  assert.equal(isValidSiren("552 032 534"), true);
  assert.equal(isValidSiren("552032535"), false);
  assert.equal(isValidSiren("55203253"), false);
  assert.equal(isValidSiret("552 032 534 00703"), true);
  assert.equal(isValidSiret("55203253400704"), false);
  // La Poste : somme des chiffres multiple de 5, hors Luhn
  assert.equal(isValidSiret("35600000000001"), true);
});

test("sirenFrom / siretFrom — déduits de la saisie", () => {
  assert.equal(sirenFrom("55203253400703"), "552032534");
  assert.equal(sirenFrom("552 032 534"), "552032534");
  assert.equal(sirenFrom("1234"), null);
  assert.equal(siretFrom("552032534"), null);
  assert.equal(siretFrom("552 032 534 00703"), "55203253400703");
});

test("numéro de TVA français — clé calculée et contrôlée", () => {
  assert.equal(frenchVatNumber("552032534"), "FR27552032534");
  assert.equal(isValidVatNumber("fr 27 552 032 534"), true);
  assert.equal(isValidVatNumber("FR28552032534"), false);
  assert.equal(isValidVatNumber("BE0123456789"), true);
  assert.equal(isValidVatNumber(""), false);
  assert.equal(normalizeVatNumber(" fr27.552.032.534 "), "FR27552032534");
});

test("formatSiren et countryCode", () => {
  assert.equal(formatSiren("552032534"), "552 032 534");
  assert.equal(formatSiren("55203253400703"), "552 032 534 00703");
  assert.equal(countryCode("France"), "FR");
  assert.equal(countryCode(""), "FR");
  assert.equal(countryCode("Belgique"), "BE");
  assert.equal(countryCode("ch"), "CH");
});
