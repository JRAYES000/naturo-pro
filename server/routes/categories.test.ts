/**
 * server/routes/categories.test.ts
 *
 * Garde-fou sur patchCategorySchema (PATCH /api/categories/:id).
 *
 * Le formulaire d'édition de prestation (Categories.tsx) initialisait autrefois son
 * état local par spread de l'entité entière (`{...editing}`), id et userId compris,
 * puis renvoyait cet objet tel quel au PATCH — rejeté par ce schéma strict, rendant
 * la modification de TOUTE prestation existante impossible (400 systématique). Le
 * schéma avait raison de refuser : {userId:X} dans un PATCH est une voie de
 * détournement de ressource vers un autre praticien. Le correctif est côté client
 * (n'envoyer que les champs éditables) ; ce test verrouille que le schéma continue
 * de refuser id/userId, pour que personne ne "corrige" un futur 400 en relâchant le
 * .strict() plutôt qu'en corrigeant l'appelant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { patchCategorySchema } from "./categories";

test("patchCategorySchema — accepte isActive et les champs éditables", () => {
  const parsed = patchCategorySchema.safeParse({ isActive: false, name: "Bilan" });
  assert.ok(parsed.success);
});

test("patchCategorySchema — rejette id/userId (bug reproduit : spread de l'entité complète)", () => {
  const parsed = patchCategorySchema.safeParse({
    id: 3, userId: 1, name: "Bilan iridologie", durationMinutes: 60,
    priceCents: 6500, location: "cabinet", color: "#1b4332", isActive: true,
  });
  assert.equal(parsed.success, false);
});

test("patchCategorySchema — rejette toute clé inconnue (mass-assignment)", () => {
  const parsed = patchCategorySchema.safeParse({ userId: 999 });
  assert.equal(parsed.success, false);
});
