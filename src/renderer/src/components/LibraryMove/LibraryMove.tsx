import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput, TriangleAlert } from 'lucide-react';
import type { LibraryMovePlan, LibraryMoveProgress, LibraryMoveResult } from '../../../../shared/ipc-types';
import { formatBytes } from '../../lib/diskUsage.js';
import { t } from '../../lib/i18n.js';

export interface LibraryMoveProps {
  /** Dossier actuel (vide : rien à déplacer). */
  currentFolder: string;
  /** Raison d'attendre (formulaire des paramètres modifié sans être enregistré), sinon null. */
  disabledReason: string | null;
  /** Déplacement terminé : main a changé `destinationFolder`, la bibliothèque est à rescanner. */
  onMoved: () => void;
}

type State =
  | { step: 'idle' }
  | { step: 'confirm'; target: string; plan: LibraryMovePlan; busy: string | null }
  | { step: 'moving'; target: string; progress: LibraryMoveProgress | null }
  | { step: 'done'; target: string; result: LibraryMoveResult }
  | { step: 'error'; error: string };

/**
 * « Déplacer la bibliothèque » (Paramètres › Bibliothèque) : tout le contenu
 * du dossier vers un autre, sans jamais rien écraser ni rien perdre (voir
 * src/main/library-move.ts) ; le dossier de la bibliothèque ne change qu'une
 * fois le déplacement réussi.
 */
export default function LibraryMove({ currentFolder, disabledReason, onMoved }: LibraryMoveProps) {
  const [state, setState] = useState<State>({ step: 'idle' });

  useEffect(
    () =>
      window.electronAPI.onLibraryMoveProgress(progress =>
        setState(prev => (prev.step === 'moving' ? { ...prev, progress } : prev))
      ),
    []
  );

  const choose = async () => {
    const target = await window.electronAPI.openFolderDialog();
    if (!target) return;
    const answer = await window.electronAPI.planLibraryMove(target);
    setState(answer.ok ? { step: 'confirm', target, plan: answer.plan, busy: answer.busy } : { step: 'error', error: answer.error });
  };

  const start = async (target: string) => {
    setState({ step: 'moving', target, progress: null });
    const answer = await window.electronAPI.moveLibrary(target);
    if (answer.ok) {
      setState({ step: 'done', target, result: answer.result });
      onMoved();
    } else {
      setState({ step: 'error', error: answer.error });
    }
  };

  const percent = state.step === 'moving' && state.progress && state.progress.total > 0 ? Math.round((state.progress.done / state.progress.total) * 100) : 0;

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={choose}
        disabled={!currentFolder || disabledReason !== null || state.step === 'moving'}
        title={disabledReason ?? t('Déplacer tous les jeux de la bibliothèque vers un autre dossier')}
      >
        <FolderInput size={16} strokeWidth={2.25} />
        {state.step === 'moving' ? t('Déplacement… {percent} %', { percent }) : t('Déplacer…')}
      </button>

      {state.step !== 'idle' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
            <div role="dialog" aria-modal="true" aria-label={t('Déplacer la bibliothèque')} data-nav-scope className="panel flex w-[600px] max-w-full flex-col gap-3 p-5">
              <h2 className="m-0 flex items-center gap-2 text-[18px] font-bold">
                <FolderInput size={18} strokeWidth={2.25} className="text-accent" />
                {t('Déplacer la bibliothèque')}
              </h2>

              {state.step === 'confirm' && (
                <>
                  <div className="rounded-md bg-bg-deep px-4 py-3 text-[13px] leading-relaxed">
                    <div className="break-all text-text-muted">{currentFolder}</div>
                    <div className="my-0.5 text-text-muted">↓</div>
                    <div className="break-all font-semibold">{state.target}</div>
                  </div>
                  <p className="m-0 text-[14px] leading-relaxed text-text-secondary">
                    {t('{games} jeux et {others} autres éléments, {size}.', {
                      games: state.plan.gameCount,
                      others: state.plan.entries.length - state.plan.gameCount,
                      size: formatBytes(state.plan.bytes)
                    })}{' '}
                    {state.plan.sameVolume
                      ? t('Même disque : les dossiers sont simplement déplacés, c’est immédiat.')
                      : t('Autre disque : tout est d’abord copié et vérifié, puis les originaux sont supprimés. Si quelque chose échoue, la copie est effacée et la bibliothèque reste où elle est.')}
                  </p>
                  {!state.plan.sameVolume && state.plan.freeBytes !== null && (
                    <p className="m-0 text-[13px] text-text-muted">{t('Espace libre sur le disque de destination : {free}.', { free: formatBytes(state.plan.freeBytes) })}</p>
                  )}
                  {state.busy && (
                    <p className="m-0 flex items-center gap-2 text-[13px] text-danger">
                      <TriangleAlert size={15} strokeWidth={2.25} />
                      {state.busy}
                    </p>
                  )}
                  <div className="mt-1 flex justify-end gap-2">
                    <button type="button" className="btn btn-ghost" onClick={() => setState({ step: 'idle' })}>
                      {t('Annuler')}
                    </button>
                    <button type="button" className="btn btn-primary" disabled={state.busy !== null} onClick={() => start(state.target)}>
                      {t('Déplacer')}
                    </button>
                  </div>
                </>
              )}

              {state.step === 'moving' && (
                <>
                  <p className="m-0 text-[14px] text-text-secondary">
                    {state.progress?.unit === 'bytes'
                      ? t('Copie : {done} / {total}', { done: formatBytes(state.progress.done), total: formatBytes(state.progress.total) })
                      : t('Déplacement en cours… Ne ferme pas DLSGM.')}
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
                  </div>
                </>
              )}

              {state.step === 'done' && (
                <>
                  <p className="m-0 text-[14px] text-text-secondary">
                    {t('Bibliothèque déplacée ({n} éléments). Son dossier est maintenant {path}.', { n: state.result.moved.length, path: state.target })}
                  </p>
                  {state.result.leftovers.length > 0 && (
                    <p className="m-0 flex items-start gap-2 text-[13px] text-danger">
                      <TriangleAlert size={15} strokeWidth={2.25} className="mt-0.5 flex-shrink-0" />
                      {t("Copiés, mais impossibles à supprimer de l'ancien dossier (fichier ouvert ?) : {names}. Tu peux les supprimer toi-même.", { names: state.result.leftovers.join(', ') })}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button type="button" className="btn btn-primary" onClick={() => setState({ step: 'idle' })}>
                      {t('Fermer')}
                    </button>
                  </div>
                </>
              )}

              {state.step === 'error' && (
                <>
                  <p className="m-0 flex items-start gap-2 text-[14px] text-danger">
                    <TriangleAlert size={16} strokeWidth={2.25} className="mt-0.5 flex-shrink-0" />
                    {state.error}
                  </p>
                  <p className="m-0 text-[13px] text-text-muted">{t("Rien n'a été déplacé ni supprimé.")}</p>
                  <div className="flex justify-end">
                    <button type="button" className="btn" onClick={() => setState({ step: 'idle' })}>
                      {t('Fermer')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
