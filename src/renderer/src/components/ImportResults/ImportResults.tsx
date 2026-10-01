import { useState } from 'react';
import { CircleCheck, KeyRound, TriangleAlert, X } from 'lucide-react';
import type { ArchiveImportResult } from '../../../../shared/ipc-types';
import { releaseLabel } from '../../lib/releaseInfo.js';

export interface ImportResultsProps {
  results: ArchiveImportResult[];
  onDismiss: () => void;
  /** Ouvre la page d'un jeu importé. */
  onOpenGame: (gameId: string) => void;
  /** Nouvel essai d'une archive refusée faute de mot de passe. */
  onRetry: (retryId: string, password: string, remember: boolean) => void;
  /** Un import est en cours : les nouveaux essais attendent. */
  busy: boolean;
}

/** Saisie du mot de passe d'une archive chiffrée, sous son échec. */
function PasswordRetry({ retryId, onRetry, busy }: { retryId: string; onRetry: ImportResultsProps['onRetry']; busy: boolean }) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  return (
    <form
      className="mt-1.5 flex flex-wrap items-center gap-2"
      onSubmit={event => {
        event.preventDefault();
        if (password) onRetry(retryId, password, remember);
      }}
    >
      <KeyRound size={14} strokeWidth={2.25} className="text-text-secondary" />
      <input
        type="text"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Mot de passe de l'archive"
        aria-label="Mot de passe de l'archive"
        autoComplete="off"
        spellCheck={false}
        className="input w-[220px] py-1 text-[12px]"
      />
      <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-text-secondary">
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
        Mémoriser (essayé sur les prochains imports)
      </label>
      <button type="submit" disabled={busy || !password} className="btn btn-primary py-1 text-[12px]">
        {busy ? 'Extraction…' : 'Réessayer'}
      </button>
    </form>
  );
}

/** Bilan d'un import d'archives, sous la barre de la bibliothèque. */
export default function ImportResults({ results, onDismiss, onOpenGame, onRetry, busy }: ImportResultsProps) {
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
                  {releaseLabel(result) && <span className="text-text-secondary"> ({releaseLabel(result)})</span>}
                </span>
              </>
            ) : (
              <>
                <TriangleAlert size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-danger" aria-label="Échec" />
                <div className="min-w-0">
                  <span className="font-semibold">{result.file}</span> : <span className="text-text-secondary">{result.error}</span>
                  {result.retryId && <PasswordRetry key={result.retryId} retryId={result.retryId} onRetry={onRetry} busy={busy} />}
                </div>
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
