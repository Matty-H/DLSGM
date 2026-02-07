/**
 * Gère la récupération des données des jeux et le téléchargement des images.
 */

import { scanGames } from './gameScanner.js';
import { loadCache, saveCache } from './cacheManager.js';
import { loadSettings } from './settings.js';

/**
 * Récupère le chemin du dossier de cache des images.
 */
async function getImgCacheDir() {
  const userDataPath = await window.electronAPI.getUserDataPath();
  return await window.electronAPI.pathJoin(userDataPath, 'img_cache');
}

/**
 * Récupère les métadonnées d'un jeu via le script Python.
 */
export async function fetchGameMetadata(gameId) {
  try {
    const settings = await loadSettings();
    const lang = settings.language || 'en_US';

    console.log(`Récupération des métadonnées pour ${gameId}...`);
    const stdout = await window.electronAPI.runPythonScript('fetch_dlsite.py', [gameId, lang]);

    const metadata = JSON.parse(stdout);
    const cache = await loadCache();
    cache[gameId] = metadata;
    await saveCache(cache);

    const imgCacheDir = await getImgCacheDir();
    await window.electronAPI.downloadGameImages(gameId, metadata, imgCacheDir);

    scanGames();
  } catch (error) {
    console.error(`Erreur lors de la récupération des données pour ${gameId}:`, error);
  }
}

/**
 * Purge les jeux obsolètes du cache.
 */
export async function purgeObsoleteGamesFromCache() {
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
export async function resetAndRedownloadImages() {
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
