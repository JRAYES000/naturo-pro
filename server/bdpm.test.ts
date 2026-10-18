/**
 * Base publique des médicaments : lecture du fichier ANSM (Windows-1252, 12
 * colonnes), recherche sans accents, remplacement mensuel (spécialités retirées
 * supprimées).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { parseBdpm, normalizeSearch } from "./bdpm";
import { storage } from "./storage";
import { db } from "./db";
import { medications } from "@shared/schema-active";

const LIGNE = (cis: string, nom: string, etat = "Commercialisée") =>
  [cis, nom, "comprimé", "orale", "Autorisation active", "Procédure nationale", etat, "12/03/1998", "", "", " LABO TEST", "Non"].join("\t");

test("fichier ANSM : Windows-1252, colonnes, lignes invalides ignorées", () => {
  const brut = Buffer.from([LIGNE("60000001", "PARACÉTAMOL TEST 500 mg, comprimé"), "ligne cassée", LIGNE("60000002", "IBUPROFÈNE TEST", "Non commercialisée"), ""].join("\r\n"), "latin1");
  const rows = parseBdpm(new TextDecoder("windows-1252").decode(brut));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    cis: "60000001", name: "PARACÉTAMOL TEST 500 mg, comprimé", search: "paracetamol test 500 mg, comprime",
    form: "comprimé", routes: "orale", holder: "LABO TEST", commercialized: true,
  });
  assert.equal(rows[1].commercialized, false);
  assert.equal(normalizeSearch("  Ibuprofène   ÉCHANTILLON "), "ibuprofene echantillon");
});

const CODES = ["99000001", "99000002", "99000003"];
after(async () => { await db.delete(medications).where(inArray(medications.cis, CODES)); });

test("recherche sans accents, préfixe d'abord ; remplacement mensuel", async () => {
  // Date des lignes existantes conservée : le test n'efface pas la copie locale de la BDPM.
  const t0 = (await storage.lastMedicationsUpdate()) ?? Date.now();
  const rows = parseBdpm([
    LIGNE(CODES[0], "ZZTESTMED PLUS 10 mg"), LIGNE(CODES[1], "ANTI ZZTESTMED 5 mg"), LIGNE(CODES[2], "ZZTESTMED RETIRÉ", "Non commercialisée"),
  ].join("\n"));
  await storage.replaceMedications(rows, t0);
  const found = await storage.searchMedications(["zztestmed"]);
  assert.deepEqual(found.map((m) => m.cis), [CODES[0], CODES[2], CODES[1]], "préfixe d'abord, puis commercialisées");
  assert.deepEqual((await storage.searchMedications(["zztestmed", "retire"])).map((m) => m.cis), [CODES[2]], "tous les mots, sans accents");
  assert.deepEqual(await storage.searchMedications(["%"]), [], "jokers SQL neutralisés");

  // Nouvelle version du fichier sans la spécialité retirée : elle disparaît.
  const later = t0 + 1;
  const autres = (await db.select().from(medications)).filter((m: any) => !CODES.includes(m.cis));
  await storage.replaceMedications([...autres.map(({ updatedAt, ...m }: any) => m), rows[0], rows[1]], later);
  assert.deepEqual((await storage.searchMedications(["zztestmed"])).map((m) => m.cis).sort(), [CODES[0], CODES[1]]);
  assert.equal(await storage.lastMedicationsUpdate(), later);
});
