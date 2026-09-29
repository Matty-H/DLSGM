import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCache, updateCacheEntry, replaceCacheEntry, deleteCacheEntry } from '../lib/cacheManager.js';
import { scanGames } from '../lib/gameScanner.js';
import { launchGame as launchGameIpc, chooseGameExecutable } from '../lib/osHandler.js';

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
  const scanningRef = useRef(false);
  // Scan demandé pendant un scan (ex: jeu reçu en réseau local) : relancé à
  // la fin du scan en cours au lieu d'être ignoré.
  const rescanPendingRef = useRef(false);

  const reloadCache = useCallback(async () => {
    const c = await loadCache();
    setCache(c);
    return c;
  }, []);

  const rescan = useCallback(async () => {
    if (scanningRef.current) {
      rescanPendingRef.current = true;
      return;
    }
    scanningRef.current = true;
    try {
      do {
        rescanPendingRef.current = false;
        const result = await scanGames();
        if (result.status === 'ok') {
          setGameFolders(result.gameFolders ?? []);
          await reloadCache();
          setStatus('ok');
        } else {
          setGameFolders([]);
          setStatus(result.status);
        }
      } while (rescanPendingRef.current);
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
        // Le temps de jeu a été enregistré par le main à la fermeture du jeu.
        await reloadCache();
      }
    },
    [reloadCache]
  );

  // Les mutations mettent à jour l'état React de façon optimiste, puis
  // n'envoient au main que l'entrée concernée — jamais le cache complet, dont
  // la copie React peut être périmée (ex: pendant un scan, avant reloadCache).

  /** Fusionne `patch` dans l'entrée `gameId` du cache et persiste le résultat. */
  const updateGame = useCallback((gameId: string, patch: Record<string, any>) => {
    setCache(prev => ({ ...prev, [gameId]: { ...prev[gameId], ...patch } }));
    updateCacheEntry(gameId, patch);
  }, []);

  /** Remplace entièrement une entrée (édition manuelle) et persiste le résultat. */
  const replaceGame = useCallback((gameId: string, data: Record<string, any>) => {
    setCache(prev => ({ ...prev, [gameId]: data }));
    replaceCacheEntry(gameId, data as any);
  }, []);

  /** Supprime une entrée du cache (ex: "Réessayer" sur un échec de fetch) et persiste. */
  const removeGame = useCallback(async (gameId: string) => {
    setCache(prev => {
      const next = { ...prev };
      delete next[gameId];
      return next;
    });
    await deleteCacheEntry(gameId);
  }, []);

  /** Choisit (et mémorise côté main) l'exécutable à lancer pour ce jeu. */
  const chooseExecutable = useCallback(async (gameId: string) => {
    const executablePath = await chooseGameExecutable(gameId);
    if (executablePath) {
      setCache(prev => ({ ...prev, [gameId]: { ...prev[gameId], executablePath } }));
    }
  }, []);

  // `?v=` : change quand les images d'un jeu sont modifiées à la main
  // (imagesVersion), sinon Chromium réaffiche l'ancienne image depuis son
  // cache mémoire, l'URL étant identique. Ignoré par le protocole atom://.
  const imageVersionQuery = useCallback(
    (gameId: string) => (cache[gameId]?.imagesVersion ? `?v=${cache[gameId].imagesVersion}` : ''),
    [cache]
  );

  /** URL `atom://` de la couverture d'un jeu, servie par main depuis le cache d'images. */
  const getWorkImageSrc = useCallback(
    (gameId: string) => `atom://img/${gameId}/work_image.jpg${imageVersionQuery(gameId)}`,
    [imageVersionQuery]
  );

  /** URL `atom://` d'une image d'échantillon (1-indexée, comme dans le cache). */
  const getSampleImageSrc = useCallback(
    (gameId: string, index: number) => `atom://img/${gameId}/sample_${index}.jpg${imageVersionQuery(gameId)}`,
    [imageVersionQuery]
  );

  return {
    cache,
    gameFolders,
    status,
    runningGames,
    isAnyGameRunning,
    rescan,
    reloadCache,
    launch,
    updateGame,
    replaceGame,
    removeGame,
    chooseExecutable,
    getWorkImageSrc,
    getSampleImageSrc
  };
}
