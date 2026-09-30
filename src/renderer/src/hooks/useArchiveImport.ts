import { useCallback, useEffect, useState } from 'react';
import type { ArchiveImportProgress, ArchiveImportResult } from '../../../shared/ipc-types';
import { ipcErrorMessage } from '../lib/gameTools.js';

/**
 * Import de jeux depuis leurs archives (sélecteur côté main, extraction dans
 * le dossier de jeux). `onImported` est appelé si au moins un jeu a été
 * ajouté (le parent rescanne la bibliothèque pour le faire apparaître).
 */
export function useArchiveImport(onImported: () => void) {
  const [progress, setProgress] = useState<ArchiveImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ArchiveImportResult[] | null>(null);

  useEffect(() => window.electronAPI.onArchiveImportProgress(setProgress), []);

  const start = useCallback(async () => {
    setRunning(true);
    setResults(null);
    try {
      const outcome = await window.electronAPI.importGameArchives();
      if (outcome.length > 0) setResults(outcome);
      if (outcome.some(r => r.gameId)) onImported();
    } catch (error) {
      setResults([{ file: 'Import', error: ipcErrorMessage(error) }]);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [onImported]);

  return { start, running, progress, results, dismiss: () => setResults(null) };
}
