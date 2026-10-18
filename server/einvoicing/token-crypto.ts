// ─────────────────────────────────────────────────────────────────────────────
// Chiffrement des jetons OAuth de la plateforme agréée (AES-256-GCM).
//
// Clé dérivée de SESSION_SECRET (HKDF) : pas de nouvelle variable à gérer. Si le
// secret change, les jetons deviennent illisibles et la praticienne reconnecte
// simplement son compte. En production sans SESSION_SECRET, le chiffrement est
// refusé (comme la signature du state OAuth Google, cf. server/google.ts).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";

const DEV_KEY_MATERIAL = "naturo-pro-dev-secret";

function key(): Buffer {
  const material = process.env.SESSION_SECRET
    || (process.env.NODE_ENV === "production" ? "" : DEV_KEY_MATERIAL);
  if (!material) throw new Error("SESSION_SECRET absent : chiffrement des jetons impossible.");
  return Buffer.from(crypto.hkdfSync("sha256", material, "naturo-pro", "einvoicing-tokens", 32));
}

/** Chiffre une chaîne : « v1.<iv>.<tag>.<données> » en base64url. */
export function sealToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Déchiffre ; null si la valeur est absente, altérée ou chiffrée avec une autre clé. */
export function openToken(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
