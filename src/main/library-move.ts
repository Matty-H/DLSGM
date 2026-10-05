import fs from 'fs';
import path from 'path';
import type { LibraryMovePlan, LibraryMoveProgress, LibraryMoveResult } from '../shared/ipc-types';

export type { LibraryMovePlan, LibraryMoveProgress, LibraryMoveResult };

/**
 * Déplacement de toute la bibliothèque (contenu de `destinationFolder`) vers
 * un autre dossier, en ne perdant jamais rien :
 *
 * - même disque : un renommage par entrée (instantané) ; un échec remet en
 *   place les entrées déjà déplacées ;
 * - autre disque : tout est d'abord **copié** dans un dossier de transit
 *   caché du dossier cible (`.dlsgm-moving-<ts>`), chaque fichier vérifié
 *   (taille) ; un échec supprime la copie et laisse la bibliothèque intacte.
 *   Seulement quand tout est copié : renommage des copies à leur place, puis
 *   suppression des originaux. Un original impossible à supprimer (fichier
 *   ouvert) reste à l'ancien endroit et est signalé — la copie, elle, est complète.
 *
 * Le paramètre `destinationFolder` n'est changé par l'appelant qu'après un
 * déplacement réussi. Les dossiers temporaires de DLSGM (import d'archives,
 * réception réseau) ne sont pas déplacés.
 */

/** Dossiers temporaires de DLSGM laissés sur place. */
const SKIPPED = new Set(['.dlsgm-incoming', '.dlsgm-import']);
const STAGING_PREFIX = '.dlsgm-moving-';
const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;
// Marge gardée sur le disque cible en plus de la taille copiée.
const FREE_SPACE_MARGIN = 512 * 1024 * 1024;

export type LibraryMoveErrorCode =
  | 'same-folder'
  | 'target-inside-source'
  | 'source-missing'
  | 'target-missing'
  | 'conflicts'
  | 'no-space'
  | 'nothing-to-move';

export class LibraryMoveError extends Error {
  constructor(public readonly code: LibraryMoveErrorCode, public readonly detail: string[] = []) {
    super(`${code}${detail.length ? `: ${detail.join(', ')}` : ''}`);
  }
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

/** Taille d'une entrée (fichier ou dossier, liens non suivis). */
async function entrySize(full: string): Promise<number> {
  const stat = await fs.promises.lstat(full);
  if (!stat.isDirectory()) return stat.isFile() ? stat.size : 0;
  let total = 0;
  for (const child of await fs.promises.readdir(full)) total += await entrySize(path.join(full, child));
  return total;
}

async function freeSpace(dir: string): Promise<number | null> {
  try {
    const stats = await fs.promises.statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

/** Vérifie le déplacement et le décrit (lève une `LibraryMoveError` s'il est impossible). */
export async function planLibraryMove(source: string, target: string): Promise<LibraryMovePlan> {
  const from = path.resolve(source);
  const to = path.resolve(target);
  if (path.relative(from, to) === '') throw new LibraryMoveError('same-folder');
  if (inside(from, to)) throw new LibraryMoveError('target-inside-source');
  if (!(await isDirectory(from))) throw new LibraryMoveError('source-missing');
  if (!(await isDirectory(to))) throw new LibraryMoveError('target-missing');

  const entries = (await fs.promises.readdir(from)).filter(name => !SKIPPED.has(name) && !name.startsWith(STAGING_PREFIX)).sort();
  if (entries.length === 0) throw new LibraryMoveError('nothing-to-move');
  // Jamais d'écrasement : un nom déjà présent dans la cible bloque tout (comparaison sans casse, comme NTFS/APFS).
  const existing = new Set((await fs.promises.readdir(to)).map(name => name.toLowerCase()));
  const conflicts = entries.filter(name => existing.has(name.toLowerCase()));
  if (conflicts.length > 0) throw new LibraryMoveError('conflicts', conflicts);

  const [fromStat, toStat] = await Promise.all([fs.promises.stat(from), fs.promises.stat(to)]);
  let bytes = 0;
  for (const name of entries) bytes += await entrySize(path.join(from, name));
  const freeBytes = await freeSpace(to);
  const sameVolume = fromStat.dev === toStat.dev;
  if (!sameVolume && freeBytes !== null && freeBytes < bytes + FREE_SPACE_MARGIN) {
    throw new LibraryMoveError('no-space', [String(bytes), String(freeBytes)]);
  }
  return { entries, gameCount: entries.filter(name => GAME_ID_REGEX.test(name)).length, bytes, sameVolume, freeBytes };
}

/** Copie récursive vérifiée (taille de chaque fichier). */
async function copyEntry(from: string, to: string, onBytes: (n: number) => void): Promise<void> {
  const stat = await fs.promises.lstat(from);
  if (stat.isDirectory()) {
    await fs.promises.mkdir(to);
    for (const child of await fs.promises.readdir(from)) await copyEntry(path.join(from, child), path.join(to, child), onBytes);
    return;
  }
  if (stat.isSymbolicLink()) {
    await fs.promises.symlink(await fs.promises.readlink(from), to);
    return;
  }
  if (!stat.isFile()) return; // ni fichier ni dossier (socket...) : rien à copier
  await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
  const copied = await fs.promises.stat(to);
  if (copied.size !== stat.size) throw new Error(`Copie incomplète : ${from} (${copied.size}/${stat.size} octets)`);
  onBytes(stat.size);
}

async function renameAll(from: string, to: string, entries: string[], onDone: (n: number) => void): Promise<void> {
  const done: string[] = [];
  try {
    for (const name of entries) {
      await fs.promises.rename(path.join(from, name), path.join(to, name));
      done.push(name);
      onDone(done.length);
    }
  } catch (error) {
    // Remise en place de ce qui a déjà bougé : la bibliothèque reste entière d'un côté.
    for (const name of done.reverse()) {
      await fs.promises.rename(path.join(to, name), path.join(from, name)).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Déplace la bibliothèque `source` → `target` (voir le commentaire du
 * module). `forceCopy` : copie même sur un seul disque (tests).
 */
export async function moveLibrary(
  source: string,
  target: string,
  options: { onProgress?: (progress: LibraryMoveProgress) => void; forceCopy?: boolean } = {}
): Promise<LibraryMoveResult> {
  const from = path.resolve(source);
  const to = path.resolve(target);
  const plan = await planLibraryMove(from, to);
  const { entries } = plan;

  if (plan.sameVolume && !options.forceCopy) {
    try {
      await renameAll(from, to, entries, done => options.onProgress?.({ done, total: entries.length, unit: 'entries' }));
      return { moved: entries, leftovers: [], copied: false };
    } catch (error) {
      // Points de montage différents malgré un même `dev` : on repasse par la copie.
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    }
  }

  const staging = path.join(to, `${STAGING_PREFIX}${Date.now()}`);
  await fs.promises.mkdir(staging);
  let copiedBytes = 0;
  try {
    for (const name of entries) {
      await copyEntry(path.join(from, name), path.join(staging, name), n => {
        copiedBytes += n;
        options.onProgress?.({ done: copiedBytes, total: plan.bytes, unit: 'bytes' });
      });
    }
    await renameAll(staging, to, entries, () => undefined);
  } catch (error) {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  await fs.promises.rmdir(staging).catch(() => undefined);

  // Tout est copié et en place : seulement maintenant, les originaux partent.
  const leftovers: string[] = [];
  for (const name of entries) {
    try {
      await fs.promises.rm(path.join(from, name), { recursive: true });
    } catch {
      leftovers.push(name);
    }
  }
  return { moved: entries, leftovers, copied: true };
}
