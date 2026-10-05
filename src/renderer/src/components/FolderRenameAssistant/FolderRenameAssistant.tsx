import { useEffect, useState } from 'react';
import { CircleCheck, FolderPen, TriangleAlert, X } from 'lucide-react';
import type { FolderRenameResult, MisnamedFolder } from '../../../../shared/ipc-types';
import { releaseLabel } from '../../lib/releaseInfo.js';
import { misnamedPath } from '../../lib/libraryFolders.js';
import { t } from '../../lib/i18n.js';

export interface FolderRenameAssistantProps {
  folders: MisnamedFolder[];
  results: FolderRenameResult[] | null;
  busy: boolean;
  onRename: (folders: string[]) => void;
  onDismiss: () => void;
  onDismissResults: () => void;
}

const conflictLabel = (conflict: NonNullable<MisnamedFolder['conflict']>) =>
  conflict === 'exists' ? t('un dossier porte déjà cet ID') : t('plusieurs dossiers pour cet ID');

/**
 * Bandeau de la bibliothèque : dossiers qui contiennent un ID sans être
 * nommés exactement d'après lui, cochés par défaut (sauf conflit), renommés
 * en un clic. Les conflits sont montrés mais jamais renommés.
 */
export default function FolderRenameAssistant({ folders, results, busy, onRename, onDismiss, onDismissResults }: FolderRenameAssistantProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const renamable = folders.filter(f => !f.conflict);

  // Nouvelle liste (après un scan ou un renommage) : tout ce qui est renommable est coché.
  useEffect(() => {
    setSelected(new Set(folders.filter(f => !f.conflict).map(misnamedPath)));
  }, [folders]);

  if (folders.length === 0 && !results) return null;

  const toggle = (folder: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  return (
    <div className="panel animate-steam-in mx-6 mb-3 flex flex-shrink-0 flex-col gap-2 px-5 py-3 text-[13px]">
      <div className="flex items-start gap-3">
        <FolderPen size={16} strokeWidth={2.25} className="mt-px flex-shrink-0 text-accent" />
        <p className="m-0 min-w-0 flex-1">
          {folders.length > 0 ? (
            <>
              {folders.length > 1
                ? t("{n} dossiers contiennent un ID DLsite sans être nommés exactement d'après lui : la bibliothèque ne les voit pas. Renommer ?", { n: folders.length })
                : t("1 dossier contient un ID DLsite sans être nommé exactement d'après lui : la bibliothèque ne le voit pas. Renommer ?")}
              <span className="block text-text-secondary">{t("L'ancien nom (version, DLC) reste visible sur la page du jeu. Un dossier existant n'est jamais écrasé.")}</span>
            </>
          ) : (
            t('Renommage terminé.')
          )}
        </p>
        <button type="button" onClick={onDismiss} aria-label={t("Ignorer jusqu'au prochain lancement")} title={t("Ignorer jusqu'au prochain lancement")} className="btn btn-ghost btn-icon flex-shrink-0">
          <X size={16} strokeWidth={2.25} />
        </button>
      </div>

      {folders.length > 0 && (
        <ul className="m-0 flex max-h-[220px] list-none flex-col gap-1 overflow-y-auto p-0 pl-7">
          {folders.map(folder => (
            <li key={misnamedPath(folder)}>
              <label className={`flex items-center gap-2 ${folder.conflict ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={Boolean(folder.conflict) || busy}
                  checked={selected.has(misnamedPath(folder))}
                  onChange={() => toggle(misnamedPath(folder))}
                />
                <span className="min-w-0 truncate" title={misnamedPath(folder)}>{folder.folder}</span>
                <span className="flex-shrink-0 text-text-secondary">→</span>
                <span className="flex-shrink-0 font-mono font-semibold">{folder.gameId}</span>
                {releaseLabel(folder) && <span className="flex-shrink-0 text-text-secondary">({releaseLabel(folder)})</span>}
                {folder.conflict && <span className="flex-shrink-0 text-danger">— {conflictLabel(folder.conflict)}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {results && results.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-7">
          {results.map(result => (
            <li key={result.folder} className="flex items-start gap-2">
              {result.gameId ? (
                <CircleCheck size={14} strokeWidth={2.25} className="mt-0.5 flex-shrink-0 text-play" />
              ) : (
                <TriangleAlert size={14} strokeWidth={2.25} className="mt-0.5 flex-shrink-0 text-danger" />
              )}
              <span className="min-w-0">
                {result.folder} {result.gameId ? `→ ${result.gameId}` : <span className="text-text-secondary">: {result.error}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pl-7">
        {renamable.length > 0 && (
          <button type="button" onClick={() => onRename([...selected])} disabled={busy || selected.size === 0} className="btn btn-primary py-1 text-[12px]">
            {busy ? t('Renommage…') : t('Renommer ({n})', { n: selected.size })}
          </button>
        )}
        {results && (
          <button type="button" onClick={onDismissResults} className="btn btn-ghost py-1 text-[12px]">
            {t('Fermer le bilan')}
          </button>
        )}
      </div>
    </div>
  );
}
