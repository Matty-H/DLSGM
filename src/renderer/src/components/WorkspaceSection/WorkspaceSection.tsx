import { useCallback, useEffect, useState } from 'react';
import { File, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import { formatBytes, ipcErrorMessage } from '../../lib/gameTools.js';
import type { GameWorkspaceInfo } from '../../../../shared/ipc-types';

export interface WorkspaceSectionProps {
  gameId: string;
}

const COLLAPSED_COUNT = 8;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Dossier de travaux du jeu (data mining, extractions, notes...), hors du
 * dossier du jeu : ouverture dans l'explorateur (créé au premier clic) et
 * aperçu de son contenu, relu quand la fenêtre reprend le focus (retour
 * depuis l'explorateur).
 */
export default function WorkspaceSection({ gameId }: WorkspaceSectionProps) {
  const [info, setInfo] = useState<GameWorkspaceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(() => {
    window.electronAPI
      .getGameWorkspace(gameId)
      .then(result => {
        setInfo(result);
        setError(null);
      })
      .catch(err => setError(ipcErrorMessage(err)));
  }, [gameId]);

  useEffect(() => {
    setInfo(null);
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);

  const handleOpen = async () => {
    try {
      setInfo(await window.electronAPI.openGameWorkspace(gameId));
      setError(null);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const entries = info?.entries ?? [];
  const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleOpen} className="btn text-[13px]">
          <FolderOpen size={15} strokeWidth={2.25} />
          {info?.exists ? 'Ouvrir le dossier' : 'Créer et ouvrir le dossier'}
        </button>
        {info?.exists && (
          <button type="button" onClick={reload} className="btn btn-ghost btn-icon" title="Actualiser" aria-label="Actualiser le contenu">
            <RefreshCw size={15} strokeWidth={2.25} />
          </button>
        )}
        {info?.exists && (
          <span className="text-text-secondary">
            {info.truncated ? 'plus de ' : ''}
            {info.totalFiles} fichier{info.totalFiles > 1 ? 's' : ''} · {formatBytes(info.totalBytes)}
          </span>
        )}
      </div>

      {info && (
        <div className="truncate font-mono text-[12px] text-text-muted" title={info.path}>
          {info.path}
        </div>
      )}

      {info?.exists && entries.length === 0 && <p className="m-0 text-text-secondary">Dossier vide.</p>}

      {visible.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {visible.map(entry => (
            <li key={entry.name} className="flex items-center gap-2 border-b border-divider py-1.5 last:border-0">
              {entry.isDirectory ? (
                <Folder size={15} strokeWidth={2.25} className="flex-shrink-0 text-accent" aria-label="Dossier" />
              ) : (
                <File size={15} strokeWidth={2.25} className="flex-shrink-0 text-text-muted" aria-label="Fichier" />
              )}
              <span className="min-w-0 flex-1 truncate" title={entry.name}>
                {entry.name}
              </span>
              <span className="flex-shrink-0 tabular-nums text-text-muted">{formatBytes(entry.size)}</span>
              <span className="w-[92px] flex-shrink-0 text-right text-text-muted">{formatDate(entry.modified)}</span>
            </li>
          ))}
        </ul>
      )}

      {entries.length > COLLAPSED_COUNT && (
        <button type="button" onClick={() => setExpanded(e => !e)} className="btn btn-ghost self-start px-2 py-1 text-[13px]">
          {expanded ? 'Réduire' : `Tout afficher (${entries.length})`}
        </button>
      )}

      {error && <p className="m-0 text-danger">{error}</p>}
    </div>
  );
}
