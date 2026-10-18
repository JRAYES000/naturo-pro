/**
 * Encodeur QR : matrices identiques, module par module, à la bibliothèque de
 * référence qrcodegen 1.8.0 (Project Nayuki, masque choisi automatiquement).
 * Empreintes SHA-256 des lignes « 0/1 » jointes par « \n », calculées en Python.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encodeQr, qrToSvg, type QrEcc } from "./qrcode";

const REFERENCES: Array<[string, QrEcc, number, number, string]> = [
  ["https://app.ecole-naturo.fr/p/marie-dupont", "M", 3, 2, "8f86a55b0e6848512342d1bbbb99d06c57e566a1745bd01ebe94e21c0ca1be2e"],
  ["otpauth://totp/Naturo%20Pro:marie%40demo.fr?secret=JBSWY3DPEHPK3PXP&issuer=Naturo%20Pro", "M", 6, 3, "0a4d9ab303bf5d985f7bb3a10bbb2eee820503a6f9cf675cc555a39e9e64db01"],
  ["Bonjour Léa ✓", "Q", 2, 0, "87e946f9024c6551fe0fddcada206eae1d17a5e76307f76f8507b49b0f42fa4f"],
  ["x".repeat(300), "L", 11, 0, "d7800c87eac801b0f650884b741ba20abbe4fe844537a6fd7d779c0feb55fffb"],
];

for (const [text, ecc, version, mask, hash] of REFERENCES) {
  test(`QR — ${text.slice(0, 30)} (${ecc}) identique à la référence`, () => {
    const qr = encodeQr(text, { ecc });
    assert.equal(qr.version, version);
    assert.equal(qr.mask, mask);
    assert.equal(qr.size, version * 4 + 17);
    const rows = qr.modules.map((r) => r.map((b) => (b ? "1" : "0")).join("")).join("\n");
    assert.equal(createHash("sha256").update(rows).digest("hex"), hash);
  });
}

test("QR — SVG avec marge, texte trop long refusé", () => {
  const qr = encodeQr("https://exemple.fr");
  const svg = qrToSvg(qr);
  assert.match(svg, new RegExp(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`));
  assert.match(svg, /<path d="M\d+,\d+h1v1h-1z/);
  assert.throws(() => encodeQr("x".repeat(3000), { ecc: "H" }), /trop long/);
});
