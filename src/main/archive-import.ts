import { utilityProcess } from 'electron';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';

/**
 * Import d'un jeu depuis son archive : extraction dans
 * `<dossier de jeux>/.dlsgm-import/<id>/` (même volume : le déplacement
 * final est un simple renommage), puis le dossier apparaît sous son ID
 * DLsite une fois l'extraction complète — jamais un dossier de jeu à moitié
 * extrait. Un jeu déjà présent n'est jamais écrasé.
 *
 * - .zip : extracteur maison (yauzl), qui décode les noms de fichiers en
 *   Shift-JIS quand l'archive ne les déclare pas en UTF-8 (cas courant des
 *   zips japonais) : 7-Zip/WASM les rendrait illisibles, et un jeu dont les
 *   fichiers sont mal nommés ne trouve plus ses ressources.
 * - le reste (.rar, .part1.exe auto-extractible + .partN.rar, .7z...) :
 *   7-Zip compilé en WASM, dans un processus séparé (archive-7z-worker.ts).
 *
 * Dossier distinct de `.dlsgm-incoming` (réception LAN), que l'ouverture de
 * la réception vide entièrement.
 */

const STAGING_DIR = '.dlsgm-import';
const GAME_ID_IN_TEXT = /(?:^|[^A-Za-z0-9])([A-Za-z]{2}\d{6,9})(?![0-9])/;
const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;
// Dossiers "enveloppes" (un seul dossier dans un dossier) retirés au plus.
const MAX_UNWRAP_DEPTH = 3;
const FORBIDDEN_CHARS = /[<>:"|?*\u0000-\u001f]/;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'exe'];

/** Partie d'une archive RAR multi-volumes (`x.part2.rar`, `x.part1.exe`...). */
const RAR_PART = /^(.*)\.part0*(\d+)\.(rar|exe)$/i;

/**
 * Archive à ouvrir : pour une archive en plusieurs parties, la première
 * (l'utilisateur peut avoir choisi n'importe laquelle).
 */
export function firstVolume(archivePath: string): string {
  const match = RAR_PART.exec(path.basename(archivePath));
  if (!match || match[2] === '1') return archivePath;
  const dir = path.dirname(archivePath);
  const first = fs.readdirSync(dir).find(name => {
    const m = RAR_PART.exec(name);
    return m !== null && m[1] === match[1] && Number(m[2]) === 1;
  });
  if (!first) throw new Error(`Première partie introuvable pour ${path.basename(archivePath)} (${match[1]}.part1.exe ou .part1.rar).`);
  return path.join(dir, first);
}

export function gameIdFromName(name: string): string | null {
  const match = GAME_ID_IN_TEXT.exec(name);
  return match ? match[1].toUpperCase() : null;
}

// --- .zip -----------------------------------------------------------------

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
function safeEntrySegments(name: string): string[] | null {
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
      if (error || !zip) reject(error ?? new Error('Archive illisible.'));
      else resolve(zip);
    });
  });
}

async function extractZip(archive: string, destination: string): Promise<void> {
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
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new Error('Archive protégée par mot de passe : extrais-la à la main.');
        const segments = safeEntrySegments(name);
        if (!segments) throw new Error(`Chemin refusé dans l'archive : ${name}`);
        const target = path.join(destination, ...segments);
        if (/\/$/.test(name) || /\\$/.test(name)) {
          await fs.promises.mkdir(target, { recursive: true });
        } else {
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          const stream = await new Promise<NodeJS.ReadableStream>((res, rej) =>
            zip.openReadStream(entry, (error, s) => (error || !s ? rej(error ?? new Error('Entrée illisible.')) : res(s)))
          );
          await pipeline(stream, fs.createWriteStream(target, { flags: 'wx' }));
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}

// --- 7-Zip (WASM) -----------------------------------------------------------

function extractWith7z(archive: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'archive-7z-worker.js'), [], { serviceName: 'DLSGM extraction' });
    let answered = false;
    child.on('message', ({ code, errors }: { code: number; errors: string[] }) => {
      answered = true;
      child.kill();
      const text = errors.join(' ');
      if (/wrong password|encrypted/i.test(text)) reject(new Error('Archive protégée par mot de passe : extrais-la à la main.'));
      else if (code >= 2) reject(new Error(`Extraction impossible (7-Zip, code ${code})${text ? ` : ${text}` : ''}`));
      else resolve();
    });
    child.on('exit', code => {
      if (!answered) reject(new Error(`Le processus d'extraction s'est arrêté (code ${code}).`));
    });
    child.postMessage({ archive, destination });
  });
}

// --- Import -----------------------------------------------------------------

/** Liens symboliques ou fichiers spéciaux : refusés (pourraient pointer hors du dossier du jeu). */
async function assertRegularTree(dir: string): Promise<void> {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await assertRegularTree(full);
    else if (!entry.isFile()) throw new Error(`Élément non pris en charge dans l'archive : ${entry.name}`);
  }
}

/**
 * Descend dans les dossiers enveloppes (un unique dossier, sans rien
 * d'autre) : `RJ01234567/`, ou le titre du jeu, contenant le vrai contenu.
 * Renvoie aussi l'ID trouvé dans le nom d'un de ces dossiers.
 */
async function unwrap(dir: string): Promise<{ root: string; idFromFolder: string | null }> {
  let root = dir;
  let idFromFolder: string | null = null;
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth++) {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isDirectory()) break;
    idFromFolder = idFromFolder ?? gameIdFromName(entries[0].name);
    root = path.join(root, entries[0].name);
  }
  return { root, idFromFolder };
}

/** Restes d'un import interrompu (arrêt brutal). À n'appeler que sans import en cours. */
export async function removeStaleImports(destinationFolder: string): Promise<void> {
  await fs.promises.rm(path.join(destinationFolder, STAGING_DIR), { recursive: true, force: true });
}

export interface ImportedGame {
  gameId: string;
}

/**
 * Extrait `archivePath` et le range dans `<destinationFolder>/<ID>/`. L'ID
 * vient du nom de l'archive, sinon d'un dossier enveloppe de son contenu.
 */
export async function importArchive(archivePath: string, destinationFolder: string): Promise<ImportedGame> {
  if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new Error('Dossier de jeux non configuré ou introuvable.');
  const archive = firstVolume(archivePath);
  const idFromArchive = gameIdFromName(path.basename(archive));
  if (idFromArchive && fs.existsSync(path.join(destinationFolder, idFromArchive))) {
    throw new Error(`${idFromArchive} est déjà dans la bibliothèque : rien n'a été extrait.`);
  }

  const stagingRoot = path.join(destinationFolder, STAGING_DIR);
  const staging = path.join(stagingRoot, `${Date.now()}`);
  await fs.promises.mkdir(staging, { recursive: true });
  try {
    if (archive.toLowerCase().endsWith('.zip')) await extractZip(archive, staging);
    else await extractWith7z(archive, staging);

    await assertRegularTree(staging);
    const { root, idFromFolder } = await unwrap(staging);
    if ((await fs.promises.readdir(root)).length === 0) throw new Error("L'archive est vide.");

    const gameId = idFromArchive ?? idFromFolder;
    if (!gameId || !GAME_ID_REGEX.test(gameId)) {
      throw new Error("ID DLsite introuvable (ni dans le nom de l'archive, ni dans son dossier) : renomme l'archive avec l'ID, ex: RJ01234567.zip.");
    }
    const target = path.join(destinationFolder, gameId);
    if (fs.existsSync(target)) throw new Error(`${gameId} est déjà dans la bibliothèque : rien n'a été importé.`);
    await fs.promises.rename(root, target);
    return { gameId };
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    // Dossier temporaire racine retiré s'il est vide (pas de reste visible dans la bibliothèque).
    await fs.promises.rmdir(stagingRoot).catch(() => undefined);
  }
}
