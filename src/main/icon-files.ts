/**
 * Fichiers d'icône multi-tailles, assemblés à partir de PNG déjà rasterisés à
 * chaque taille (le logo est vectoriel : chaque taille est dessinée nette,
 * jamais réduite depuis une grande image — c'est ce qui crénelait l'icône
 * sous Windows).
 *
 * - .ico (Windows) : un PNG par taille, accepté par Windows depuis Vista.
 *   Windows y choisit la taille exacte voulue par l'écran (16 à 256 px).
 * - .icns (macOS) : un PNG par type, 16 à 1024 px (Retina compris).
 *
 * Utilisé à l'exécution (icône aux couleurs du thème, src/main/theme.ts) et
 * par scripts/generate-icon.cjs (build/icon.ico, build/icon.icns).
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Largeur et hauteur d'un PNG (en-tête IHDR), ou null si ce n'en est pas un. */
export function pngDimensions(png: Buffer): { width: number; height: number } | null {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Côté d'un PNG carré, sinon une erreur (une icône n'a que des tailles carrées). */
function squareSize(png: Buffer): number {
  const dimensions = pngDimensions(png);
  if (!dimensions || dimensions.width !== dimensions.height || dimensions.width < 1) throw new Error('PNG carré attendu');
  return dimensions.width;
}

/** .ico : tailles de 1 à 256 px, une seule fois chacune, rangées de la plus petite à la plus grande. */
export function encodeIco(pngs: Buffer[]): Buffer {
  const images = pngs.map(png => ({ png, size: squareSize(png) })).sort((a, b) => a.size - b.size);
  if (images.length === 0) throw new Error('Aucune image');
  if (images.some(image => image.size > 256)) throw new Error('Taille .ico maximale : 256 px');
  if (new Set(images.map(image => image.size)).size !== images.length) throw new Error('Taille en double');

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icône
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ png, size }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // 0 = 256
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // pas de palette
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // plans
    entry.writeUInt16LE(32, 6); // bits par pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(image => image.png)]);
}

/**
 * Types .icns contenant un PNG, par côté en pixels : chaque taille sert aussi
 * de version Retina (@2x) de la moitié (ic11 = 16 @2x, ic12 = 32 @2x...).
 */
export const ICNS_TYPES: Record<number, string[]> = {
  16: ['icp4'],
  32: ['icp5', 'ic11'],
  64: ['ic12'],
  128: ['ic07'],
  256: ['ic08', 'ic13'],
  512: ['ic09', 'ic14'],
  1024: ['ic10']
};

/** .icns : tailles de ICNS_TYPES seulement, une seule fois chacune. */
export function encodeIcns(pngs: Buffer[]): Buffer {
  const images = pngs.map(png => ({ png, size: squareSize(png) })).sort((a, b) => a.size - b.size);
  if (images.length === 0) throw new Error('Aucune image');
  if (new Set(images.map(image => image.size)).size !== images.length) throw new Error('Taille en double');
  const chunks: Buffer[] = [];
  for (const { png, size } of images) {
    const types = ICNS_TYPES[size];
    if (!types) throw new Error(`Taille .icns non prise en charge : ${size} px`);
    for (const type of types) {
      const head = Buffer.alloc(8);
      head.write(type, 0, 'ascii');
      head.writeUInt32BE(8 + png.length, 4);
      chunks.push(head, png);
    }
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}
