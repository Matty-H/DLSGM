import type { MisnamedFolder } from '../../../shared/ipc-types';

/** Plusieurs dossiers de bibliothèque (voir src/main/library-folders.ts) : aides d'affichage, sans DOM. */

/** Chemin complet d'un dossier mal nommé (ce que `renameMisnamedFolders` attend). */
export function misnamedPath(folder: Pick<MisnamedFolder, 'root' | 'folder'>): string {
  const sep = folder.root.includes('\\') ? '\\' : '/';
  return folder.root.endsWith(sep) ? `${folder.root}${folder.folder}` : `${folder.root}${sep}${folder.folder}`;
}

/**
 * Ajoute un dossier à la liste des dossiers supplémentaires : refusé (null)
 * s'il est vide, déjà présent, le dossier principal, ou l'un dans l'autre
 * (main revérifie à l'enregistrement).
 */
export function addExtraFolder(primary: string, extras: string[], folder: string): string[] | null {
  const norm = (p: string) => p.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
  const target = norm(folder);
  if (!target) return null;
  const all = [primary, ...extras].filter(Boolean).map(norm);
  if (all.some(other => other === target || target.startsWith(`${other}/`) || other.startsWith(`${target}/`))) return null;
  return [...extras, folder];
}
