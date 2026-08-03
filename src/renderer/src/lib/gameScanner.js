/**
 * Scanne le dossier de destination pour détecter les nouveaux jeux.
 *
 * Ce module est volontairement dépourvu de toute manipulation du DOM : il
 * retourne un statut, à charge de l'appelant (le hook useGamesLibrary) de
 * mettre à jour l'interface en conséquence.
 */

import { fetchGameMetadata, retryMissingImages, purgeObsoleteGamesFromCache } from './dataFetcher.js';
import { getGamesFolderPath } from './osHandler.js';
import { loadCache } from './cacheManager.js';

// Nombre de jeux traités en parallèle lors d'un scan : reste économe vis-à-vis
// de DLsite tout en évitant qu'un scan initial ne traite tout en série.
const FETCH_CONCURRENCY = 3;

/**
 * Exécute `worker` sur chaque élément de `items`, avec au plus `limit`
 * exécutions en parallèle.
 */
async function runWithConcurrencyLimit(items, limit, worker) {
  let index = 0;

  async function processNext() {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => processNext()));
}

/**
 * Scanne le dossier des jeux, récupère les métadonnées manquantes et retente
 * les images incomplètes.
 * @returns {Promise<{status: 'no-folder' | 'empty' | 'ok', gameFolders?: string[]}>}
 */
export async function scanGames() {
  const gamesFolderPath = await getGamesFolderPath();
  if (!gamesFolderPath || !(await window.electronAPI.fsExists(gamesFolderPath))) {
    console.error('Le dossier des jeux n\'existe pas');
    return { status: 'no-folder' };
  }

  // Purge les jeux obsolètes du cache
  await purgeObsoleteGamesFromCache();

  // Liste les dossiers correspondant au format DLSite
  const gameFolders = await window.electronAPI.listGameFolders(gamesFolderPath);

  if (gameFolders.length === 0) {
    return { status: 'empty' };
  }

  const cache = await loadCache();

  // Nouveaux jeux : récupération des métadonnées.
  const gamesToFetch = gameFolders.filter(gameId => !cache[gameId]);
  // Jeux déjà en cache mais dont le téléchargement d'images est incomplet :
  // on retente uniquement les images, sans jamais toucher aux métadonnées.
  const gamesNeedingImages = gameFolders.filter(gameId => cache[gameId] && cache[gameId].imagesComplete === false);

  await runWithConcurrencyLimit(gamesToFetch, FETCH_CONCURRENCY, fetchGameMetadata);
  await runWithConcurrencyLimit(gamesNeedingImages, FETCH_CONCURRENCY, retryMissingImages);

  return { status: 'ok', gameFolders };
}
