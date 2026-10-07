import { describe, expect, it } from 'vitest';
import { encodeIcns, encodeIco, ICNS_TYPES, pngDimensions } from '../../src/main/icon-files';
import { MAC_ICON_SIZES, WINDOWS_ICON_SIZES } from '../../src/shared/logo';
import { pngHeader } from '../helpers';

/** Entrées du répertoire d'un .ico : taille, profondeur et PNG pointé. */
function icoEntries(ico: Buffer) {
  return Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const entry = 6 + 16 * index;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    return { width: ico[entry] || 256, height: ico[entry + 1] || 256, bits: ico.readUInt16LE(entry + 6), png: ico.subarray(offset, offset + length) };
  });
}

/** Blocs d'un .icns : type et contenu. */
function icnsChunks(icns: Buffer) {
  const chunks: { type: string; data: Buffer }[] = [];
  for (let offset = 8; offset < icns.length;) {
    const length = icns.readUInt32BE(offset + 4);
    chunks.push({ type: icns.toString('ascii', offset, offset + 4), data: icns.subarray(offset + 8, offset + length) });
    offset += length;
  }
  return chunks;
}

describe('pngDimensions', () => {
  it('lit la taille dans l’en-tête IHDR, refuse ce qui n’est pas un PNG', () => {
    expect(pngDimensions(pngHeader(48, 32))).toEqual({ width: 48, height: 32 });
    expect(pngDimensions(Buffer.from('GIF89a........................'))).toBeNull();
    expect(pngDimensions(pngHeader(16).subarray(0, 20))).toBeNull();
  });
});

describe('.ico', () => {
  it('contient chaque taille une fois, de la plus petite à la plus grande, 256 noté 0', () => {
    const pngs = [...WINDOWS_ICON_SIZES].reverse().map(size => Buffer.concat([pngHeader(size), Buffer.from(`données ${size}`)]));
    const ico = encodeIco(pngs);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const entries = icoEntries(ico);
    expect(entries.map(entry => entry.width)).toEqual(WINDOWS_ICON_SIZES);
    expect(entries.every(entry => entry.width === entry.height && entry.bits === 32)).toBe(true);
    expect(ico[6 + 16 * (entries.length - 1)]).toBe(0);
    // Chaque entrée pointe exactement sur son PNG.
    for (const entry of entries) {
      expect(pngDimensions(entry.png)?.width).toBe(entry.width);
      expect(entry.png.toString().endsWith(`données ${entry.width}`)).toBe(true);
    }
  });

  it('refuse une image non carrée, trop grande, en double ou absente', () => {
    expect(() => encodeIco([pngHeader(32, 16)])).toThrow();
    expect(() => encodeIco([pngHeader(512)])).toThrow();
    expect(() => encodeIco([pngHeader(32), pngHeader(32)])).toThrow();
    expect(() => encodeIco([])).toThrow();
    expect(() => encodeIco([Buffer.from('pas un png')])).toThrow();
  });
});

describe('.icns', () => {
  it('range chaque taille sous ses types (dont les versions Retina), longueur totale exacte', () => {
    const icns = encodeIcns(MAC_ICON_SIZES.map(size => pngHeader(size)));
    expect(icns.toString('ascii', 0, 4)).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    const chunks = icnsChunks(icns);
    expect(chunks.map(chunk => chunk.type).sort()).toEqual(MAC_ICON_SIZES.flatMap(size => ICNS_TYPES[size]).sort());
    for (const chunk of chunks) {
      const size = Number(Object.entries(ICNS_TYPES).find(([, types]) => types.includes(chunk.type))![0]);
      expect(pngDimensions(chunk.data)?.width).toBe(size);
    }
  });

  it('refuse une taille sans type .icns ou en double', () => {
    expect(() => encodeIcns([pngHeader(48)])).toThrow();
    expect(() => encodeIcns([pngHeader(16), pngHeader(16)])).toThrow();
  });
});
