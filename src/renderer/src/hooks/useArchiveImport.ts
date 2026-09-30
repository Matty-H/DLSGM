import { useCallback, useEffect, useState } from 'react';
import type { ArchiveImportProgress, ArchiveImportResult } from '../../../shared/ipc-types';
import { ipcErrorMessage } from '../lib/gameTools.js';

/** Proposition de mettre à la corbeille les archives des imports réussis. */
export interface ArchiveCleanup {
  importIds: string[];
  /** Résultat une fois la corbeille demandée (null tant que la proposition est ouverte). */
  outcome: { trashed: number; errors: string[] } | null;
  busy: boolean;
}

/**
 * Import de jeux depuis leurs archives (sélecteur côté main, extraction dans
 * le dossier de jeux). `onImported` est appelé si au moins un jeu a été
 * ajouté (le parent rescanne la bibliothèque pour le faire apparaître).
 */
export function useArchiveImport(onImported: () => void) {
  const [progress, setProgress] = useState<ArchiveImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ArchiveImportResult[] | null>(null);
  const [cleanup, setCleanup] = useState<ArchiveCleanup | null>(null);

  useEffect(() => window.electronAPI.onArchiveImportProgress(setProgress), []);

  const start = useCallback(async () => {
    setRunning(true);
    setResults(null);
    setCleanup(null);
    try {
      const outcome = await window.electronAPI.importGameArchives();
      if (outcome.length > 0) setResults(outcome);
      const importIds = outcome.flatMap(r => (r.importId ? [r.importId] : []));
      if (importIds.length > 0) setCleanup({ importIds, outcome: null, busy: false });
      if (outcome.some(r => r.gameId)) onImported();
    } catch (error) {
      setResults([{ file: 'Import', error: ipcErrorMessage(error) }]);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [onImported]);

  const trashArchives = useCallback(async () => {
    if (!cleanup || cleanup.busy || cleanup.outcome) return;
    setCleanup({ ...cleanup, busy: true });
    try {
      const outcome = await window.electronAPI.trashImportedArchives(cleanup.importIds);
      setCleanup({ ...cleanup, busy: false, outcome });
    } catch (error) {
      setCleanup({ ...cleanup, busy: false, outcome: { trashed: 0, errors: [ipcErrorMessage(error)] } });
    }
  }, [cleanup]);

  return {
    start,
    running,
    progress,
    results,
    dismiss: () => setResults(null),
    cleanup,
    trashArchives,
    dismissCleanup: () => setCleanup(null)
  };
}
