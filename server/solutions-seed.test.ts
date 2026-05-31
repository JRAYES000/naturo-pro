/**
 * Tests unitaires — server/solutions-seed.ts
 *
 * Couvre le contrat du seed du catalogue global de solutions naturelles :
 *  1. idempotence (ré-exécution n'ajoute aucun doublon, dédup par nom),
 *  2. résilience best-effort (si la table n'existe pas encore — cas d'une base
 *     MySQL vierge au 1er boot — le seed ne crash pas).
 *
 * Le seed accepte un `store` injectable : on lui passe un faux store en mémoire,
 * donc aucun accès DB réel. Runner : node:test (`npm test`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedNaturalSolutions, DEFAULT_SOLUTIONS, type SolutionSeedStore } from "./solutions-seed";
import type { NaturalSolution } from "@shared/schema-active";

/** Faux store en mémoire reproduisant le comportement de `storage`. */
function makeFakeStore(): SolutionSeedStore & { rows: NaturalSolution[]; createCalls: number } {
  const rows: NaturalSolution[] = [];
  let nextId = 1;
  return {
    rows,
    createCalls: 0,
    async listNaturalSolutions(_userId: number) {
      // Le seed passe -1 (user inexistant) → ne récupère que les fiches globales.
      return rows.filter((r) => r.userId === null);
    },
    async createNaturalSolution(data) {
      this.createCalls++;
      const now = 0;
      const row: NaturalSolution = {
        id: nextId++,
        userId: data.userId,
        name: data.name,
        category: data.category,
        properties: data.properties,
        contraindications: data.contraindications,
        usageNotes: data.usageNotes,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return row;
    },
  };
}

test("seedNaturalSolutions — 1er passage : insère tout le catalogue global", async () => {
  const store = makeFakeStore();
  await seedNaturalSolutions(store);

  assert.equal(store.createCalls, DEFAULT_SOLUTIONS.length);
  assert.equal(store.rows.length, DEFAULT_SOLUTIONS.length);
  assert.ok(store.rows.every((r) => r.userId === null), "toutes les fiches sont globales (userId null)");
});

test("seedNaturalSolutions — idempotent : 2e passage n'ajoute aucun doublon", async () => {
  const store = makeFakeStore();
  await seedNaturalSolutions(store);
  const afterFirst = store.createCalls;

  await seedNaturalSolutions(store);

  assert.equal(store.createCalls, afterFirst, "aucune création supplémentaire au 2e passage");
  assert.equal(store.rows.length, DEFAULT_SOLUTIONS.length);
});

test("seedNaturalSolutions — n'insère que les fiches manquantes", async () => {
  const store = makeFakeStore();
  // Pré-charge une fiche déjà présente (dédup insensible à la casse / espaces).
  await store.createNaturalSolution({
    userId: null,
    name: `  ${DEFAULT_SOLUTIONS[0].name.toUpperCase()}  `,
    category: DEFAULT_SOLUTIONS[0].category,
    properties: "",
    contraindications: "",
    usageNotes: "",
  });

  await seedNaturalSolutions(store);

  // La fiche pré-chargée ne doit pas être recréée.
  assert.equal(store.rows.length, DEFAULT_SOLUTIONS.length);
});

test("seedNaturalSolutions — best-effort : ne crash pas si la table n'existe pas (MySQL vierge)", async () => {
  const failing: SolutionSeedStore = {
    async listNaturalSolutions() {
      throw new Error("ER_NO_SUCH_TABLE: Table 'natural_solutions' doesn't exist");
    },
    async createNaturalSolution() {
      throw new Error("ne devrait pas être appelé");
    },
  };

  // Ne doit PAS rejeter (erreur capturée en best-effort).
  await assert.doesNotReject(() => seedNaturalSolutions(failing));
});
