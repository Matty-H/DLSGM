import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Trash2, X } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { captureSrc, formatCaptureDate } from '../../lib/captures.js';
import type { CaptureInfo } from '../../../../shared/ipc-types';

export interface CaptureGalleryProps {
  gameId: string;
  /** Vignettes affichées au plus (les plus récentes) ; toutes par défaut. */
  limit?: number;
  /** Dans l'overlay : pas de bouton « Ouvrir le dossier » (l'Explorateur prendrait le focus au jeu). */
  inOverlay?: boolean;
}

/**
 * Galerie des captures d'un jeu (`<travaux>/<ID>/captures/`) : vignettes,
 * visionneuse (flèches, suppression vers la corbeille). Se met à jour à
 * chaque nouvelle capture.
 */
export default function CaptureGallery({ gameId, limit, inOverlay = false }: CaptureGalleryProps) {
  const [captures, setCaptures] = useState<CaptureInfo[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI.listCaptures(gameId).then(setCaptures).catch(err => setError(ipcErrorMessage(err)));
  }, [gameId]);

  useEffect(() => {
    setOpen(null);
    refresh();
    return window.electronAPI.onCapturesChanged(id => id === gameId && refresh());
  }, [gameId, refresh]);

  if (!captures) return null;
  const shown = limit ? captures.slice(0, limit) : captures;
  const current = open !== null ? captures[open] : null;

  const remove = async (file: string) => {
    setError(null);
    try {
      const next = await window.electronAPI.deleteCapture(gameId, file);
      setCaptures(next);
      setOpen(next.length === 0 ? null : Math.min(open ?? 0, next.length - 1));
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {captures.length === 0 ? (
        <p className="m-0 text-[12px] text-text-muted">Aucune capture pour ce jeu.</p>
      ) : (
        <div className={`grid gap-2 ${inOverlay ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {shown.map((capture, i) => (
            <button
              key={capture.file}
              type="button"
              onClick={() => setOpen(i)}
              className="overflow-hidden rounded-sm border border-divider bg-bg-deep hover:border-accent"
              title={formatCaptureDate(capture.date)}
            >
              <img src={captureSrc(gameId, capture.file)} alt="" loading="lazy" className="block aspect-video w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
        {captures.length > shown.length && <span>{captures.length - shown.length} de plus</span>}
        {!inOverlay && (
          <button type="button" className="btn btn-ghost py-1 text-[12px]" onClick={() => window.electronAPI.openCapturesFolder(gameId)}>
            <FolderOpen size={13} strokeWidth={2.25} />
            Ouvrir le dossier
          </button>
        )}
      </div>
      {error && <p className="m-0 text-[12px] text-danger">{error}</p>}

      {current && open !== null && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-6" role="dialog" aria-label="Capture">
          <img src={captureSrc(gameId, current.file)} alt="" className="max-h-[80vh] max-w-full rounded-sm object-contain shadow-2xl" />
          <div className="flex items-center gap-2 text-[13px] text-white">
            <button type="button" className="btn btn-icon" disabled={open === 0} onClick={() => setOpen(open - 1)} aria-label="Plus récente">
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <span className="tabular-nums">
              {formatCaptureDate(current.date)} · {open + 1}/{captures.length}
            </span>
            <button type="button" className="btn btn-icon" disabled={open === captures.length - 1} onClick={() => setOpen(open + 1)} aria-label="Plus ancienne">
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => remove(current.file)}>
              <Trash2 size={14} strokeWidth={2.25} />
              Corbeille
            </button>
            <button type="button" className="btn btn-icon" onClick={() => setOpen(null)} aria-label="Fermer">
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
