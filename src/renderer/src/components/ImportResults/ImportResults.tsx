import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import type { ArchiveImportResult } from '../../../../shared/ipc-types';

export interface ImportResultsProps {
  results: ArchiveImportResult[];
  onDismiss: () => void;
  /** Ouvre la page d'un jeu importé. */
  onOpenGame: (gameId: string) => void;
}

/** Bilan d'un import d'archives, sous la barre de la bibliothèque. */
export default function ImportResults({ results, onDismiss, onOpenGame }: ImportResultsProps) {
  return (
    <div className="panel animate-steam-in mx-6 mb-3 flex flex-shrink-0 items-start gap-4 px-5 py-3">
      <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1.5 p-0 text-[13px]">
        {results.map(result => (
          <li key={result.file} className="flex items-start gap-2">
            {result.gameId ? (
              <>
                <CircleCheck size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-play" aria-label="Importé" />
                <span className="min-w-0 truncate">
                  {result.file} →{' '}
                  <button type="button" onClick={() => onOpenGame(result.gameId!)} className="font-semibold text-accent hover:underline">
                    {result.gameId}
                  </button>
                </span>
              </>
            ) : (
              <>
                <TriangleAlert size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-danger" aria-label="Échec" />
                <span className="min-w-0">
                  <span className="font-semibold">{result.file}</span> : <span className="text-text-secondary">{result.error}</span>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDismiss} aria-label="Fermer le bilan d'import" className="btn btn-ghost btn-icon flex-shrink-0">
        <X size={16} strokeWidth={2.25} />
      </button>
    </div>
  );
}
