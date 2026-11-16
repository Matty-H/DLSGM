import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { CheatTable } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

export interface CheatTablesProps {
  gameId: string;
  /** Table ouverte au lancement du jeu (entrée `cheatTableAuto`, vide : aucune). */
  autoTable: string;
  onAutoTableChange: (name: string) => void;
}

const LABEL_CLASS = 'text-[12px] text-text-muted';

/**
 * Page du jeu › Outils (Windows) : tables Cheat Engine du jeu, copiées dans
 * `cheat-tables/` de son dossier de travaux. Une table peut s'ouvrir avec
 * Cheat Engine à la demande, ou à chaque lancement du jeu.
 */
export default function CheatTables({ gameId, autoTable, onAutoTableChange }: CheatTablesProps) {
  const [tables, setTables] = useState<CheatTable[] | null>(null);
  const [found, setFound] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTables(null);
    setMessage(null);
    setError(null);
    window.electronAPI
      .listCheatTables(gameId)
      .then(list => !cancelled && setTables(list))
      .catch(err => !cancelled && setError(ipcErrorMessage(err)));
    window.electronAPI
      .checkCheatEngine()
      .then(exe => !cancelled && setFound(exe !== null))
      .catch(() => !cancelled && setFound(false));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const attempt = async (action: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const importTables = () =>
    attempt(async () => {
      const result = await window.electronAPI.importCheatTables(gameId);
      if (!result) return;
      setTables(result.tables);
      const parts: string[] = [];
      if (result.imported.length > 0) parts.push(t('{n} table(s) ajoutée(s).', { n: result.imported.length }));
      if (result.skipped.length > 0) parts.push(t('{n} fichier(s) ignoré(s) (pas une table .CT) : {names}', { n: result.skipped.length, names: result.skipped.join(', ') }));
      setMessage(parts.join(' '));
    });

  const deleteTable = (name: string) => {
    if (!window.confirm(t('Mettre la table « {name} » à la corbeille ?', { name }))) return;
    attempt(async () => {
      setTables(await window.electronAPI.deleteCheatTable(gameId, name));
      if (autoTable === name) onAutoTableChange('');
    });
  };

  const autoMissing = Boolean(autoTable) && tables !== null && !tables.some(table => table.name === autoTable);

  return (
    <div>
      <div className={`${LABEL_CLASS} mb-1`}>{t('Cheat Engine')}</div>
      {found === false && <p className="mb-1 text-text-secondary">{t('Cheat Engine introuvable (ni dans Program Files, ni dans le dossier choisi dans Paramètres › Lancement).')}</p>}

      {tables !== null && tables.length === 0 && (
        <p className="mb-1 text-text-secondary">{t('Aucune table. Les tables (.CT) ajoutées sont copiées dans cheat-tables/ du dossier de travaux du jeu.')}</p>
      )}
      {tables?.map(table => (
        <div key={table.name} className="mb-1 flex items-center gap-2 rounded-sm bg-bg-deep px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate" title={table.name}>
            {table.name}
          </span>
          <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 text-text-secondary" title={t('Ouvrir cette table avec Cheat Engine à chaque lancement du jeu')}>
            <input type="checkbox" checked={autoTable === table.name} onChange={e => onAutoTableChange(e.target.checked ? table.name : '')} />
            {t('Au lancement')}
          </label>
          <button type="button" disabled={found !== true} onClick={() => attempt(() => window.electronAPI.openCheatTable(gameId, table.name))} className="btn btn-ghost flex-shrink-0 px-2 py-1 text-[13px]">
            {t('Ouvrir')}
          </button>
          <button type="button" onClick={() => deleteTable(table.name)} className="btn btn-ghost flex-shrink-0 px-2 py-1 text-[13px]" aria-label={t('Supprimer')} title={t('Supprimer')}>
            <Trash2 size={14} strokeWidth={2.25} />
          </button>
        </div>
      ))}
      {autoMissing && (
        <p className="mb-1 text-danger">{t('La table « {name} » ouverte au lancement a disparu : le jeu ne pourra pas être lancé.', { name: autoTable })}</p>
      )}
      {autoTable && found === false && (
        <p className="mb-1 text-danger">{t('Une table est ouverte au lancement mais Cheat Engine est introuvable : le jeu ne pourra pas être lancé.')}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={importTables} className="btn text-[13px]">
          <Plus size={14} strokeWidth={2.25} />
          {t('Ajouter des tables…')}
        </button>
        <button type="button" disabled={found !== true} onClick={() => attempt(() => window.electronAPI.openCheatTable(gameId, null))} className="btn btn-ghost text-[13px]">
          {t('Ouvrir Cheat Engine')}
        </button>
        <button type="button" onClick={() => attempt(() => window.electronAPI.openCheatTablesFolder(gameId))} className="btn btn-ghost text-[13px]" title={t('Ouvrir le dossier des tables')}>
          <FolderOpen size={14} strokeWidth={2.25} />
          {t('Dossier')}
        </button>
      </div>
      {tables !== null && tables.length > 0 && (
        <p className="mt-1 text-text-muted">
          {t("Une table ouverte d'ici s'attache au jeu et s'enregistre toute seule à chaque changement (réponds « Yes » quand Cheat Engine demande d'exécuter le script Lua). Pendant une partie, l'overlay a le même bouton.")}
        </p>
      )}
      {message && <p className="mt-1 text-text-secondary">{message}</p>}
      {error && <p className="mt-1 text-danger">{error}</p>}
    </div>
  );
}
