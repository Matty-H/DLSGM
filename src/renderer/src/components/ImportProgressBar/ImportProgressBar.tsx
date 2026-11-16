import type { ArchiveImportProgress } from '../../../../shared/ipc-types';
import { importPercent } from '../../lib/importProgress.js';
import { t } from '../../lib/i18n.js';

/**
 * Barre au-dessus de la barre des touches pendant l'extraction d'archives :
 * avancement du lot entier (archives terminées + extraction en cours), le
 * détail de l'archive en cours au survol.
 */
export default function ImportProgressBar({ progress }: { progress: ArchiveImportProgress | null }) {
  if (!progress) return null;
  const percent = importPercent(progress);
  const label = t('Extraction de {file} : {percent} % (archive {index}/{total})', {
    file: progress.file,
    percent: progress.percent,
    index: progress.index,
    total: progress.total
  });
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      title={label}
      className="h-1 flex-shrink-0 bg-bg-deep"
    >
      <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
    </div>
  );
}
