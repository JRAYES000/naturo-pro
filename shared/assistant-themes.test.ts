// shared/assistant-themes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSISTANT_THEMES, THEME_OTHER } from "./assistant-themes";

test("ASSISTANT_THEMES — liste non vide, libellés uniques, contient 'Autre…'", () => {
  assert.ok(ASSISTANT_THEMES.length >= 10);
  assert.equal(new Set(ASSISTANT_THEMES).size, ASSISTANT_THEMES.length);
  assert.ok(ASSISTANT_THEMES.includes(THEME_OTHER));
  assert.equal(ASSISTANT_THEMES[ASSISTANT_THEMES.length - 1], THEME_OTHER);
});
