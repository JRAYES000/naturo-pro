/**
 * Lot 3c — parrainage : nom abrégé, statut des filleules, code personnel unique
 * et stable, recherche insensible à la casse.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { shortName, referralStatus } from "./referral";
import { storage } from "../storage";

test("nom abrégé de la marraine et statut des filleules", () => {
  assert.equal(shortName("Marie Dupont"), "Marie D.");
  assert.equal(shortName("Anne-Laure de la Tour"), "Anne-Laure T.");
  assert.equal(shortName("Camille"), "Camille");
  assert.equal(shortName("  "), "Une praticienne");
  assert.equal(referralStatus({ plan: "active", trialEndsAt: null }), "abonnée");
  assert.equal(referralStatus({ plan: "trial", trialEndsAt: Date.now() + 86400000 }), "en essai");
  assert.equal(referralStatus({ plan: "trial", trialEndsAt: Date.now() - 1 }), "compte gratuit");
  assert.equal(referralStatus({ plan: "free", trialEndsAt: null }), "compte gratuit");
});

const ids: number[] = [];
after(async () => { for (const id of ids) await storage.deleteUserCascade(id); });

test("code personnel : 8 caractères sans ambiguïté, stable ; filleules rattachées", async () => {
  const now = Date.now();
  const mk = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const u = await storage.createUser({
      email: `parrain-${suffix}-${now}@example.invalid`, passwordHash: "x", googleId: null, name: `Test ${suffix}`, slug: `parrain-${suffix}-${now}`,
      bio: "", photoUrl: null, phone: null, specialties: "[]", address: null, city: null, createdAt: now, plan: "trial", ...extra,
    } as any);
    ids.push(u.id);
    return u;
  };
  const marraine = await mk("a");
  const code = await storage.ensureReferralCode(marraine.id);
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(await storage.ensureReferralCode(marraine.id), code, "stable");
  assert.equal((await storage.getUserByReferralCode(code.toLowerCase()))?.id, marraine.id, "insensible à la casse");
  assert.equal(await storage.getUserByReferralCode("ZZZZZZZZ"), undefined);
  const filleule = await mk("b", { referredByUserId: marraine.id });
  const autre = await mk("c");
  assert.notEqual(await storage.ensureReferralCode(autre.id), code, "codes distincts");
  assert.deepEqual((await storage.listReferredUsers(marraine.id)).map((u) => u.id), [filleule.id]);
});
