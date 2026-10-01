import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { TextractorView } from '../../../../shared/ipc-types';

export interface OverlayTextractorProps {
  gameId: string;
  view: TextractorView;
}

/**
 * Session Textractor d'un jeu dans l'overlay : les fils de texte captés
 * (les plus bavards d'abord, avec leur dernier texte) ; celui qu'on coche
 * part au presse-papiers et/ou au fichier, et sera repris aux prochains
 * lancements (même hookcode). À la souris seulement.
 */
export default function OverlayTextractor({ gameId, view }: OverlayTextractorProps) {
  const [error, setError] = useState<string | null>(null);

  const select = async (hookcode: string | null) => {
    setError(null);
    try {
      await window.electronAPI.setTextractorHook(gameId, hookcode);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-divider pt-3 text-[13px]">
      <div className="flex items-center gap-1.5 font-semibold">
        <ScrollText size={14} strokeWidth={2.25} />
        Textractor
        <span className="font-normal text-text-muted">
          {view.attachedPids.length > 0 ? `· attaché (${view.attachedPids.length} processus)` : '· recherche du jeu…'}
        </span>
      </div>
      {view.threads.length === 0 ? (
        <p className="m-0 text-[12px] text-text-muted">Aucun texte capté pour l'instant : avance un peu dans le jeu.</p>
      ) : (
        <ul className="m-0 flex max-h-[260px] list-none flex-col gap-1 overflow-y-auto p-0">
          <li>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-text-secondary">
              <input type="radio" name={`tx-${gameId}`} className="accent-accent" checked={view.selectedHook === null} onChange={() => select(null)} />
              Aucun fil choisi (tous au fichier, rien au presse-papiers)
            </label>
          </li>
          {view.threads.map(thread => (
            <li key={thread.key}>
              <label className="flex cursor-pointer items-start gap-2 text-[12px]">
                <input
                  type="radio"
                  name={`tx-${gameId}`}
                  className="mt-0.5 accent-accent"
                  checked={view.selectedHook === thread.hookcode}
                  onChange={() => select(thread.hookcode)}
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px] text-text-muted" title={thread.hookcode}>
                    {thread.name} · {thread.hookcode} · {thread.count}
                  </span>
                  <span className="line-clamp-2 block">{thread.lastText}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {(error || view.error) && <p className="m-0 text-[12px] text-danger">{error ?? view.error}</p>}
    </div>
  );
}
