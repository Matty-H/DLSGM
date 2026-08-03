import { loadCache, saveCache } from './cacheManager.js';
import { loadSettings } from './settings.js';
import type { GameCacheEntry } from './cacheManager.js';

/**
 * Gère la récupération des données des jeux et le téléchargement des images.
 */

/**
 * Récupère le chemin du dossier de cache des images.
 */
async function getImgCacheDir(): Promise<string> {
  const userDataPath = await window.electronAPI.getUserDataPath();
  return await window.electronAPI.pathJoin(userDataPath, 'img_cache');
}

/**
 * Récupère les métadonnées d'un jeu via un fetch Node direct vers DLsite.
 */
export async function fetchGameMetadata(gameId: string): Promise<void> {
  try {
    const settings = await loadSettings();
    const lang = settings.language || 'en_US';

    console.log(`Récupération des métadonnées pour ${gameId}...`);
    const data = await window.electronAPI.fetchGameMetadata(gameId, lang) as GameCacheEntry;
    const cache = await loadCache();
    const existingEntry = cache[gameId];

    // Ajouter la date d'ajout si elle n'existe pas déjà
    if (!data.addedDate) {
      data.addedDate = existingEntry?.addedDate || new Date().toISOString();
    }

    cache[gameId] = data;
    await saveCache(cache);

    const imgCacheDir = await getImgCacheDir();
    const imagesComplete = await window.electronAPI.downloadGameImages(gameId, data, imgCacheDir);

    // On relit le cache avant de fusionner le statut des images : il a pu être
    // modifié entre-temps (rating, tags...) pendant le téléchargement.
    const cacheAfterDownload = await loadCache();
    cacheAfterDownload[gameId] = { ...cacheAfterDownload[gameId], imagesComplete };
    await saveCache(cacheAfterDownload);
  } catch (error) {
    console.error(`Erreur lors de la récupération des données pour ${gameId}:`, error);
    // En cas d'échec du fetch (réseau, œuvre introuvable...), on marque aussi comme échoué temporairement
    const cache = await loadCache();
    const existingEntry = cache[gameId];
    if (existingEntry && !existingEntry.fetchFailed) {
      console.warn(`Fiche existante conservée pour ${gameId} malgré l'erreur.`);
      return;
    }
    cache[gameId] = {
      work_name: gameId,
      error: (error as Error).message,
      fetchFailed: true,
      lastFetchAttempt: new Date().toISOString()
    } as GameCacheEntry;
    await saveCache(cache);
  }
}

/**
 * Retente le téléchargement des images manquantes d'un jeu déjà en cache,
 * sans jamais refaire de fetch réseau des métadonnées ni les modifier.
 */
export async function retryMissingImages(gameId: string): Promise<void> {
  const cache = await loadCache();
  const metadata = cache[gameId];
  if (!metadata || metadata.fetchFailed || metadata.imagesComplete) return;

  const imgCacheDir = await getImgCacheDir();
  const imagesComplete = await window.electronAPI.downloadGameImages(gameId, metadata, imgCacheDir);

  const refreshedCache = await loadCache();
  if (!refreshedCache[gameId]) return;
  refreshedCache[gameId] = { ...refreshedCache[gameId], imagesComplete };
  await saveCache(refreshedCache);
}

/**
 * Purge les jeux obsolètes du cache.
 */
export async function purgeObsoleteGamesFromCache(): Promise<void> {
  console.log('--- DÉBUT DE LA PURGE DES DONNÉES ---');

  const settings = await loadSettings();
  const gamesFolder = settings.destinationFolder;

  if (!gamesFolder || !(await window.electronAPI.fsExists(gamesFolder))) {
    console.error('Dossier de jeux non configuré ou inexistant.');
    return;
  }

  const gameFolders = await window.electronAPI.listGameFolders(gamesFolder);
  const gameIdsToKeep = new Set(gameFolders);
  const cache = await loadCache();
  const cachedGameIds = Object.keys(cache);

  let cacheChanged = false;
  cachedGameIds.forEach(gameId => {
    if (!gameIdsToKeep.has(gameId)) {
      console.log(`Purge de l'entrée cache : ${gameId}`);
      delete cache[gameId];
      cacheChanged = true;
    }
  });

  if (cacheChanged) {
    await saveCache(cache);
  }

  const imgCacheDir = await getImgCacheDir();
  if (await window.electronAPI.fsExists(imgCacheDir)) {
    const imgFolders = await window.electronAPI.fsReaddir(imgCacheDir);
    for (const folderName of imgFolders) {
      if (!gameIdsToKeep.has(folderName) && !cache[folderName]) {
        const folderPath = await window.electronAPI.pathJoin(imgCacheDir, folderName);
        await window.electronAPI.fsRm(folderPath);
        console.log(`Dossier image supprimé : ${folderName}`);
      }
    }
  }

  console.log('--- FIN DE LA PURGE DES DONNÉES ---');
}

/**
 * Réinitialise et re-télécharge toutes les images.
 */
export async function resetAndRedownloadImages(): Promise<void> {
  console.log('--- DÉBUT DU RESET DES IMAGES ---');

  const imgCacheDir = await getImgCacheDir();

  if (await window.electronAPI.fsExists(imgCacheDir)) {
    await window.electronAPI.fsRm(imgCacheDir);
  }
  await window.electronAPI.fsMkdir(imgCacheDir);

  const cache = await loadCache();
  const gameIds = Object.keys(cache);

  for (const gameId of gameIds) {
    const metadata = cache[gameId];
    if (metadata) {
      await window.electronAPI.downloadGameImages(gameId, metadata, imgCacheDir);
      console.log(`Images re-téléchargées pour ${gameId}`);
    }
  }

  console.log('--- FIN DU RESET DES IMAGES ---');
}
