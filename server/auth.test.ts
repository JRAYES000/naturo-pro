/**
 * server/auth.test.ts
 *
 * Garde-fou contre la régression qui rendait la suppression de compte RGPD
 * impossible : `DELETE /api/auth/me` comparait `hashPassword(saisie)` au hash
 * stocké. bcrypt tirant un sel aléatoire à chaque appel, l'égalité était TOUJOURS
 * fausse → 403 systématique, même avec le bon mot de passe.
 *
 * Si le premier test casse, c'est que quelqu'un a réintroduit la comparaison par
 * égalité de hash quelque part.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./auth";

const PWD = "un-mot-de-passe-correct";

test("hashPassword n'est PAS déterministe — comparer deux hashs est toujours faux", () => {
  assert.notEqual(hashPassword(PWD), hashPassword(PWD));
});

test("verifyPassword accepte le bon mot de passe", () => {
  assert.equal(verifyPassword(PWD, hashPassword(PWD)), true);
});

test("verifyPassword refuse un mauvais mot de passe", () => {
  assert.equal(verifyPassword("mauvais", hashPassword(PWD)), false);
});

test("verifyPassword refuse un hash vide sans lever (compte sans mot de passe, ex. Google)", () => {
  assert.equal(verifyPassword(PWD, ""), false);
});
