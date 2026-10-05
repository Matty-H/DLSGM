import { useEffect, useState } from 'react';
import Select from '../Select/Select';
import { formatBytes, ipcErrorMessage } from '../../lib/gameTools.js';
import type { LibraryMoveProgress } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

export interface GameLocationProps {
  gameId: string;
  /** Après un déplacement : relire les infos du jeu (chemins). */
  onMoved: () => void;
}

const LABEL_CLASS = 'text-[12px] text-text-muted';

/**
 * Page du jeu › Outils : dossier de bibliothèque du jeu et « Déplacer vers… »
 * (seulement avec plusieurs dossiers de bibliothèque). Même mécanique que le
 * déplacement de toute la bibliothèque : renommage sur un même disque, sinon
 * copie vérifiée puis suppression de l'original.
 */
export default function GameLocation({ gameId, onMoved }: GameLocationProps) {
  const [location, setLocation] = useState<{ root: string | null; roots: string[] } | null>(null);
  const [target, setTarget] = useState('');
  const [progress, setProgress] = useState<LibraryMoveProgress | null>(null);
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMessage(null);
    window.electronAPI
      .getGameLocation(gameId)
      .then(result => {
        if (cancelled) return;
        setLocation(result);
        setTarget(result.roots.find(root => root !== result.root) ?? '');
      })
      .catch(() => !cancelled && setLocation(null));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => window.electronAPI.onLibraryMoveProgress(next => moving && setProgress(next)), [moving]);

  if (!location || location.roots.length < 2) return null;
  const others = location.roots.filter(root => root !== location.root);

  const move = async () => {
    if (!target || !window.confirm(t('Déplacer {id} vers {folder} ?', { id: gameId, folder: target }))) return;
    setMoving(true);
    setProgress(null);
    setMessage(null);
    try {
      const outcome = await window.electronAPI.moveGameToFolder(gameId, target);
      if (!outcome.ok) {
        setMessage({ text: outcome.error, isError: true });
        return;
      }
      setMessage(
        outcome.result.leftovers.length > 0
          ? { text: t("Jeu copié, mais l'original n'a pas pu être supprimé (fichier ouvert ?) : supprime-le à la main."), isError: true }
          : { text: t('Jeu déplacé.'), isError: false }
      );
      setLocation(await window.electronAPI.getGameLocation(gameId));
      onMoved();
    } catch (error) {
      setMessage({ text: ipcErrorMessage(error), isError: true });
    } finally {
      setMoving(false);
      setProgress(null);
    }
  };

  return (
    <div>
      <div className={`${LABEL_CLASS} mb-1`}>{t('Dossier de bibliothèque')}</div>
      <div className="mb-2 truncate" title={location.root ?? undefined}>{location.root ?? '—'}</div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select value={target} options={others.map(root => ({ value: root, label: root }))} onChange={setTarget} aria-label={t('Dossier de destination')} className="w-full" />
        </div>
        <button type="button" onClick={move} disabled={moving || !target} className="btn flex-shrink-0 text-[13px]">
          {moving
            ? progress
              ? progress.unit === 'bytes'
                ? `${formatBytes(progress.done)} / ${formatBytes(progress.total)}`
                : t('Déplacement…')
              : t('Déplacement…')
            : t('Déplacer')}
        </button>
      </div>
      {message && <p className={`mt-1 ${message.isError ? 'text-danger' : 'text-text-secondary'}`}>{message.text}</p>}
    </div>
  );
}
