import type { ArchiveImportProgress } from '../../../shared/ipc-types';

/**
 * Avancement d'un lot d'archives, 0 à 100 : les archives terminées comptent
 * en entier, celle en cours pour sa part extraite. Chaque archive pèse
 * autant (leurs tailles ne sont pas connues du renderer).
 */
export function importPercent({ index, total, percent }: ArchiveImportProgress): number {
  if (!(total > 0)) return 0;
  const current = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const done = Math.max(0, Math.min(total, index) - 1);
  return Math.max(0, Math.min(100, Math.round((done * 100 + current) / total)));
}
