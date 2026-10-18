/**
 * server/totp.ts — double authentification (lot 2c) : TOTP RFC 6238 (HMAC-SHA1,
 * 6 chiffres, pas de 30 s), compatible Google Authenticator, Microsoft
 * Authenticator, 1Password… et codes de secours à usage unique. Sans dépendance.
 *
 * Le secret est stocké chiffré (token-crypto, AES-256-GCM) ; les codes de secours
 * ne sont conservés que hachés (SHA-256). Le jeton de « défi » relie l'étape mot de
 * passe à l'étape code sans créer de session entre les deux.
 */
import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_S = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("Clé base32 invalide");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret de 160 bits (recommandation de la RFC 4226), en base32. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totpCounter(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_S);
}

/**
 * Vérifie un code à 6 chiffres à ±1 pas (dérive d'horloge du téléphone). Renvoie le
 * compteur accepté, à mémoriser : un code déjà utilisé (compteur ≤ lastCounter) est
 * refusé, ce qui empêche de rejouer un code intercepté.
 */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now(), lastCounter: number | null = null, window = 1): number | null {
  const clean = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secretB32);
  const c0 = totpCounter(nowMs);
  for (let d = -window; d <= window; d++) {
    const c = c0 + d;
    if (lastCounter != null && c <= lastCounter) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, c)), Buffer.from(clean))) return c;
  }
  return null;
}

export function otpauthUri(opts: { secret: string; account: string; issuer?: string }): string {
  const issuer = opts.issuer ?? "Naturo Pro";
  const label = encodeURIComponent(`${issuer}:${opts.account}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_S}`;
}

/** Clé lisible pour la saisie manuelle : groupes de 4 caractères. */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

// ── Codes de secours ─────────────────────────────────────────────────────────
// Alphabet sans caractères ambigus (i, l, o, 0, 1) : 31 symboles, 8 caractères
// par code ≈ 40 bits d'entropie, hors de portée d'une attaque en ligne limitée.
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function normalizeBackupCode(code: string): string {
  return String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

export function generateBackupCodes(n = 10): string[] {
  const codes: string[] = [];
  while (codes.length < n) {
    let s = "";
    const rnd = crypto.randomBytes(8);
    for (let i = 0; i < rnd.length; i++) s += BACKUP_ALPHABET[rnd[i] % BACKUP_ALPHABET.length];
    const code = `${s.slice(0, 4)}-${s.slice(4)}`;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** Consomme un code de secours : renvoie la liste restante, ou null si le code est inconnu. */
export function consumeBackupCode(storedHashes: string[], code: string): string[] | null {
  if (normalizeBackupCode(code).length !== 8) return null;
  const h = hashBackupCode(code);
  const i = storedHashes.findIndex((x) => x.length === h.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  if (i < 0) return null;
  return storedHashes.filter((_, j) => j !== i);
}

// ── Défi entre l'étape mot de passe et l'étape code ──────────────────────────
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const DEV_KEY_MATERIAL = "naturo-pro-dev-secret";

function challengeKey(): Buffer {
  const material = process.env.SESSION_SECRET
    || (process.env.NODE_ENV === "production" ? "" : DEV_KEY_MATERIAL);
  if (!material) throw new Error("SESSION_SECRET absent : double authentification impossible.");
  return Buffer.from(crypto.hkdfSync("sha256", material, "naturo-pro", "2fa-challenge", 32));
}

export function signChallenge(userId: number, now = Date.now()): string {
  const payload = `${userId}.${now + CHALLENGE_TTL_MS}.${crypto.randomBytes(8).toString("hex")}`;
  const mac = crypto.createHmac("sha256", challengeKey()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}

/** userId du défi s'il est authentique et non expiré, sinon null. */
export function verifyChallenge(token: string, now = Date.now()): number | null {
  const [p, mac] = String(token || "").split(".");
  if (!p || !mac) return null;
  let payload: string;
  try {
    payload = Buffer.from(p, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", challengeKey()).update(payload).digest("base64url");
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const [uid, exp] = payload.split(".");
  if (!Number(uid) || !(Number(exp) > now)) return null;
  return Number(uid);
}
