import { utilityProcess } from 'electron';
import path from 'path';
import fs from 'fs';
import { isPasswordFailure, type SevenZipRequest, type SevenZipResult } from './archive-7z';
import { gameIdFromName, gameIdsIn, isAddressOnlyText, isSiteFileName, mergeReleaseNames, passwordsFromArchiveName, passwordsFromFolder, readText, siteNames, writeInstallInfo } from './release-names';
import { tm } from './i18n';
import { EncryptedZipError, extractZip } from './zip-extract';

export { gameIdFromName } from './release-names';
export { decodeZipName } from './zip-extract';

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
 * - le reste (.rar, .part1.exe auto-extractible + .partN.rar, .7z, zip
 *   chiffré...) : 7-Zip compilé en WASM, dans un processus séparé
 *   (archive-7z-worker.ts).
 *
 * Archive dans l'archive (le jeu en `.rar` chiffré, avec un `password.txt`
 * à côté) : l'archive interne est extraite à son tour. Mots de passe essayés,
 * dans l'ordre : celui saisi, ceux annoncés dans les fichiers texte voisins,
 * ceux devinés d'après les noms (site de diffusion), puis ceux du
 * gestionnaire. Les publicités des sites de diffusion (raccourcis `.url`,
 * `ryuugames.txt`, texte qui n'est qu'une adresse) sont retirées autour du
 * jeu (`removeJunk`). ID, version et DLC sont
 * cherchés dans tous les noms rencontrés (archives, dossiers enveloppes),
 * puis, pour l'ID, dans toute l'arborescence extraite.
 *
 * Dossier distinct de `.dlsgm-incoming` (réception LAN), que l'ouverture de
 * la réception vide entièrement.
 */

const STAGING_DIR = '.dlsgm-import';
const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;
// Dossiers "enveloppes" (un seul dossier dans un dossier) retirés au plus.
const MAX_UNWRAP_DEPTH = 3;

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
  if (!first) throw new Error(tm('Première partie introuvable pour {file} ({name}.part1.exe ou .part1.rar).', { file: path.basename(archivePath), name: match[1] }));
  return path.join(dir, first);
}

/**
 * Tous les fichiers d'une archive : ses parties (`x.part1.exe`, `x.part2.rar`...)
 * pour une archive multi-volumes, sinon le fichier seul. Sert à proposer la
 * suppression d'une archive importée sans laisser de parties orphelines.
 */
export function archiveVolumes(archivePath: string): string[] {
  const match = RAR_PART.exec(path.basename(archivePath));
  if (!match) return [archivePath];
  const dir = path.dirname(archivePath);
  return fs.readdirSync(dir)
    .filter(name => RAR_PART.exec(name)?.[1] === match[1])
    .map(name => path.join(dir, name));
}

// --- 7-Zip (WASM) -----------------------------------------------------------

/** Extraction 7-Zip/WASM dans un processus utilitaire (voir archive-7z-worker.ts). */
export function extractWith7z(request: SevenZipRequest): Promise<SevenZipResult> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'archive-7z-worker.js'), [], { serviceName: 'DLSGM extraction' });
    let answered = false;
    child.on('message', (result: SevenZipResult) => {
      answered = true;
      child.kill();
      resolve(result);
    });
    child.on('exit', code => {
      if (!answered) reject(new Error(tm("Le processus d'extraction s'est arrêté (code {code}).", { code: String(code) })));
    });
    child.postMessage(request);
  });
}

/** Aucun des mots de passe essayés n'ouvre l'archive (ou elle est illisible). */
export class ArchivePasswordError extends Error {
  /** `inner` : nom de l'archive interne en cause (l'archive choisie est déjà nommée dans le bilan). */
  constructor(inner?: string) {
    super(
      inner
        ? tm("Archive interne {name} protégée par mot de passe (aucun mot de passe connu ne l'ouvre) ou illisible : saisis son mot de passe.", { name: inner })
        : tm("Archive protégée par mot de passe (aucun mot de passe connu ne l'ouvre) ou illisible : saisis son mot de passe.")
    );
    this.name = 'ArchivePasswordError';
  }
}

async function emptyDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
  await fs.promises.mkdir(dir, { recursive: true });
}

type Extract7z = (request: SevenZipRequest) => Promise<SevenZipResult>;

/**
 * Extrait `archive` dans `destination` (vide). Zip non chiffré : yauzl.
 * Sinon 7-Zip, sans mot de passe puis avec chaque candidat, tant que
 * l'échec ressemble à un mauvais mot de passe.
 */
async function extractArchive(archive: string, destination: string, passwords: string[], extract7z: Extract7z, inner = false): Promise<void> {
  if (archive.toLowerCase().endsWith('.zip')) {
    try {
      await extractZip(archive, destination);
      return;
    } catch (error) {
      if (!(error instanceof EncryptedZipError)) throw error;
    }
  }
  for (const password of [undefined, ...new Set(passwords.filter(Boolean))]) {
    await emptyDir(destination);
    const result = await extract7z({ archive, destination, password });
    if (result.code < 2) return;
    if (!isPasswordFailure(result)) {
      const text = result.errors.join(' ');
      throw new Error(tm('Extraction impossible (7-Zip, code {code})', { code: String(result.code) }) + (text ? ` : ${text}` : ''));
    }
  }
  throw new ArchivePasswordError(inner ? path.basename(archive) : undefined);
}

// --- Import -----------------------------------------------------------------

/** Liens symboliques ou fichiers spéciaux : refusés (pourraient pointer hors du dossier du jeu). */
async function assertRegularTree(dir: string): Promise<void> {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await assertRegularTree(full);
    else if (!entry.isFile()) throw new Error(tm("Élément non pris en charge dans l'archive : {name}", { name: entry.name }));
  }
}

// Raccourcis Internet : jamais utiles au jeu.
const SHORTCUT = /\.(url|webloc|website)$/i;
// Fichiers qu'un site de diffusion glisse à côté du jeu (texte, page, bannière).
const PROMO_FILE = /\.(txt|nfo|html?|jpe?g|png|gif|webp|bmp)$/i;
const PROMO_TEXT = /\.(txt|nfo)$/i;
const MAX_PROMO_TEXT_BYTES = 8 * 1024;

/**
 * Fichier publicitaire d'un site de diffusion : raccourci Internet, fichier
 * au nom du site (`ryuugames.txt`, `OTOMI-GAMES.COM.url`), ou petit texte
 * qui ne contient que des adresses. Un texte avec autre chose (notice,
 * indices de l'auteur) est gardé.
 */
export function isJunkFile(file: string, sites: string[]): boolean {
  const name = path.basename(file);
  if (SHORTCUT.test(name)) return true;
  if (PROMO_FILE.test(name) && isSiteFileName(name, sites)) return true;
  if (!PROMO_TEXT.test(name) || fs.statSync(file).size > MAX_PROMO_TEXT_BYTES) return false;
  return isAddressOnlyText(readText(file));
}

/** Retire les fichiers publicitaires à la racine de `dir` (pas en profondeur : ce serait le jeu). */
function removeJunk(dir: string, sites: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isFile() && isJunkFile(file, sites)) fs.rmSync(file);
  }
}

/**
 * Descend dans les dossiers enveloppes (un unique dossier, sans rien
 * d'autre que des publicités, retirées au passage) : `RJ01234567/`, ou le
 * titre du jeu, contenant le vrai contenu. Renvoie aussi leurs noms
 * (indices d'ID et de version) et les mots de passe annoncés dans leurs
 * fichiers texte, lus avant le nettoyage (un `pass.txt` qui ne contient que
 * `site.com` est à la fois une publicité et le mot de passe).
 */
async function unwrap(dir: string, names: string[]): Promise<{ root: string; wrappers: string[]; passwords: string[] }> {
  let root = dir;
  const wrappers: string[] = [];
  const passwords: string[] = [];
  for (let depth = 0; ; depth++) {
    passwords.unshift(...passwordsFromFolder(root));
    removeJunk(root, siteNames([...names, ...wrappers]));
    if (depth >= MAX_UNWRAP_DEPTH) break;
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isDirectory()) break;
    wrappers.push(entries[0].name);
    root = path.join(root, entries[0].name);
  }
  return { root, wrappers, passwords };
}

// Archives dans l'archive extraites au plus (zip → rar → ...).
const MAX_NESTING = 2;
const INNER_ARCHIVE = /\.(zip|rar|7z)$|\.part\d+\.exe$/i;
// Ce qui peut accompagner une archive interne sans être le jeu (notice, mot de passe, lien, aperçu).
const ACCESSORY = /\.(txt|url|nfo|md|html?|jpe?g|png|gif|webp|bmp)$/i;

/**
 * Archive interne à extraire : le dossier ne contient qu'une archive (ou les
 * parties d'une seule) et des fichiers annexes. Un `Game.exe` à côté, ou un
 * sous-dossier, et c'est le jeu lui-même : rien à extraire.
 */
export function nestedArchive(dir: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const archives = entries.filter(e => e.isFile() && INNER_ARCHIVE.test(e.name));
  if (archives.length === 0) return null;
  if (entries.some(e => !archives.includes(e) && !(e.isFile() && ACCESSORY.test(e.name)))) return null;
  const sets = new Set(archives.map(e => RAR_PART.exec(e.name)?.[1] ?? e.name));
  if (sets.size !== 1) return null;
  return firstVolume(path.join(dir, archives[0].name));
}

/** IDs présents dans les noms de l'arborescence (3 niveaux). */
function idsInTree(dir: string, depth = 0): Set<string> {
  const ids = new Set<string>();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    for (const id of gameIdsIn(entry.name)) ids.add(id);
    if (entry.isDirectory() && depth < 2) for (const id of idsInTree(path.join(dir, entry.name), depth + 1)) ids.add(id);
  }
  return ids;
}

/** Restes d'un import interrompu (arrêt brutal). À n'appeler que sans import en cours. */
export async function removeStaleImports(destinationFolder: string): Promise<void> {
  await fs.promises.rm(path.join(destinationFolder, STAGING_DIR), { recursive: true, force: true });
}

export interface ImportedGame {
  gameId: string;
  version: string | null;
  dlc: boolean;
}

export interface ImportOptions {
  /** Mot de passe saisi : essayé en premier. */
  password?: string;
  /** Mots de passe du gestionnaire : essayés après ceux devinés d'après les noms et les fichiers texte. */
  passwords?: string[];
  /** Extraction 7-Zip (par défaut dans un processus utilitaire ; directe en test). */
  extract7z?: Extract7z;
  /** Le jeu existe déjà dans un autre dossier de bibliothèque : jamais importé une seconde fois. */
  isInLibrary?: (gameId: string) => boolean;
}

/**
 * Extrait `archivePath` et le range dans `<destinationFolder>/<ID>/`. L'ID
 * vient du nom de l'archive, sinon d'une archive interne ou d'un dossier
 * enveloppe, sinon du seul ID présent dans l'arborescence.
 */
export async function importArchive(archivePath: string, destinationFolder: string, options: ImportOptions = {}): Promise<ImportedGame> {
  if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new Error(tm('Dossier de jeux non configuré ou introuvable.'));
  const extract7z = options.extract7z ?? extractWith7z;
  const archive = firstVolume(archivePath);
  const idFromArchive = gameIdFromName(path.basename(archive));
  if (idFromArchive && (fs.existsSync(path.join(destinationFolder, idFromArchive)) || options.isInLibrary?.(idFromArchive))) {
    throw new Error(tm("{id} est déjà dans la bibliothèque : rien n'a été extrait.", { id: idFromArchive }));
  }

  const stagingRoot = path.join(destinationFolder, STAGING_DIR);
  const staging = path.join(stagingRoot, `${Date.now()}`);
  await fs.promises.mkdir(staging, { recursive: true });
  try {
    // Noms rencontrés, du plus extérieur au plus intérieur : ID, version, DLC.
    const names = [path.basename(archive)];
    // Devinés (fichiers texte, noms), les plus proches de l'archive en cours d'abord.
    let guesses = passwordsFromArchiveName(path.basename(archive));
    const candidates = () => [...(options.password ? [options.password] : []), ...guesses, ...(options.passwords ?? [])];
    let current = path.join(staging, '0');
    await fs.promises.mkdir(current);
    await extractArchive(archive, current, candidates(), extract7z);

    let root: string;
    for (let level = 1; ; level++) {
      await assertRegularTree(current);
      const unwrapped = await unwrap(current, names);
      root = unwrapped.root;
      names.push(...unwrapped.wrappers);
      const inner = level <= MAX_NESTING ? nestedArchive(root) : null;
      if (!inner) break;
      names.push(path.basename(inner));
      guesses = [...unwrapped.passwords, ...passwordsFromArchiveName(path.basename(inner)), ...guesses];
      const next = path.join(staging, String(level));
      await fs.promises.mkdir(next);
      await extractArchive(inner, next, candidates(), extract7z, true);
      await fs.promises.rm(current, { recursive: true, force: true });
      current = next;
    }
    if ((await fs.promises.readdir(root)).length === 0) throw new Error(tm("L'archive est vide."));

    const treeIds = idsInTree(root);
    const gameId = idFromArchive
      ?? names.map(gameIdFromName).find(id => id !== null)
      ?? (treeIds.size === 1 ? [...treeIds][0] : null);
    if (!gameId || !GAME_ID_REGEX.test(gameId)) {
      throw new Error(tm("ID DLsite introuvable (ni dans le nom de l'archive, ni dans son contenu) : renomme l'archive avec l'ID, ex: RJ01234567.zip."));
    }
    const target = path.join(destinationFolder, gameId);
    if (fs.existsSync(target) || options.isInLibrary?.(gameId)) throw new Error(tm("{id} est déjà dans la bibliothèque : rien n'a été importé.", { id: gameId }));
    await fs.promises.rename(root, target);
    const release = mergeReleaseNames(names);
    try {
      writeInstallInfo(target, { source: path.basename(archivePath), ...release, date: new Date().toISOString() });
    } catch (error) {
      // Le jeu est importé : l'origine n'est qu'un plus.
      console.error(`Origine de ${gameId} non enregistrée :`, error);
    }
    return { gameId, ...release };
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    // Dossier temporaire racine retiré s'il est vide (pas de reste visible dans la bibliothèque).
    await fs.promises.rmdir(stagingRoot).catch(() => undefined);
  }
}
