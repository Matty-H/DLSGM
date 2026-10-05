import fs from 'fs';
import path from 'path';
import type { AppSettings } from '../shared/ipc-types';

/**
 * Plusieurs dossiers de bibliothèque : `destinationFolder` (le dossier
 * principal : imports d'archives, réceptions réseau, assistant) et
 * `extraLibraryFolders`. Une seule bibliothèque à l'écran ; chaque jeu vit
 * dans `<un des dossiers>/<ID>/`.
 *
 * Un même ID présent dans deux dossiers : le premier dossier (principal,
 * puis les autres dans l'ordre) l'emporte partout ; le doublon est signalé
 * par le bilan de santé, jamais supprimé. Rien n'est jamais créé ailleurs
 * que dans le dossier principal, et un ID déjà présent dans n'importe quel
 * dossier n'est jamais réimporté ni reçu.
 */

const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;

const sameOrInside = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/**
 * Dossiers supplémentaires valides : absolus, sans doublon (casse ignorée),
 * ni égal au dossier principal, ni l'un dans l'autre (un jeu serait vu deux fois).
 */
export function sanitizeExtraFolders(primary: string, extras: unknown): string[] {
  if (!Array.isArray(extras)) return [];
  const kept: string[] = [];
  const all = primary ? [path.resolve(primary)] : [];
  for (const value of extras) {
    if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) continue;
    const folder = path.resolve(value);
    if (all.some(other => sameOrInside(other, folder) || sameOrInside(folder, other))) continue;
    kept.push(folder);
    all.push(folder);
  }
  return kept.slice(0, 20);
}

/** Dossiers de bibliothèque, principal d'abord. */
export function libraryRoots(settings: Pick<AppSettings, 'destinationFolder' | 'extraLibraryFolders'>): string[] {
  const primary = settings.destinationFolder ? [path.resolve(settings.destinationFolder)] : [];
  return [...primary, ...sanitizeExtraFolders(settings.destinationFolder, settings.extraLibraryFolders)];
}

export interface LibraryScan {
  /** ID → dossier de bibliothèque qui le contient (le premier, en cas de doublon). */
  games: Map<string, string>;
  /** IDs présents dans plusieurs dossiers (dossiers dans l'ordre). */
  duplicates: { gameId: string; roots: string[] }[];
  /** Dossiers de bibliothèque introuvables (disque débranché). */
  missingRoots: string[];
}

export function scanLibraryRoots(roots: string[]): LibraryScan {
  const games = new Map<string, string>();
  const seen = new Map<string, string[]>();
  const missingRoots: string[] = [];
  for (const root of roots) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      missingRoots.push(root);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !GAME_ID_REGEX.test(entry.name)) continue;
      if (!games.has(entry.name)) games.set(entry.name, root);
      seen.set(entry.name, [...(seen.get(entry.name) ?? []), root]);
    }
  }
  const duplicates = [...seen.entries()].filter(([, where]) => where.length > 1).map(([gameId, where]) => ({ gameId, roots: where }));
  return { games, duplicates, missingRoots };
}

/** Dossier du jeu (dans le premier dossier de bibliothèque qui l'a), ou null. */
export function locateGame(roots: string[], gameId: string): string | null {
  for (const root of roots) {
    const dir = path.join(root, gameId);
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // absent de ce dossier
    }
  }
  return null;
}

/** Dossier de bibliothèque contenant `dir` (un dossier de jeu), ou null. */
export function rootOf(roots: string[], dir: string): string | null {
  return roots.find(root => path.relative(root, path.dirname(dir)) === '') ?? null;
}
