import { useState } from 'react';
import { CircleCheck, Trash2, TriangleAlert, X } from 'lucide-react';
import type { ArchiveCleanup } from '../../hooks/useArchiveImport';

export interface ArchiveCleanupToastProps {
  cleanup: ArchiveCleanup;
  onTrash: () => void;
  onDismiss: () => void;
}

/** Durée de la proposition, puis du bilan (plus long s'il y a des erreurs à lire). */
const PROPOSAL_MS = 15_000;
const DONE_MS = 4_000;
const ERROR_MS = 12_000;

/**
 * Toaster non bloquant proposé après un import réussi : mettre les archives
 * importées (toutes leurs parties) à la corbeille. Disparaît seul ; le
 * compte à rebours est suspendu tant que la souris est dessus.
 */
export default function ArchiveCleanupToast({ cleanup, onTrash, onDismiss }: ArchiveCleanupToastProps) {
  const [hovered, setHovered] = useState(false);
  const { outcome, busy } = cleanup;
  const duration = !outcome ? PROPOSAL_MS : outcome.errors.length > 0 ? ERROR_MS : DONE_MS;
  const paused = hovered || busy;

  const count = cleanup.importIds.length;

  return (
    <div
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="panel animate-steam-in fixed bottom-14 right-6 z-50 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden text-[13px] shadow-2xl"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {!outcome ? (
          <Trash2 size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-text-secondary" />
        ) : outcome.errors.length > 0 ? (
          <TriangleAlert size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-danger" />
        ) : (
          <CircleCheck size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-play" />
        )}
        <div className="min-w-0 flex-1">
          {!outcome ? (
            <>
              <p className="m-0">
                {count > 1 ? `${count} jeux importés.` : 'Jeu importé.'} Mettre {count > 1 ? 'leurs archives' : 'son archive'} à la corbeille ?
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={onTrash} disabled={busy} className="btn btn-primary py-1 text-[12px]">
                  <Trash2 size={14} strokeWidth={2.25} />
                  {busy ? 'Suppression…' : 'Mettre à la corbeille'}
                </button>
                <button type="button" onClick={onDismiss} disabled={busy} className="btn btn-ghost py-1 text-[12px]">
                  Garder
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0">
                {outcome.trashed > 0
                  ? `${outcome.trashed} fichier${outcome.trashed > 1 ? 's' : ''} mis à la corbeille.`
                  : 'Aucun fichier mis à la corbeille.'}
              </p>
              {outcome.errors.length > 0 && (
                <ul className="m-0 mt-1 list-none p-0 text-text-secondary">
                  {outcome.errors.map(error => <li key={error} className="break-words">{error}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Fermer" className="btn btn-ghost btn-icon -mr-2 -mt-1 h-7 w-7 flex-shrink-0">
          <X size={14} strokeWidth={2.25} />
        </button>
      </div>
      {/* Temps restant : sa fin ferme le toaster, donc la pause au survol vaut
          pour les deux. `key` relance l'animation à chaque étape. */}
      <div
        key={outcome ? 'done' : 'proposal'}
        onAnimationEnd={onDismiss}
        className="h-[3px] origin-left bg-accent"
        style={{ animation: `toast-countdown ${duration}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  );
}
