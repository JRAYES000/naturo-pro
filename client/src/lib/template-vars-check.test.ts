import test from "node:test";
import assert from "node:assert/strict";
import { findUnknownTemplateVars } from "./template-vars-check";

test("findUnknownTemplateVars — variables connues acceptées, fautes de frappe détectées", () => {
  assert.deepEqual(findUnknownTemplateVars("Bonjour {{client.name}}"), []);
  assert.deepEqual(findUnknownTemplateVars("Bonjour {{cilent.name}}"), ["{{cilent.name}}"]);
  // Espaces tolérés autour du nom, doublons dédupliqués
  assert.deepEqual(
    findUnknownTemplateVars("{{ client.name }} et {{foo}} puis {{foo}}"),
    ["{{foo}}"],
  );
  assert.deepEqual(findUnknownTemplateVars("Aucune variable ici"), []);
});
