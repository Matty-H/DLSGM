import type { GameMetadata } from '../../../shared/ipc-types';

/**
 * Gère le cache des jeux en communiquant avec le processus principal.
 */

export type GameCacheEntry = GameMetadata & Record<string, unknown>;
export type GameCache = Record<string, GameCacheEntry>;

// Le cache est désormais géré par le store dans le processus principal.

/**
 * Charge le cache depuis le stockage persistant.
 */
export async function loadCache(): Promise<GameCache> {
  try {
    return await window.electronAPI.getCache() as GameCache;
  } catch (error) {
    console.error('Erreur lors du chargement du cache:', error);
    return {};
  }
}

/**
 * Sauvegarde le cache vers le stockage persistant.
 */
export async function saveCache(cacheData: GameCache): Promise<boolean> {
  try {
    return await window.electronAPI.saveCache(cacheData);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du cache:', error);
    return false;
  }
}

/**
 * Met à jour une entrée spécifique dans le cache.
 */
export async function updateCacheEntry(cache: GameCache, gameId: string, newData: Partial<GameCacheEntry>): Promise<boolean> {
  cache[gameId] = {
    ...(cache[gameId] || {}),
    ...newData
  } as GameCacheEntry;

  return await saveCache(cache);
}
