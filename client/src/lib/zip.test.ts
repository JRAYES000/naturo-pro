/**
 * Tests unitaires — client/src/lib/zip.ts (archive ZIP sans dépendance).
 * Vérifie les signatures ZIP et l'intégrité de base sur les octets (node:test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zipBytes } from "./zip";

const enc = new TextEncoder();

test("zipBytes — commence par la signature d'en-tête local PK\\x03\\x04", () => {
  const bytes = zipBytes([{ name: "a.txt", data: enc.encode("hello") }]);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);
});

test("zipBytes — contient l'EOCD avec le bon nombre d'entrées", () => {
  const files = [
    { name: "slide-1.png", data: enc.encode("PNG1") },
    { name: "slide-2.png", data: enc.encode("PNG2") },
    { name: "legende.txt", data: enc.encode("Légende accentuée") },
  ];
  const bytes = zipBytes(files);
  // EOCD = 22 derniers octets ; signature PK\x05\x06.
  const eocd = bytes.length - 22;
  assert.equal(bytes[eocd], 0x50);
  assert.equal(bytes[eocd + 1], 0x4b);
  assert.equal(bytes[eocd + 2], 0x05);
  assert.equal(bytes[eocd + 3], 0x06);
  const dv = new DataView(bytes.buffer);
  assert.equal(dv.getUint16(eocd + 8, true), 3); // entrées sur ce disque
  assert.equal(dv.getUint16(eocd + 10, true), 3); // total entrées
});

test("zipBytes — inclut chaque nom de fichier dans l'archive", () => {
  const bytes = zipBytes([{ name: "slide-1.png", data: enc.encode("x") }]);
  const dec = new TextDecoder();
  const asText = dec.decode(bytes);
  assert.ok(asText.includes("slide-1.png"));
});
