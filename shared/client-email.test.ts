/**
 * shared/client-email.test.ts
 *
 * Une fiche client créée avec un email mal formé (POST /api/clients, schéma auto-généré
 * sans validation .email()) devenait ensuite impossible à sauvegarder par la moindre
 * modification (PATCH /api/clients/:id, schéma strict qui refuse ce même email) — la
 * fiche restait bloquée entre les deux, sans message compréhensible pour la praticienne.
 *
 * insertClientSchema (création) et patchClientSchema (modification, server/routes/clients.ts)
 * partagent désormais la même règle email (clientEmailSchema, shared/schema.ts) : ces tests
 * verrouillent qu'elles ne peuvent plus diverger, dans les deux dialectes (SQLite/MySQL).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as sqlite from "./schema";
import * as mysql from "./schema-mysql";

for (const [dialect, { clientEmailSchema, insertClientSchema }] of [
  ["SQLite", sqlite],
  ["MySQL", mysql],
] as const) {
  test(`${dialect} — clientEmailSchema refuse un email mal formé`, () => {
    assert.equal(clientEmailSchema.safeParse("pas-un-email").success, false);
  });

  test(`${dialect} — clientEmailSchema accepte un email valide, vide, null ou absent`, () => {
    assert.equal(clientEmailSchema.safeParse("marie@exemple.fr").success, true);
    assert.equal(clientEmailSchema.safeParse("").success, true);
    assert.equal(clientEmailSchema.safeParse(null).success, true);
    assert.equal(clientEmailSchema.safeParse(undefined).success, true);
  });

  test(`${dialect} — insertClientSchema refuse désormais le même email mal formé (bug reproduit)`, () => {
    const parsed = insertClientSchema.safeParse({
      firstName: "Test", lastName: "QA", email: "pas-un-email",
    });
    assert.equal(parsed.success, false);
  });
}
