/**
 * Gère les interactions avec le système d'exploitation (fichiers, lancements, etc.)
 * via les API exposées par le processus principal.
 *
 * L'état "jeu en cours d'exécution" et le rafraîchissement de l'interface ne
 * sont plus gérés ici : c'est la responsabilité du hook React qui utilise ces
 * fonctions (useGamesLibrary) de les orchestrer autour de l'appel IPC.
 */

import { loadCache, updateCacheEntry } from './cacheManager.js';
import { loadSettings } from './settings.js';

/**
 * Récupère le chemin du dossier des jeux depuis les paramètres.
 */
export async function getGamesFolderPath() {
  const settings = await loadSettings();
  return settings.destinationFolder || null;
}

/**
 * Ouvre le dossier d'un jeu dans l'explorateur de fichiers.
 */
export async function openGameFolder(gameId) {
  try {
    const gamesDirPath = await getGamesFolderPath();
    if (!gamesDirPath) {
      throw new Error('Dossier de jeux non configuré');
    }

    const targetFolderPath = await window.electronAPI.pathJoin(gamesDirPath, gameId);
    const success = await window.electronAPI.openPath(targetFolderPath);

    if (!success) {
      throw new Error('Impossible d\'ouvrir le dossier');
    }
  } catch (error) {
    alert(error.message);
    console.error('Erreur lors de l\'ouverture du dossier:', error);
  }
}

/**
 * Lance un jeu et enregistre le temps de jeu réel de la session.
 */
export async function launchGame(gameId) {
  try {
    const result = await window.electronAPI.launchGame(gameId);

    if (result.success) {
      await updateGameTime(gameId, result.duration || 0);
    }

    return result;
  } catch (error) {
    alert(error.message);
    console.error('Erreur lors du lancement du jeu:', error);
    throw error;
  }
}

/**
 * Met à jour les statistiques de jeu.
 */
export async function updateGameTime(gameId, sessionTimeInSeconds) {
  const cache = await loadCache();
  const gameEntry = cache[gameId] || {};

  const currentTotalTime = gameEntry.totalPlayTime || 0;
  const newTotalTime = currentTotalTime + sessionTimeInSeconds;

  await updateCacheEntry(cache, gameId, {
    totalPlayTime: newTotalTime,
    lastPlayed: new Date().toISOString()
  });
}
