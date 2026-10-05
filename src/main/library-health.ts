import fs from 'fs';
import path from 'path';
import { findExe, findMacApp } from './executables';
import { findMisnamedFolders } from './folder-rename';
import { readPatches } from './game-tools';
import { scanLibraryRoots } from './library-folders';
import type { GameMetadata, LibraryHealthReport } from '../shared/ipc-types';

/**
 * Bilan de santé de la bibliothèque : liste ce qui cloche, sans rien
 * corriger ni supprimer. Chaque problème a sa correction côté renderer
 * (bouton), toujours à la demande de l'utilisateur.
 */

const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;

// Marqueur d'une image fournie à la main (voir ipc-handlers.ts) : rien à retélécharger.
const MANUAL_IMAGE = 'manual';

/**
 * Catégories DLsite qui sont des jeux : seules celles-là doivent avoir un
 * exécutable (une œuvre audio ou un manga n'en a pas, et c'est normal).
 */
export const GAME_CATEGORIES = new Set(['ACN', 'ADV', 'QIZ', 'DNV', 'ETC', 'PZL', 'RPG', 'STG', 'SLN', 'TBL', 'TYP']);

export interface LibraryHealthInput {
  /** Dossiers de bibliothèque, principal d'abord (voir library-folders.ts). */
  libraryRoots: string[];
  cache: Record<string, GameMetadata>;
  imgCacheDir: string;
  platform: NodeJS.Platform;
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Exécutable introuvable : `chosenMissing` si celui choisi à la main a
 * disparu. Sous Windows, un jeu sans aucun .exe est signalé ; sur Mac, la
 * plupart des jeux DLsite n'existent qu'en version Windows, donc seul un
 * exécutable choisi disparu l'est.
 */
function checkExecutable(gameDir: string, entry: GameMetadata, platform: NodeJS.Platform): { chosenMissing: string | null } | null {
  let chosenMissing: string | null = null;
  if (entry.executablePath) {
    const chosen = path.resolve(gameDir, entry.executablePath);
    if (isInside(gameDir, chosen) && exists(chosen)) return null;
    chosenMissing = entry.executablePath;
  }
  if (!entry.category || !GAME_CATEGORIES.has(entry.category)) return chosenMissing ? { chosenMissing } : null;
  try {
    if (platform === 'win32' && findExe(gameDir)) return chosenMissing ? { chosenMissing } : null;
    if (platform === 'darwin') return chosenMissing ? { chosenMissing } : null;
    if (platform !== 'win32') return null;
  } catch {
    // dossier illisible : signalé comme sans exécutable
  }
  return { chosenMissing };
}

/** Images DLsite attendues mais absentes du cache d'images (les images manuelles ne se retéléchargent pas). */
function missingImages(gameImgDir: string, entry: GameMetadata): { cover: boolean; samples: number } {
  const cover = Boolean(entry.work_image && entry.work_image !== MANUAL_IMAGE && !exists(path.join(gameImgDir, 'work_image.jpg')));
  let samples = 0;
  (entry.sample_images ?? []).forEach((url, i) => {
    if (url && url !== MANUAL_IMAGE && !exists(path.join(gameImgDir, `sample_${i + 1}.jpg`))) samples++;
  });
  return { cover, samples };
}

export function checkLibraryHealth({ libraryRoots, cache, imgCacheDir, platform }: LibraryHealthInput): LibraryHealthReport {
  const scan = scanLibraryRoots(libraryRoots);
  const folders = [...scan.games.keys()];
  const present = new Set(folders);
  const report: LibraryHealthReport = {
    checkedAt: new Date().toISOString(),
    gameCount: folders.length,
    noExecutable: [],
    fetchFailed: [],
    missingImages: [],
    misnamed: [],
    orphans: [],
    duplicates: scan.duplicates,
    missingRoots: scan.missingRoots,
    brokenPatches: []
  };

  for (const gameId of folders.sort()) {
    const gameDir = path.join(scan.games.get(gameId)!, gameId);
    const entry = cache[gameId];
    if (!entry) continue; // pas encore récupéré : le prochain scan s'en charge

    if (entry.fetchFailed) {
      report.fetchFailed.push({ gameId, error: entry.error ?? null });
    } else {
      const missing = missingImages(path.join(imgCacheDir, gameId), entry);
      if (missing.cover || missing.samples > 0 || entry.imagesComplete === false) {
        report.missingImages.push({ gameId, ...missing });
      }
    }

    const exe = checkExecutable(gameDir, entry, platform);
    if (exe) report.noExecutable.push({ gameId, ...exe });

    const patches = readPatches(gameDir);
    patches.forEach((patch, index) => {
      // Le .rpyc du mode debug Ren'Py n'existe qu'après le premier lancement.
      const missingFiles = patch.added.filter(rel => !exists(path.join(gameDir, rel)) && !(patch.kind === 'debug' && rel.endsWith('.rpyc')));
      const backupDir = path.join(gameDir, '.dlsgm', 'backup', patch.id);
      const missingBackups = patch.overwritten.filter(rel => !exists(path.join(backupDir, rel)));
      if (missingFiles.length > 0 || missingBackups.length > 0) {
        report.brokenPatches.push({
          gameId,
          patchId: patch.id,
          name: patch.name,
          missingFiles,
          missingBackups,
          isLast: index === patches.length - 1
        });
      }
    });
  }

  for (const root of libraryRoots) {
    if (scan.missingRoots.includes(root)) continue;
    try {
      report.misnamed.push(...findMisnamedFolders(root, folders.filter(id => scan.games.get(id) !== root)));
    } catch {
      // dossier illisible
    }
  }

  for (const [gameId, entry] of Object.entries(cache)) {
    if (!GAME_ID_REGEX.test(gameId) || present.has(gameId)) continue;
    // Un dossier mal nommé du même ID n'est pas une fiche orpheline : l'assistant de renommage le retrouve.
    if (report.misnamed.some(m => m.gameId === gameId)) continue;
    report.orphans.push({ gameId, name: entry?.work_name || gameId, failed: entry?.fetchFailed === true });
  }
  report.orphans.sort((a, b) => a.gameId.localeCompare(b.gameId));

  return report;
}
