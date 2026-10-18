/**
 * Double authentification : vecteurs officiels de la RFC 6238 (annexe B), base32,
 * fenêtre de ±30 s, anti-rejeu, codes de secours à usage unique, défi signé et
 * vérification du second facteur sur un compte (stockage SQLite).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  base32Encode, base32Decode, hotp, verifyTotp, totpCounter, otpauthUri, generateBackupCodes,
  hashBackupCode, consumeBackupCode, signChallenge, verifyChallenge, CHALLENGE_TTL_MS, generateTotpSecret,
} from "./totp";
import { sealToken } from "./einvoicing/token-crypto";
import { checkSecondFactor, tooManyFailures, recordFailure, clearFailures } from "./routes/two-factor";
import { storage } from "./storage";

const RFC_KEY = Buffer.from("12345678901234567890", "ascii");

test("RFC 6238 annexe B (SHA-1, 8 chiffres)", () => {
  const vecteurs: Array<[number, string]> = [
    [59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"],
    [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"],
  ];
  for (const [t, attendu] of vecteurs) assert.equal(hotp(RFC_KEY, totpCounter(t * 1000), 8), attendu, `T=${t}`);
});

test("base32 : encodage de la clé RFC et aller-retour", () => {
  assert.equal(base32Encode(RFC_KEY), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode("gezd gnbv-gy3tqojq gezdgnbvgy3tqojq"), RFC_KEY);
  const s = generateTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.equal(base32Encode(base32Decode(s)), s);
});

test("vérification : ±1 pas toléré, pas au-delà, et anti-rejeu", () => {
  const secret = base32Encode(RFC_KEY);
  const t = 1_800_000_000_000;
  const code = hotp(RFC_KEY, totpCounter(t));
  assert.equal(verifyTotp(secret, code, t), totpCounter(t));
  assert.equal(verifyTotp(secret, code, t + 30_000), totpCounter(t), "pas suivant : toléré");
  assert.equal(verifyTotp(secret, code, t + 90_000), null, "trois pas plus tard : refusé");
  assert.equal(verifyTotp(secret, code, t, totpCounter(t)), null, "déjà utilisé : refusé");
  assert.equal(verifyTotp(secret, "12345", t), null);
  assert.equal(verifyTotp(secret, "abcdef", t), null);
  assert.equal(verifyTotp(secret, code.slice(0, 3) + " " + code.slice(3), t), totpCounter(t), "espace toléré");
});

test("URI otpauth et codes de secours", () => {
  assert.equal(
    otpauthUri({ secret: "ABC", account: "marie@demo.fr" }),
    "otpauth://totp/Naturo%20Pro%3Amarie%40demo.fr?secret=ABC&issuer=Naturo%20Pro&algorithm=SHA1&digits=6&period=30",
  );
  const codes = generateBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  const hashes = codes.map(hashBackupCode);
  const reste = consumeBackupCode(hashes, codes[3].toUpperCase().replace("-", " "));
  assert.equal(reste?.length, 9);
  assert.equal(consumeBackupCode(reste!, codes[3]), null, "usage unique");
  assert.equal(consumeBackupCode(hashes, "zzzz-zzzz"), null);
});

test("défi signé : valide 10 min, altération et expiration refusées", () => {
  const t = Date.now();
  const d = signChallenge(42, t);
  assert.equal(verifyChallenge(d, t + 1000), 42);
  assert.equal(verifyChallenge(d, t + CHALLENGE_TTL_MS + 1), null);
  const [p, mac] = d.split(".");
  const autre = Buffer.from(Buffer.from(p, "base64url").toString().replace(/^42\./, "43.")).toString("base64url");
  assert.equal(verifyChallenge(`${autre}.${mac}`, t), null);
  assert.equal(verifyChallenge("n'importe.quoi", t), null);
});

test("limite d'essais par compte", () => {
  const t = Date.now();
  for (let i = 0; i < 5; i++) recordFailure(7, t);
  assert.equal(tooManyFailures(7, t), true);
  assert.equal(tooManyFailures(7, t + 16 * 60 * 1000), false, "fenêtre de 15 min écoulée");
  clearFailures(7);
  assert.equal(tooManyFailures(7, t), false);
});

let userId = 0;
after(async () => { if (userId) await storage.deleteUserCascade(userId); });

test("second facteur d'un compte : code d'application puis rejeu, code de secours consommé", async () => {
  const now = Date.now();
  const secret = generateTotpSecret();
  const codes = generateBackupCodes();
  const u = await storage.createUser({
    email: `2fa-${now}@example.invalid`, passwordHash: "x", googleId: null, name: "Deux Facteurs", slug: `2fa-${now}`,
    bio: "", photoUrl: null, phone: null, specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
  await storage.updateUser(u.id, {
    totpSecret: sealToken(secret, "totp-secrets"), totpEnabledAt: now, totpLastCounter: null,
    totpBackupCodes: JSON.stringify(codes.map(hashBackupCode)),
  } as any);
  const code = hotp(base32Decode(secret), totpCounter(now));
  assert.deepEqual(await checkSecondFactor(await storage.getUserById(u.id), code, now), { ok: true });
  assert.equal((await checkSecondFactor(await storage.getUserById(u.id), code, now)).ok, false, "rejeu refusé");
  assert.deepEqual(await checkSecondFactor(await storage.getUserById(u.id), codes[0], now), { ok: true, usedBackup: true });
  assert.equal((await checkSecondFactor(await storage.getUserById(u.id), codes[0], now)).ok, false, "code de secours usé");
  assert.equal(JSON.parse((await storage.getUserById(u.id) as any).totpBackupCodes).length, 9);
});
