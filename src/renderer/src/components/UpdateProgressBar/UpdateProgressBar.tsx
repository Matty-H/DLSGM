import type { UpdateDownloadProgress } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

/**
 * Fine barre au-dessus de la barre des touches pendant le téléchargement
 * d'une mise à jour : discrète, sans texte (le détail est au survol).
 */
export default function UpdateProgressBar({ progress }: { progress: UpdateDownloadProgress | null }) {
  if (!progress) return null;
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const label = t('Téléchargement de la mise à jour {version} : {percent} %', { version: progress.version, percent });
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      title={label}
      className="h-[3px] flex-shrink-0 bg-bg-deep"
    >
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}
