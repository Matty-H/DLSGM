import fs from 'fs';
import path from 'path';
import type { GameWorkspaceEntry, GameWorkspaceInfo } from '../shared/ipc-types';

/**
 * Dossier de travaux d'un jeu (data mining : ressources extraites, scripts,
 * notes...) : `<racine des travaux>/<ID>/`, volontairement hors du dossier
 * du jeu — il n'est ni envoyé en partage LAN, ni touché par les patchs, et
 * survit à la suppression du jeu. DLSGM ne le crée qu'à la demande et ne le
 * supprime jamais.
 */

// Entrées de premier niveau affichées sur la page du jeu.
const MAX_LISTED_ENTRIES = 50;
// Au-delà, le décompte s'arrête (dossiers d'extraction énormes).
const MAX_COUNTED_FILES = 20000;

/** Dossier des travaux par défaut : Documents/DLSGM/Work. */
export const WORKSPACE_DIR_NAME = 'Work';
/** Ancien nom (français) : renommé en Work la première fois que la racine sert, contenu compris. */
const LEGACY_WORKSPACE_DIR_NAME = 'Travaux';

export function defaultWorkspaceRoot(documentsDir: string): string {
  const root = path.join(documentsDir, 'DLSGM', WORKSPACE_DIR_NAME);
  const legacy = path.join(documentsDir, 'DLSGM', LEGACY_WORKSPACE_DIR_NAME);
  // Les deux existent : Work sert, Travaux reste tel quel (DLSGM ne supprime jamais de travaux).
  if (!fs.existsSync(root) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, root);
    } catch {
      // Fichier ouvert ailleurs : on garde l'ancien dossier, nouvel essai au prochain appel.
      return legacy;
    }
  }
  return root;
}

/** Racine effective : celle des paramètres si c'est un chemin absolu, sinon celle par défaut. */
export function workspaceRoot(configured: string | undefined, documentsDir: string): string {
  return configured && path.isAbsolute(configured) ? configured : defaultWorkspaceRoot(documentsDir);
}

async function countTree(dir: string, budget: { files: number }): Promise<{ files: number; bytes: number; truncated: boolean }> {
  let files = 0;
  let bytes = 0;
  let truncated = false;
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (budget.files >= MAX_COUNTED_FILES) return { files, bytes, truncated: true };
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await countTree(full, budget);
      files += sub.files;
      bytes += sub.bytes;
      truncated ||= sub.truncated;
    } else if (entry.isFile()) {
      files++;
      budget.files++;
      bytes += (await fs.promises.stat(full)).size;
    }
  }
  return { files, bytes, truncated };
}

/** Contenu du dossier de travaux (sans le créer) : entrées de premier niveau, les plus récentes d'abord. */
export async function describeWorkspace(dir: string): Promise<GameWorkspaceInfo> {
  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return { path: dir, exists: false, entries: [], totalFiles: 0, totalBytes: 0, truncated: false };
  }

  const budget = { files: 0 };
  const entries: GameWorkspaceEntry[] = [];
  let totalFiles = 0;
  let totalBytes = 0;
  let truncated = false;
  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name);
    const stat = await fs.promises.stat(full).catch(() => null);
    if (!stat) continue;
    if (dirent.isDirectory()) {
      const sub = await countTree(full, budget);
      totalFiles += sub.files;
      totalBytes += sub.bytes;
      truncated ||= sub.truncated;
      entries.push({ name: dirent.name, isDirectory: true, size: sub.bytes, modified: stat.mtime.toISOString() });
    } else if (dirent.isFile()) {
      totalFiles++;
      budget.files++;
      totalBytes += stat.size;
      entries.push({ name: dirent.name, isDirectory: false, size: stat.size, modified: stat.mtime.toISOString() });
    }
  }
  entries.sort((a, b) => b.modified.localeCompare(a.modified));
  return { path: dir, exists: true, entries: entries.slice(0, MAX_LISTED_ENTRIES), totalFiles, totalBytes, truncated };
}
