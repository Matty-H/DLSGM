import type { LibraryHealthReport } from '../../../shared/ipc-types';

export type { LibraryHealthReport };

export const checkLibraryHealth = () => window.electronAPI.checkLibraryHealth();

/** Nombre de problèmes du bilan (un par jeu ou dossier concerné). */
export function healthIssueCount(report: LibraryHealthReport): number {
  return (
    report.noExecutable.length +
    report.fetchFailed.length +
    report.missingImages.length +
    report.misnamed.length +
    report.orphans.length +
    report.brokenPatches.length
  );
}

/** Dossiers mal nommés que l'assistant peut renommer (ni conflit, ni doublon). */
export function renamableFolders(report: LibraryHealthReport): string[] {
  return report.misnamed.filter(folder => !folder.conflict).map(folder => folder.folder);
}
