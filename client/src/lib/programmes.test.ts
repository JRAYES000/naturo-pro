import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPrograms, countByStatus, cleanSections, untitledSectionsWithContent,
  stageSchedule, programEndDate, moveItem, normalizeText, PROGRAM_TEMPLATES,
  type ProgramListItem,
} from "./programmes";

const prog = (id: number, title: string, opts: Partial<ProgramListItem> = {}): ProgramListItem => ({
  id, title, clientId: null, status: "draft", createdAt: id, updatedAt: id,
  content: JSON.stringify([{ section: "Alimentation", items: [] }]), ...opts,
});
const names: Record<number, string> = { 1: "Léa Martin", 2: "Anne Bernard" };
const nameOf = (id: number | null) => (id ? names[id] ?? "" : "");

test("filterPrograms — recherche sans accents sur titre, cliente et sections", () => {
  const list = [
    prog(1, "Cure détox", { clientId: 1 }),
    prog(2, "Sommeil", { clientId: 2, content: JSON.stringify([{ section: "Phytothérapie", items: [] }]) }),
  ];
  assert.deepEqual(filterPrograms(list, { query: "DETOX" }, nameOf).map((p) => p.id), [1]);
  assert.deepEqual(filterPrograms(list, { query: "lea" }, nameOf).map((p) => p.id), [1]);
  assert.deepEqual(filterPrograms(list, { query: "phyto anne" }, nameOf).map((p) => p.id), [2]);
  assert.deepEqual(filterPrograms(list, { query: "phyto lea" }, nameOf).map((p) => p.id), []);
});

test("filterPrograms — statut, cliente et tris", () => {
  const list = [
    prog(1, "b", { status: "sent", clientId: 2, updatedAt: 10 }),
    prog(2, "A", { updatedAt: 30 }),
    prog(3, "c", { clientId: 1, updatedAt: 20 }),
  ];
  assert.deepEqual(filterPrograms(list, { status: "sent" }, nameOf).map((p) => p.id), [1]);
  assert.deepEqual(filterPrograms(list, { clientId: 1 }, nameOf).map((p) => p.id), [3]);
  assert.deepEqual(filterPrograms(list, {}, nameOf).map((p) => p.id), [2, 3, 1]);
  assert.deepEqual(filterPrograms(list, { sort: "title" }, nameOf).map((p) => p.id), [2, 1, 3]);
  // Anne < Léa, sans cliente en dernier
  assert.deepEqual(filterPrograms(list, { sort: "client" }, nameOf).map((p) => p.id), [1, 3, 2]);
  assert.deepEqual(countByStatus(list), { all: 3, draft: 2, sent: 1 });
});

test("cleanSections — conseils vides et sections sans nom retirés", () => {
  const raw = [
    { section: " Alimentation ", items: ["  Légumes ", "", "   "], durationDays: 0 },
    { section: "", items: ["perdu"] },
    { section: "Plantes", items: [""], durationDays: 400 },
  ];
  assert.deepEqual(cleanSections(raw), [
    { section: "Alimentation", items: ["Légumes"], durationDays: null },
    { section: "Plantes", items: [], durationDays: 365 },
  ]);
  assert.equal(untitledSectionsWithContent(raw), 1);
});

test("stageSchedule — étapes enchaînées, sections sans durée ignorées", () => {
  const secs = [
    { section: "Détox", items: [], durationDays: 7 },
    { section: "Toujours", items: [] },
    { section: "Revitalisation", items: [], durationDays: 21 },
  ];
  assert.deepEqual(stageSchedule(secs, "2026-10-30"), [
    { start: "2026-10-30", end: "2026-11-05" },
    null,
    { start: "2026-11-06", end: "2026-11-26" },
  ]);
  assert.equal(programEndDate(secs, "2026-10-30"), "2026-11-26");
  assert.deepEqual(stageSchedule(secs, ""), [null, null, null]);
  assert.equal(programEndDate(secs, null), null);
});

test("moveItem et normalizeText", () => {
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.equal(normalizeText("  Phytothérapie "), "phytotherapie");
});

test("PROGRAM_TEMPLATES — identifiants uniques, sections neuves à chaque appel", () => {
  const ids = PROGRAM_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const t = PROGRAM_TEMPLATES[0];
  assert.notEqual(t.sections(), t.sections());
  for (const tpl of PROGRAM_TEMPLATES) assert.ok(tpl.sections().length > 0);
});
