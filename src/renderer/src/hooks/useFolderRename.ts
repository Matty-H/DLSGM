import { useCallback, useEffect, useState } from 'react';
import type { FolderRenameResult, MisnamedFolder } from '../../../shared/ipc-types';
import { ipcErrorMessage } from '../lib/gameTools.js';

/**
 * Assistant de renommage : dossiers du dossier de jeux qui contiennent un ID
 * sans porter exactement ce nom (invisibles pour la bibliothèque). Cherchés
 * à chaque scan (`scanKey` change) ; « Ignorer » les masque jusqu'au
 * prochain lancement de DLSGM. Rien n'est renommé sans confirmation.
 */
export function useFolderRename(scanKey: string, onRenamed: () => void) {
  const [folders, setFolders] = useState<MisnamedFolder[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FolderRenameResult[] | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI.findMisnamedFolders().then(setFolders).catch(() => setFolders([]));
  }, []);

  useEffect(refresh, [refresh, scanKey]);

  const rename = useCallback(async (selected: string[]) => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const outcome = await window.electronAPI.renameMisnamedFolders(selected);
      setResults(outcome);
      if (outcome.some(r => r.gameId)) onRenamed();
    } catch (error) {
      setResults([{ folder: 'Renommage', error: ipcErrorMessage(error) }]);
    } finally {
      setBusy(false);
      refresh();
    }
  }, [onRenamed, refresh]);

  return {
    folders: dismissed ? [] : folders,
    busy,
    results,
    rename,
    dismiss: () => {
      setDismissed(true);
      setResults(null);
    },
    dismissResults: () => setResults(null)
  };
}
