/**
 * Gère le cache des jeux en communiquant avec le processus principal.
 */

// Le cache est désormais géré par le store dans le processus principal.

/**
 * Charge le cache depuis le stockage persistant.
 */
export async function loadCache() {
  try {
    return await window.electronAPI.getCache();
  } catch (error) {
    console.error('Erreur lors du chargement du cache:', error);
    return {};
  }
}

/**
 * Sauvegarde le cache vers le stockage persistant.
 */
export async function saveCache(cacheData) {
  try {
    return await window.electronAPI.saveCache(cacheData);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du cache:', error);
    return false;
  }
}

/**
 * Met à jour une entrée spécifique dans le cache.
 * @param {Object} cache Le cache actuel.
 * @param {string} gameId L'identifiant du jeu.
 * @param {Object} newData Les nouvelles données à fusionner.
 */
export async function updateCacheEntry(cache, gameId, newData) {
  cache[gameId] = {
    ...(cache[gameId] || {}),
    ...newData
  };

  return await saveCache(cache);
}
