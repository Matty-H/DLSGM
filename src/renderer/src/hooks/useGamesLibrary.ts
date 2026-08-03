import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCache, saveCache } from '../lib/cacheManager.js';
import { scanGames } from '../lib/gameScanner.js';
import { launchGame as launchGameIpc } from '../lib/osHandler.js';

export type LibraryStatus = 'loading' | 'no-folder' | 'empty' | 'ok';

/**
 * Source de vérité de la bibliothèque de jeux : cache des métadonnées,
 * dossiers détectés, jeux en cours d'exécution, et mutations (note, tags,
 * édition manuelle, lancement). Le scan (fetch DLsite + images) est délégué
 * à lib/gameScanner.js, qui ne touche plus au DOM.
 */
export function useGamesLibrary() {
  const [cache, setCache] = useState<Record<string, any>>({});
  const [gameFolders, setGameFolders] = useState<string[]>([]);
  const [status, setStatus] = useState<LibraryStatus>('loading');
  const [runningGames, setRunningGames] = useState<Set<string>>(new Set());
  const [userDataPath, setUserDataPath] = useState<string>('');
  const scanningRef = useRef(false);

  useEffect(() => {
    window.electronAPI.getUserDataPath().then((p: string) => setUserDataPath(p.replace(/\\/g, '/')));
  }, []);

  const reloadCache = useCallback(async () => {
    const c = await loadCache();
    setCache(c);
    return c;
  }, []);

  const rescan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    try {
      const result = await scanGames();
      if (result.status === 'ok') {
        setGameFolders(result.gameFolders ?? []);
        await reloadCache();
        setStatus('ok');
      } else {
        setGameFolders([]);
        setStatus(result.status);
      }
    } finally {
      scanningRef.current = false;
    }
  }, [reloadCache]);

  useEffect(() => {
    rescan();
    // Volontairement exécuté une seule fois au montage : les scans suivants
    // sont déclenchés explicitement (bouton reset, sauvegarde des paramètres).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAnyGameRunning = runningGames.size > 0;

  const launch = useCallback(
    async (gameId: string) => {
      setRunningGames(prev => new Set(prev).add(gameId));
      try {
        await launchGameIpc(gameId);
      } catch {
        // déjà notifié à l'utilisateur (alert) dans osHandler.launchGame
      } finally {
        setRunningGames(prev => {
          const next = new Set(prev);
          next.delete(gameId);
          return next;
        });
        await reloadCache();
      }
    },
    [reloadCache]
  );

  /** Fusionne `patch` dans l'entrée `gameId` du cache et persiste le résultat. */
  const updateGame = useCallback((gameId: string, patch: Record<string, any>) => {
    setCache(prev => {
      const next = { ...prev, [gameId]: { ...prev[gameId], ...patch } };
      saveCache(next);
      return next;
    });
  }, []);

  /** Remplace entièrement une entrée (édition manuelle) et persiste le résultat. */
  const replaceGame = useCallback((gameId: string, data: Record<string, any>) => {
    setCache(prev => {
      const next = { ...prev, [gameId]: data };
      saveCache(next);
      return next;
    });
  }, []);

  /** Supprime une entrée du cache (ex: "Réessayer" sur un échec de fetch) et persiste. */
  const removeGame = useCallback((gameId: string) => {
    setCache(prev => {
      const next = { ...prev };
      delete next[gameId];
      saveCache(next);
      return next;
    });
  }, []);

  /** Chemin `atom://` de l'image de couverture d'un jeu (construit localement pour éviter un aller-retour IPC par carte). */
  const getWorkImageSrc = useCallback(
    (gameId: string) => `atom:///${userDataPath}/img_cache/${gameId}/work_image.jpg`,
    [userDataPath]
  );

  /** Chemin `atom://` d'une image d'échantillon (1-indexée, comme dans le cache). */
  const getSampleImageSrc = useCallback(
    (gameId: string, index: number) => `atom:///${userDataPath}/img_cache/${gameId}/sample_${index}.jpg`,
    [userDataPath]
  );

  return {
    cache,
    gameFolders,
    status,
    runningGames,
    isAnyGameRunning,
    userDataPath,
    rescan,
    reloadCache,
    launch,
    updateGame,
    replaceGame,
    removeGame,
    getWorkImageSrc,
    getSampleImageSrc
  };
}
