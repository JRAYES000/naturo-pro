/**
 * Test d'intégration (SQLite) — numéro attribué à l'ÉMISSION, plus à la création.
 *
 * Un brouillon porte un numéro provisoire (BROUILLON-…) ; le numéro légal FACT- ne
 * lui est attribué qu'à l'émission. Gardé ici :
 *  1. supprimer un brouillon ne laisse aucun trou dans la séquence ;
 *  2. les numéros suivent l'ordre d'émission, pas l'ordre de création ;
 *  3. ré-émettre un document déjà émis ne consomme pas de numéro (idempotence) ;
 *  4. un brouillon hérité, numéroté avant cette règle, garde son numéro.
 *
 * Crée et supprime son propre praticien : n'altère pas les données existantes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";
import { provisionalNumber, isProvisionalNumber } from "./document";
import { getYearFromMs } from "../invoices";

let userId: number;

before(async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `emission-test-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Emission Test", slug: `emission-test-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
});

after(async () => {
  if (userId) await storage.deleteUserCascade(userId);
});

async function brouillon(number = provisionalNumber()) {
  const now = Date.now();
  return storage.createInvoice({
    userId, status: "draft", docType: "invoice", number, issueDate: now, dueDate: null,
    appointmentId: null, clientId: null, clientFirstName: "A", clientLastName: "B",
    clientEmail: "", clientAddress: null, clientPostalCode: null, clientCity: null,
    subtotalCents: 100, vatCents: 0, totalCents: 100, vatRate: 0, vatEnabled: false,
    paymentMethod: null, paidAt: null, sentAt: null, notes: null,
    practitionerSnapshot: "{}", createdAt: now, updatedAt: now,
  } as any);
}

const prefixe = () => `FACT-${getYearFromMs(Date.now())}-`;

test("numéro provisoire : préfixe, unicité, ≤ 32 caractères", () => {
  const a = provisionalNumber(), b = provisionalNumber();
  assert.ok(isProvisionalNumber(a));
  assert.notEqual(a, b);
  assert.ok(a.length <= 32, a);
});

test("le numéro légal est attribué à l'émission, dans l'ordre d'émission, sans trou", async () => {
  const b1 = await brouillon();
  const b2 = await brouillon();
  const b3 = await brouillon();
  assert.ok(isProvisionalNumber(b1.number));

  // b2 est émis en premier : il prend le premier numéro de la séquence.
  const e2 = await storage.issueInvoice(b2.id, userId, Date.now(), { status: "issued" } as any);
  assert.equal(e2!.number, `${prefixe()}0001`);
  assert.equal(e2!.status, "issued");
  assert.ok(e2!.issuedAt);

  // b1 est supprimé sans avoir été émis : aucun numéro consommé.
  await storage.deleteInvoice(b1.id);

  const e3 = await storage.issueInvoice(b3.id, userId, Date.now(), { status: "sent" } as any);
  assert.equal(e3!.number, `${prefixe()}0002`);

  // Ré-émission : idempotente, le numéro ne change pas.
  const again = await storage.issueInvoice(b3.id, userId, Date.now(), { status: "paid" } as any);
  assert.equal(again!.number, `${prefixe()}0002`);
  assert.equal(again!.status, "sent");
});

test("émissions concurrentes : numéros distincts et consécutifs", async () => {
  const drafts = await Promise.all(Array.from({ length: 6 }, () => brouillon()));
  const issued = await Promise.all(drafts.map((d) => storage.issueInvoice(d.id, userId, Date.now(), { status: "issued" } as any)));
  const nums = issued.map((i) => Number(i!.number.slice(prefixe().length))).sort((x, y) => x - y);
  assert.equal(new Set(nums).size, 6);
  assert.equal(nums[5] - nums[0], 5);
});

test("brouillon hérité déjà numéroté : il garde son numéro à l'émission", async () => {
  const legacy = await brouillon(`${prefixe()}9000`);
  const e = await storage.issueInvoice(legacy.id, userId, Date.now(), { status: "issued" } as any);
  assert.equal(e!.number, `${prefixe()}9000`);
  assert.equal(e!.status, "issued");
});
