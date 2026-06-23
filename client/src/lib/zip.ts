/**
 * client/src/lib/zip.ts — Archive ZIP minimale, SANS dépendance.
 *
 * Mode « store » (aucune compression) : les PNG sont déjà compressés, inutile de
 * déflater. Suffisant pour empaqueter les slides d'un carrousel + la légende.
 * Implémente l'en-tête local, le répertoire central, l'EOCD et le CRC32.
 * `zipBytes` est pur (Uint8Array/DataView/TextEncoder) → testable hors navigateur.
 */

export interface ZipEntry { name: string; data: Uint8Array; }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Date/heure DOS fixes (1er janvier 2021, 00:00) — déterministe, pas d'appel à Date.
const DOS_DATE = ((2021 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

/** Construit les octets d'une archive ZIP « store ». Fonction PURE. */
export function zipBytes(files: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const items = files.map((f) => {
    const nameBytes = enc.encode(f.name);
    return { nameBytes, data: f.data, crc: crc32(f.data) };
  });

  let localSize = 0, centralSize = 0;
  for (const it of items) {
    localSize += 30 + it.nameBytes.length + it.data.length;
    centralSize += 46 + it.nameBytes.length;
  }
  const out = new Uint8Array(localSize + centralSize + 22);
  const dv = new DataView(out.buffer);
  let off = 0;
  const offsets: number[] = [];

  for (const it of items) {
    offsets.push(off);
    dv.setUint32(off, 0x04034b50, true); off += 4;  // signature en-tête local
    dv.setUint16(off, 20, true); off += 2;          // version requise
    dv.setUint16(off, 0x0800, true); off += 2;      // bit UTF-8
    dv.setUint16(off, 0, true); off += 2;           // méthode = store
    dv.setUint16(off, DOS_TIME, true); off += 2;
    dv.setUint16(off, DOS_DATE, true); off += 2;
    dv.setUint32(off, it.crc, true); off += 4;
    dv.setUint32(off, it.data.length, true); off += 4; // taille compressée
    dv.setUint32(off, it.data.length, true); off += 4; // taille réelle
    dv.setUint16(off, it.nameBytes.length, true); off += 2;
    dv.setUint16(off, 0, true); off += 2;           // longueur extra
    out.set(it.nameBytes, off); off += it.nameBytes.length;
    out.set(it.data, off); off += it.data.length;
  }

  const cdStart = off;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dv.setUint32(off, 0x02014b50, true); off += 4;  // signature répertoire central
    dv.setUint16(off, 20, true); off += 2;          // version d'origine
    dv.setUint16(off, 20, true); off += 2;          // version requise
    dv.setUint16(off, 0x0800, true); off += 2;      // bit UTF-8
    dv.setUint16(off, 0, true); off += 2;           // méthode
    dv.setUint16(off, DOS_TIME, true); off += 2;
    dv.setUint16(off, DOS_DATE, true); off += 2;
    dv.setUint32(off, it.crc, true); off += 4;
    dv.setUint32(off, it.data.length, true); off += 4;
    dv.setUint32(off, it.data.length, true); off += 4;
    dv.setUint16(off, it.nameBytes.length, true); off += 2;
    dv.setUint16(off, 0, true); off += 2;           // extra
    dv.setUint16(off, 0, true); off += 2;           // commentaire
    dv.setUint16(off, 0, true); off += 2;           // disque de départ
    dv.setUint16(off, 0, true); off += 2;           // attributs internes
    dv.setUint32(off, 0, true); off += 4;           // attributs externes
    dv.setUint32(off, offsets[i], true); off += 4;  // offset en-tête local
    out.set(it.nameBytes, off); off += it.nameBytes.length;
  }

  const cdSize = off - cdStart;
  dv.setUint32(off, 0x06054b50, true); off += 4;    // EOCD
  dv.setUint16(off, 0, true); off += 2;             // numéro de disque
  dv.setUint16(off, 0, true); off += 2;             // disque du répertoire central
  dv.setUint16(off, items.length, true); off += 2;  // entrées sur ce disque
  dv.setUint16(off, items.length, true); off += 2;  // total entrées
  dv.setUint32(off, cdSize, true); off += 4;
  dv.setUint32(off, cdStart, true); off += 4;
  dv.setUint16(off, 0, true); off += 2;             // longueur commentaire

  return out;
}

/** Enveloppe `zipBytes` dans un Blob téléchargeable. */
export function createZip(files: ZipEntry[]): Blob {
  return new Blob([zipBytes(files)], { type: "application/zip" });
}

/** Déclenche le téléchargement d'un Blob sous un nom de fichier donné. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
