/**
 * server/routes/helpers/programme-bridge.test.ts — pont Naturobot → Programme (Lot 1, action 10)
 *
 * La découpe markdown → sections décide de ce que le praticien retrouve dans
 * son Programme (et donc dans le PDF remis au client). Fonction pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { programmeFromMarkdown } from "./programme-bridge";

test("programmeFromMarkdown — titres, puces, gras et texte libre découpés en sections exploitables", () => {
  // Réponse typique de Naturobot : titres ## + puces.
  const md = [
    "Voici un programme adapté :",
    "",
    "## Alimentation",
    "- Augmenter les légumes verts à chaque repas",
    "- **Réduire** le café après 14h",
    "",
    "## Gestion du stress",
    "1. Cohérence cardiaque matin et soir",
    "2. Marche quotidienne de 30 minutes",
    "",
    "**Sommeil**",
    "Coucher avant 23h, écrans coupés une heure avant.",
  ].join("\n");
  const sections = programmeFromMarkdown(md);
  assert.deepEqual(sections.map((s) => s.section), ["Programme", "Alimentation", "Gestion du stress", "Sommeil"]);
  // Le préambule sans titre est conservé dans une section « Programme ».
  assert.deepEqual(sections[0].items, ["Voici un programme adapté :"]);
  // Les puces deviennent des items, le gras inline est nettoyé.
  assert.deepEqual(sections[1].items, ["Augmenter les légumes verts à chaque repas", "Réduire le café après 14h"]);
  assert.equal(sections[2].items.length, 2);
  // Une ligne **en gras seule** ouvre une section ; le paragraphe suivant devient son item.
  assert.deepEqual(sections[3].items, ["Coucher avant 23h, écrans coupés une heure avant."]);

  // Sans aucun titre : tout part dans une section unique « Programme ».
  const plat = programmeFromMarkdown("- conseil un\n- conseil deux");
  assert.deepEqual(plat, [{ section: "Programme", items: ["conseil un", "conseil deux"] }]);

  // Contenu vide ou titres sans contenu : aucune section (la route répond 400).
  assert.deepEqual(programmeFromMarkdown(""), []);
  assert.deepEqual(programmeFromMarkdown("## Titre seul\n\n## Autre titre"), []);
});
