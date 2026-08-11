/**
 * server/routes/helpers/csv-clients.test.ts — import CSV de clients (Lot 3)
 *
 * Verrouille le parseur : séparateurs ; , et tabulation, en-têtes français
 * accentués, guillemets, lignes invalides en erreur, emails invalides en
 * avertissement (le contact est importé sans email, pas perdu), plafond de
 * lignes. C'est la porte d'entrée de données externes → cas tordus d'abord.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClientsCsv, splitCsvLine, CSV_MAX_ROWS } from "./csv-clients";

test("parseClientsCsv — export Excel FR (séparateur ; et accents)", () => {
  const r = parseClientsCsv("Prénom;Nom;E-mail;Téléphone\nMarie;Durand;marie@ex.fr;06 12 34 56 78\nLuc;Roy;;\n");
  assert.equal(r.erreurGlobale, undefined);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { ligne: 2, firstName: "Marie", lastName: "Durand", email: "marie@ex.fr", phone: "06 12 34 56 78" });
  assert.deepEqual(r.rows[1], { ligne: 3, firstName: "Luc", lastName: "Roy", email: null, phone: null });
});

test("parseClientsCsv — séparateur virgule et guillemets (virgule dans un champ)", () => {
  const r = parseClientsCsv('firstname,lastname,email\n"Anne-Marie","De la Tour, épouse Roy",am@ex.fr\n');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].lastName, "De la Tour, épouse Roy");
});

test("parseClientsCsv — guillemet échappé \"\" dans un champ", () => {
  assert.deepEqual(splitCsvLine('a;"dit ""oui""";c', ";"), ["a", 'dit "oui"', "c"]);
});

test("parseClientsCsv — sans colonnes Prénom/Nom → erreur globale", () => {
  const r = parseClientsCsv("email;telephone\na@b.fr;06\n");
  assert.ok(r.erreurGlobale?.includes("Prénom"));
});

test("parseClientsCsv — nom manquant → erreur de ligne, email invalide → avertissement sans perdre le contact", () => {
  const r = parseClientsCsv("prenom;nom;email\nMarie;;x\nLuc;Roy;pas-un-email\n");
  assert.deepEqual(r.erreurs, [{ ligne: 2, motif: "prénom ou nom manquant" }]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].email, null);
  assert.equal(r.avertissements.length, 1);
});

test("parseClientsCsv — plafond de lignes", () => {
  const lignes = ["prenom;nom"];
  for (let i = 0; i <= CSV_MAX_ROWS; i++) lignes.push(`P${i};N${i}`);
  const r = parseClientsCsv(lignes.join("\n"));
  assert.ok(r.erreurGlobale?.includes("maximum"));
});
