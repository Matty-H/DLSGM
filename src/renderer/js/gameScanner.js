/**
 * Scanne le dossier de destination pour détecter les nouveaux jeux.
 */

import { updateCategoryDropdown, updateGenreDropdown, refreshInterface } from './uiManager.js';
import { fetchGameMetadata, purgeObsoleteGamesFromCache } from './dataFetcher.js';
import { getGamesFolderPath } from './osHandler.js';
import { loadCache } from './cacheManager.js';

/**
 * Scanne le dossier des jeux et met à jour l'interface.
 */
export async function scanGames() {
  try {
    const gamesFolderPath = await getGamesFolderPath();
    if (!gamesFolderPath || !(await window.electronAPI.fsExists(gamesFolderPath))) {
      console.error('Le dossier des jeux n\'existe pas');
      document.querySelector('.games-list').innerHTML = '<p>Dossier des jeux non configuré ou introuvable. Veuillez le définir dans les paramètres.</p>';
      return;
    }

    // Purge les jeux obsolètes du cache
    await purgeObsoleteGamesFromCache();

    // Liste les dossiers correspondant au format DLSite
    const gameFolders = await window.electronAPI.listGameFolders(gamesFolderPath);

    if (gameFolders.length === 0) {
      document.querySelector('.games-list').innerHTML = '<p>Aucun jeu trouvé dans le dossier sélectionné.</p>';
      return;
    }

    const cache = await loadCache();

    // Récupère les métadonnées pour les nouveaux jeux
    let cacheUpdated = false;
    for (const gameId of gameFolders) {
      if (!cache[gameId]) {
        await fetchGameMetadata(gameId);
        cacheUpdated = true;
      }
    }

    // Si des données ont été récupérées, on recharge le cache local pour l'UI
    const finalCache = cacheUpdated ? await loadCache() : cache;

    // Mise à jour des menus déroulants
    updateCategoryDropdown(finalCache);
    updateGenreDropdown(finalCache);

    refreshInterface();

  } catch (error) {
    console.error('Erreur lors du scan des jeux:', error);
    document.querySelector('.games-list').innerHTML = '<p>Erreur lors du scan des jeux.</p>';
  }
}
