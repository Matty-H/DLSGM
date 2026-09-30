import { useEffect, useState } from 'react';
import {
  BACKUP_REASON_LABELS,
  createSaveBackup,
  deleteSaveBackup,
  formatBytes,
  ipcErrorMessage,
  listSaveBackups,
  restoreSaveBackup,
  type SaveBackup
} from '../../lib/gameTools.js';

export interface SaveBackupsProps {
  gameId: string;
  /** Change à chaque fin de session : la copie automatique vient peut-être d'être faite. */
  lastPlayed?: string;
}

const COLLAPSED_COUNT = 4;

/**
 * Copies des sauvegardes d'un jeu (faites à chaque fermeture du jeu si
 * l'option est active, ou à la demande) : liste, restauration, suppression.
 */
export default function SaveBackups({ gameId, lastPlayed }: SaveBackupsProps) {
  const [backups, setBackups] = useState<SaveBackup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSaveBackups(gameId)
      .then(result => !cancelled && setBackups(result))
      .catch(err => !cancelled && setMessage({ text: ipcErrorMessage(err), isError: true }));
    return () => {
      cancelled = true;
    };
  }, [gameId, lastPlayed]);

  const run = async (label: string, action: () => Promise<string | null>) => {
    setBusy(label);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ text, isError: false });
      setBackups(await listSaveBackups(gameId));
    } catch (err) {
      setMessage({ text: ipcErrorMessage(err), isError: true });
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = () =>
    run('create', async () => ((await createSaveBackup(gameId)) ? 'Sauvegardes copiées.' : 'Aucun fichier de sauvegarde à copier pour le moment.'));

  const handleRestore = (backup: SaveBackup) => {
    const confirmed = window.confirm(
      `Remplacer les sauvegardes actuelles par la copie du ${formatDate(backup.createdAt)} ? L'état actuel est d'abord copié (« Avant restauration »), la restauration peut donc être annulée.`
    );
    if (!confirmed) return;
    run(`restore-${backup.id}`, async () => {
      const { skipped } = await restoreSaveBackup(gameId, backup.id);
      return skipped.length > 0
        ? `Restauré, sauf : ${skipped.join(', ')} (emplacement introuvable aujourd'hui).`
        : 'Sauvegardes restaurées.';
    });
  };

  const handleDelete = (backup: SaveBackup) => {
    if (!window.confirm(`Supprimer définitivement la copie du ${formatDate(backup.createdAt)} ?`)) return;
    run(`delete-${backup.id}`, async () => {
      await deleteSaveBackup(gameId, backup.id);
      return null;
    });
  };

  const visible = backups && !expanded ? backups.slice(0, COLLAPSED_COUNT) : backups ?? [];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[12px] text-text-muted">Copies des sauvegardes</div>
        <button type="button" disabled={busy !== null} onClick={handleCreate} className="btn btn-ghost px-2 py-1 text-[13px]">
          {busy === 'create' ? 'Copie…' : 'Copier maintenant'}
        </button>
      </div>

      {backups && backups.length === 0 && (
        <p className="text-text-secondary">Aucune copie. Une copie est faite automatiquement à chaque fermeture du jeu.</p>
      )}

      {visible.map(backup => (
        <div key={backup.id} className="mb-1 flex items-center gap-2 rounded-sm bg-bg-deep px-2.5 py-1.5">
          <div className="min-w-0 flex-1" title={backup.locations.join(', ')}>
            <div className="truncate">{formatDate(backup.createdAt)}</div>
            <div className="truncate text-[12px] text-text-muted">
              {BACKUP_REASON_LABELS[backup.reason]} · {backup.fileCount} fichier{backup.fileCount > 1 ? 's' : ''} · {formatBytes(backup.totalBytes)}
            </div>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => handleRestore(backup)} className="btn btn-ghost flex-shrink-0 px-2 py-1 text-[13px]">
            {busy === `restore-${backup.id}` ? 'Restauration…' : 'Restaurer'}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => handleDelete(backup)} className="btn btn-ghost flex-shrink-0 px-2 py-1 text-[13px]">
            Supprimer
          </button>
        </div>
      ))}

      {backups && backups.length > COLLAPSED_COUNT && (
        <button type="button" onClick={() => setExpanded(e => !e)} className="btn btn-ghost px-2 py-1 text-[13px]">
          {expanded ? 'Réduire' : `Tout afficher (${backups.length})`}
        </button>
      )}

      {message && <p className={`mt-1 ${message.isError ? 'text-danger' : 'text-text-secondary'}`}>{message.text}</p>}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}
