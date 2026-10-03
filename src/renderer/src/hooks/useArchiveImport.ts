import { useCallback, useEffect, useState } from 'react';
import type { ArchiveImportProgress, ArchiveImportResult } from '../../../shared/ipc-types';
import { ipcErrorMessage } from '../lib/gameTools.js';
import { t } from '../lib/i18n.js';

/** Proposition de mettre à la corbeille les archives des imports réussis. */
export interface ArchiveCleanup {
  importIds: string[];
  /** Résultat une fois la corbeille demandée (null tant que la proposition est ouverte). */
  outcome: { trashed: number; errors: string[] } | null;
  busy: boolean;
}

/** Résultat affiché : `wrongPassword` si le mot de passe saisi n'a pas ouvert l'archive. */
export type ImportResultView = ArchiveImportResult & { wrongPassword?: boolean };

/**
 * Import de jeux depuis leurs archives (sélecteur côté main, extraction dans
 * le dossier de jeux). `onImported` est appelé si au moins un jeu a été
 * ajouté (le parent rescanne la bibliothèque pour le faire apparaître).
 */
export function useArchiveImport(onImported: () => void) {
  const [progress, setProgress] = useState<ArchiveImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ImportResultView[] | null>(null);
  // Archives à mot de passe que l'utilisateur a laissées de côté (retryId) : plus de fenêtre pour elles.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [cleanup, setCleanup] = useState<ArchiveCleanup | null>(null);

  useEffect(() => window.electronAPI.onArchiveImportProgress(setProgress), []);

  const start = useCallback(async () => {
    setRunning(true);
    setResults(null);
    setSkipped(new Set());
    setCleanup(null);
    try {
      const outcome = await window.electronAPI.importGameArchives();
      if (outcome.length > 0) setResults(outcome);
      const importIds = outcome.flatMap(r => (r.importId ? [r.importId] : []));
      if (importIds.length > 0) setCleanup({ importIds, outcome: null, busy: false });
      if (outcome.some(r => r.gameId)) onImported();
    } catch (error) {
      setResults([{ file: t('Import'), error: ipcErrorMessage(error) }]);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [onImported]);

  /** Nouvel essai d'un import refusé faute de mot de passe ; remplace son résultat. */
  const retry = useCallback(async (retryId: string, password: string, remember: boolean) => {
    setRunning(true);
    try {
      let result: ImportResultView;
      try {
        result = await window.electronAPI.retryArchiveImport(retryId, password, remember);
      } catch (error) {
        result = { file: t('Import'), error: ipcErrorMessage(error) };
      }
      // Encore refusée : la fenêtre revient pour cette archive (nouveau retryId), avec l'erreur.
      if (result.retryId) result = { ...result, wrongPassword: true };
      setResults(prev => (prev ?? []).map(r => (r.retryId === retryId ? { ...result, file: r.file } : r)));
      if (result.importId) {
        const importId = result.importId;
        setCleanup(prev => ({ importIds: [...(prev && !prev.outcome ? prev.importIds : []), importId], outcome: null, busy: false }));
      }
      if (result.gameId) onImported();
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

  // Fenêtre de mot de passe : la première archive refusée, hors import en cours et archives laissées de côté.
  const passwordPrompt = running ? null : results?.find(r => r.retryId && !skipped.has(r.retryId)) ?? null;

  return {
    start,
    running,
    progress,
    results,
    dismiss: () => setResults(null),
    retry,
    passwordPrompt,
    skipPassword: (retryId: string) => setSkipped(prev => new Set(prev).add(retryId)),
    askPassword: (retryId: string) => setSkipped(prev => {
      const next = new Set(prev);
      next.delete(retryId);
      return next;
    }),
    cleanup,
    trashArchives,
    dismissCleanup: () => setCleanup(null)
  };
}
