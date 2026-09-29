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
 * Fusionne `patch` dans l'entrée `gameId`, côté main (lecture-modification-
 * écriture atomique). Sans effet si l'entrée n'existe pas.
 *
 * Il n'existe volontairement plus de "sauvegarde du cache complet" : réécrire
 * tout le cache depuis une copie du renderer effaçait les entrées ajoutées
 * entre-temps par un autre fetch ou une action de l'utilisateur.
 */
export async function updateCacheEntry(gameId: string, patch: Partial<GameCacheEntry>): Promise<boolean> {
  try {
    return await window.electronAPI.updateCacheEntry(gameId, patch);
  } catch (error) {
    console.error(`Erreur lors de la mise à jour du cache pour ${gameId}:`, error);
    return false;
  }
}

/**
 * Remplace entièrement l'entrée `gameId` (nouveau fetch, édition manuelle).
 */
export async function replaceCacheEntry(gameId: string, data: GameCacheEntry): Promise<boolean> {
  try {
    return await window.electronAPI.replaceCacheEntry(gameId, data);
  } catch (error) {
    console.error(`Erreur lors de l'écriture du cache pour ${gameId}:`, error);
    return false;
  }
}

/**
 * Supprime l'entrée `gameId` (ex: avant un nouveau fetch après échec).
 */
export async function deleteCacheEntry(gameId: string): Promise<boolean> {
  try {
    return await window.electronAPI.deleteCacheEntry(gameId);
  } catch (error) {
    console.error(`Erreur lors de la suppression du cache pour ${gameId}:`, error);
    return false;
  }
}
