/**
 * Lot 3c — parrainage : nom abrégé, statut des filleules, code personnel unique
 * et stable, recherche insensible à la casse.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { shortName, referralStatus } from "./referral";
import { rewardReferral, REFERRAL_REWARD_CENTS } from "../referral-reward";
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

test("récompense : un mois offert à chacune, une seule fois (crédit Stripe ou accès prolongé)", async () => {
  const now = Date.now();
  const J = 86400000;
  const mk = async (suffix: string, extra: Record<string, unknown>) => {
    const u = await storage.createUser({
      email: `recomp-${suffix}-${now}@example.invalid`, passwordHash: "x", googleId: null, name: `Recomp ${suffix}`, slug: `recomp-${suffix}-${now}`,
      bio: "", photoUrl: null, phone: null, specialties: "[]", address: null, city: null, createdAt: now, ...extra,
    } as any);
    ids.push(u.id);
    return u;
  };
  const avant = process.env.STRIPE_SUBSCRIPTION_SECRET_KEY;
  process.env.STRIPE_SUBSCRIPTION_SECRET_KEY = "sk_test_parrainage";
  try {
    const credits: any[] = [];
    const credit = async (o: any) => { credits.push(o); return { id: "cbtxn_1" }; };

    // Marraine en essai : prolongée de 30 jours à partir de la fin de son essai.
    const marraine = await mk("m", { plan: "trial", trialEndsAt: now + 10 * J });
    const filleule = await mk("f", { plan: "active", stripeCustomerId: "cus_filleule", referredByUserId: marraine.id });
    const r = await rewardReferral(filleule.id, { credit, now, sendMail: false });
    assert.equal(r?.filleule.mode, "credit");
    assert.equal(r?.marraine?.mode, "trial");
    assert.equal(credits.length, 1);
    assert.equal(credits[0].customerId, "cus_filleule");
    assert.equal(credits[0].amountCents, REFERRAL_REWARD_CENTS);
    assert.equal((await storage.getUserById(marraine.id) as any).trialEndsAt, now + 40 * J);
    assert.equal(await rewardReferral(filleule.id, { credit, now, sendMail: false }), null, "webhook rejoué : rien de plus");
    assert.equal(credits.length, 1);

    // Marraine sur le socle gratuit : 30 jours d'accès complet rouverts.
    const libre = await mk("l", { plan: "free", trialEndsAt: now - 90 * J });
    const f2 = await mk("f2", { plan: "active", stripeCustomerId: "cus_f2", referredByUserId: libre.id });
    const r2 = await rewardReferral(f2.id, { credit, now, sendMail: false });
    assert.equal(r2?.marraine?.mode, "trial");
    const apres: any = await storage.getUserById(libre.id);
    assert.equal(apres.plan, "trial");
    assert.equal(apres.trialEndsAt, now + 30 * J);

    // Sans marraine : rien.
    const seule = await mk("s", { plan: "active", stripeCustomerId: "cus_s" });
    assert.equal(await rewardReferral(seule.id, { credit, now, sendMail: false }), null);
  } finally {
    if (avant === undefined) delete process.env.STRIPE_SUBSCRIPTION_SECRET_KEY;
    else process.env.STRIPE_SUBSCRIPTION_SECRET_KEY = avant;
  }
});
