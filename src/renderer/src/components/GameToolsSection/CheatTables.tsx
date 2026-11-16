import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { CheatTable, CheatTableContent, CheatTableEntry } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

export interface CheatTablesProps {
  gameId: string;
  /** Table ouverte au lancement du jeu (entrée `cheatTableAuto`, vide : aucune). */
  autoTable: string;
  onAutoTableChange: (name: string) => void;
}

const LABEL_CLASS = 'text-[12px] text-text-muted';

/** Une entrée de la table et ses sous-entrées, en retrait. */
function EntryRow({ entry, depth }: { entry: CheatTableEntry; depth: number }) {
  return (
    <>
      <li className="flex items-baseline gap-2 py-0.5" style={{ paddingLeft: depth * 12 }}>
        {entry.kind === 'script' && <FileCode size={12} strokeWidth={2.25} className="flex-shrink-0 translate-y-0.5 text-text-muted" aria-label={t('Script')} />}
        <span className={`min-w-0 flex-1 truncate ${entry.kind === 'group' ? 'font-semibold' : ''}`} title={entry.address ? `${entry.description} — ${entry.address}` : entry.description}>
          {entry.description || t('(sans nom)')}
        </span>
        {entry.value && <span className="flex-shrink-0 font-mono text-[12px] tabular-nums">{entry.value}</span>}
        {entry.type && <span className="flex-shrink-0 text-[11px] text-text-muted">{entry.type}</span>}
      </li>
      {entry.children.map((child, index) => (
        <EntryRow key={index} entry={child} depth={depth + 1} />
      ))}
    </>
  );
}

/** Entrées d'une table, sous sa ligne (repliable ; lecture seule). */
function TableEntries({ content }: { content: CheatTableContent | null | undefined }) {
  const [open, setOpen] = useState(true);
  if (content === undefined) return null;
  if (content === null) return <p className="mb-2 ml-1 text-text-secondary">{t('Table illisible.')}</p>;
  return (
    <div className="mb-2 ml-1">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-text">
        {open ? <ChevronDown size={13} strokeWidth={2.25} /> : <ChevronRight size={13} strokeWidth={2.25} />}
        {t('{n} entrée(s)', { n: content.total })}
        {content.hasLua && <span className="text-text-muted"> · {t('script Lua')}</span>}
      </button>
      {open && content.entries.length > 0 && (
        <ul className="m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-sm bg-bg-deep px-2.5 py-1.5 text-[13px]">
          {content.entries.map((entry, index) => (
            <EntryRow key={index} entry={entry} depth={0} />
          ))}
          {content.truncated && <li className="py-0.5 text-text-muted">{t('… liste coupée, la table en contient davantage.')}</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Page du jeu › Outils (Windows) : tables Cheat Engine du jeu, copiées dans
 * `cheat-tables/` de son dossier de travaux. Une table peut s'ouvrir avec
 * Cheat Engine à la demande, ou à chaque lancement du jeu.
 */
export default function CheatTables({ gameId, autoTable, onAutoTableChange }: CheatTablesProps) {
  const [tables, setTables] = useState<CheatTable[] | null>(null);
  // Entrées de chaque table, par nom (null : illisible).
  const [contents, setContents] = useState<Record<string, CheatTableContent | null>>({});
  // Retour sur DLSGM (après Cheat Engine, qui enregistre la table tout seul) : tout est relu.
  const [focusVersion, setFocusVersion] = useState(0);
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

  useEffect(() => {
    const onFocus = () => {
      setFocusVersion(version => version + 1);
      window.electronAPI.listCheatTables(gameId).then(setTables).catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [gameId]);

  // Dépend du contenu de la liste (nom + date), pas de son identité : relu quand une table change.
  const tablesKey = (tables ?? []).map(table => `${table.name}|${table.modified}`).join('\n');
  useEffect(() => {
    let cancelled = false;
    const names = (tables ?? []).map(table => table.name);
    Promise.all(names.map(name => window.electronAPI.readCheatTable(gameId, name).catch(() => null))).then(results => {
      if (!cancelled) setContents(Object.fromEntries(names.map((name, index) => [name, results[index]])));
    });
    return () => {
      cancelled = true;
    };
    // `tables` est représenté par `tablesKey`.
  }, [gameId, tablesKey, focusVersion]);

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
      <h4 className="section-title m-0 mb-2">{t('Cheat Engine')}</h4>
      {found === false && <p className="mb-1 text-text-secondary">{t('Cheat Engine introuvable (ni dans Program Files, ni dans le dossier choisi dans Paramètres › Lancement).')}</p>}

      {tables !== null && tables.length === 0 && (
        <p className="mb-1 text-text-secondary">{t('Aucune table. Les tables (.CT) ajoutées sont copiées dans cheat-tables/ du dossier de travaux du jeu.')}</p>
      )}
      {tables?.map(table => (
        <div key={table.name}>
        <div className="mb-1 flex items-center gap-2 rounded-sm bg-bg-deep px-2.5 py-1.5">
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
        <TableEntries content={contents[table.name]} />
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
