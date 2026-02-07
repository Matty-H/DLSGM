/**
 * Gère les interactions avec le système d'exploitation (fichiers, lancements, etc.)
 * via les API exposées par le processus principal.
 */

import { loadCache, updateCacheEntry } from './cacheManager.js';
import { loadSettings } from './settings.js';
import { setGameRunning, refreshInterface } from './uiManager.js';

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
 * Lance un jeu et suit son exécution.
 */
export async function launchGame(gameId) {
  try {
    setGameRunning(gameId, true);

    const result = await window.electronAPI.launchGame(gameId);

    if (result.success) {
      // Pour l'instant on ne peut pas facilement suivre la fermeture si on 'unref' le process
      // mais on peut au moins enregistrer le dernier lancement.
      await updateGameTime(gameId, 0); // Juste pour mettre à jour 'lastPlayed'
    }

    setGameRunning(gameId, false);
  } catch (error) {
    alert(error.message);
    console.error('Erreur lors du lancement du jeu:', error);
    setGameRunning(gameId, false);
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

  refreshInterface();
}

/**
 * Gestion du rafraîchissement automatique de l'interface.
 */
let refreshInterval = null;

export function startAutoRefresh(intervalInMinutes = 1) {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  if (intervalInMinutes <= 0) {
    return;
  }

  const intervalInMilliseconds = intervalInMinutes * 60 * 1000;
  refreshInterval = setInterval(
    () => refreshInterface(),
    intervalInMilliseconds
  );
}
