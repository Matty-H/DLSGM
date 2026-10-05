import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import { tm } from './i18n';

/**
 * Extraction de .zip (yauzl), partagée par l'import d'archives et les patchs
 * (game-tools.ts). Chaque entrée devient un fichier ordinaire sous la
 * destination : chemin validé (pas de `..`, de chemin absolu ni de nom
 * réservé), jamais de lien symbolique — une entrée « lien » est écrite comme
 * un fichier contenant sa cible, elle ne peut donc pas rediriger une
 * écriture hors de la destination (faille d'extract-zip ≤ 2.0.1, remplacé).
 */

const FORBIDDEN_CHARS = /[<>:"|?*\u0000-\u001f]/;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

const utf8 = new TextDecoder('utf-8', { fatal: true });
const shiftJis = new TextDecoder('shift_jis', { fatal: true });

/**
 * Nom d'une entrée de zip : UTF-8 si l'archive le déclare (bit 11), ou si
 * les octets sont de l'UTF-8 valide ; sinon Shift-JIS (outils japonais) ;
 * sinon latin1 plutôt qu'un échec.
 */
export function decodeZipName(raw: Buffer, utf8Flag: boolean): string {
  if (utf8Flag || raw.every(b => b < 0x80)) return raw.toString('utf8');
  for (const decoder of [utf8, shiftJis]) {
    try {
      return decoder.decode(raw);
    } catch {
      // encodage suivant
    }
  }
  return raw.toString('latin1');
}

/** Chemin d'une entrée d'archive → segments sûrs (rien hors de la destination), ou null. */
export function safeEntrySegments(name: string): string[] | null {
  const segments = name.replace(/\\/g, '/').split('/').filter(s => s !== '' && s !== '.');
  if (segments.length === 0 || /^[A-Za-z]:/.test(name) || name.startsWith('/') || name.startsWith('\\')) return null;
  for (const segment of segments) {
    if (segment === '..' || FORBIDDEN_CHARS.test(segment) || WINDOWS_RESERVED_NAME.test(segment)) return null;
  }
  return segments;
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, decodeStrings: false, autoClose: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error(tm('Archive illisible.')));
      else resolve(zip);
    });
  });
}

/** Zip chiffré : yauzl ne sait pas le lire (l'import passe alors par 7-Zip). */
export class EncryptedZipError extends Error {}

/**
 * Extrait `archive` dans `destination`. Un fichier déjà présent fait
 * échouer, sauf avec `overwrite` (deux archives superposées dans un même
 * dossier temporaire, ex. BepInEx puis XUnity).
 */
export async function extractZip(archive: string, destination: string, { overwrite = false }: { overwrite?: boolean } = {}): Promise<void> {
  const zip = await openZip(archive);
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      zip.close();
      reject(error);
    };
    zip.on('error', fail);
    zip.on('end', resolve);
    zip.on('entry', (entry: yauzl.Entry) => {
      (async () => {
        const rawName = entry.fileName as unknown as Buffer;
        const name = decodeZipName(rawName, (entry.generalPurposeBitFlag & 0x800) !== 0);
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new EncryptedZipError();
        const segments = safeEntrySegments(name);
        if (!segments) throw new Error(tm("Chemin refusé dans l'archive : {path}", { path: name }));
        const target = path.join(destination, ...segments);
        if (/\/$/.test(name) || /\\$/.test(name)) {
          await fs.promises.mkdir(target, { recursive: true });
        } else {
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          const stream = await new Promise<NodeJS.ReadableStream>((res, rej) =>
            zip.openReadStream(entry, (error, s) => (error || !s ? rej(error ?? new Error(tm('Entrée illisible.'))) : res(s)))
          );
          await pipeline(stream, fs.createWriteStream(target, { flags: overwrite ? 'w' : 'wx' }));
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}
