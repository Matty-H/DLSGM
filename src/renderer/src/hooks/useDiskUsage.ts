import { useCallback, useEffect, useState } from 'react';
import type { DiskUsageReport } from '../lib/diskUsage.js';

/**
 * Tailles des jeux présents : celles en cache tout de suite, les autres au
 * fil du calcul en tâche de fond (main, un jeu à la fois). `gameIds` change
 * après un scan : les nouveaux jeux sont mesurés.
 */
export function useDiskUsage(gameIds: string[]) {
  const [report, setReport] = useState<DiskUsageReport | null>(null);
  const key = gameIds.join('|');

  const load = useCallback(
    (force = false) => {
      if (gameIds.length === 0) return;
      window.electronAPI.getDiskUsage(gameIds, force).then(setReport).catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  useEffect(() => load(), [load]);

  useEffect(
    () =>
      window.electronAPI.onDiskUsageChanged((gameId, usage, pending) =>
        setReport(prev => (prev ? { ...prev, games: { ...prev.games, [gameId]: usage }, pending } : prev))
      ),
    []
  );

  return { report, recompute: () => load(true) };
}
