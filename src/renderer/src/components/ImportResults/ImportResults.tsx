import { KeyRound, TriangleAlert, X } from 'lucide-react';
import type { ArchiveImportResult } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

export interface ImportResultsProps {
  results: ArchiveImportResult[];
  onDismiss: () => void;
  /** Rouvre la fenêtre de mot de passe d'une archive refusée. */
  onAskPassword: (retryId: string) => void;
}

/**
 * Archives qui n'ont pas pu être importées, sous la barre de la bibliothèque.
 * Les imports réussis n'y figurent pas : le jeu apparaît dans la grille avec
 * son animation d'ajout (animations.css, card-new), c'est lui le bilan. Rien
 * n'est affiché quand tout a réussi.
 */
export default function ImportResults({ results, onDismiss, onAskPassword }: ImportResultsProps) {
  const failures = results.filter(result => !result.gameId);
  if (failures.length === 0) return null;

  return (
    <div className="panel animate-steam-in mx-6 mb-3 flex flex-shrink-0 items-start gap-4 px-5 py-3">
      <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1.5 p-0 text-[13px]">
        {failures.map(result => (
          <li key={result.file} className="flex items-start gap-2">
            <TriangleAlert size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-danger" aria-label={t('Échec')} />
            <div className="min-w-0">
              <span className="font-semibold">{result.file}</span> : <span className="text-text-secondary">{result.error}</span>
              {result.retryId && (
                <button type="button" onClick={() => onAskPassword(result.retryId!)} className="btn mt-1.5 py-1 text-[12px]">
                  <KeyRound size={14} strokeWidth={2.25} />
                  {t('Saisir le mot de passe')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDismiss} aria-label={t("Fermer le bilan d'import")} className="btn btn-ghost btn-icon flex-shrink-0">
        <X size={16} strokeWidth={2.25} />
      </button>
    </div>
  );
}
