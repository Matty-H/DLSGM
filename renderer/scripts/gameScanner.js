import { updateCategoryDropdown, updateGenreDropdown, refreshInterface } from './uiManager.js';
import { globalCache } from '../renderer.js';
import { fetchGameMetadata } from './dataFetcher.js';
import { getGamesFolderPath } from './osHandler.js';
import { purgeObsoleteGamesFromCache } from './dataFetcher.js';
const fs = require('fs');

// Scanne le dossier des jeux, purge les entrées obsolètes et met à jour l'interface
export function scanGames() {
  console.log('function scanGames');
  try {
    if (!fs.existsSync(getGamesFolderPath())) {
      console.error('Le dossier SCAN n\'existe pas');
      document.querySelector('.games-list').innerHTML = '<p>Dossier SCAN introuvable. Veuillez créer le dossier SCAN sur votre bureau.</p>';
      return;
    }

    purgeObsoleteGamesFromCache();
    
    const files = fs.readdirSync(getGamesFolderPath());
    const gameFolders = files.filter(file => /^[A-Z]{2}\d{6,9}$/.test(file));
    
    if (gameFolders.length === 0) {
      document.querySelector('.games-list').innerHTML = '<p>Aucun jeu trouvé dans SCAN.</p>';
      return;
    }
    
    // Vérifier et récupérer les métadonnées pour les jeux non-cachés
    gameFolders.forEach(folder => {
      const gameId = folder;
      // Vérifier si le jeu n'est pas dans le cache pour récupérer ses infos
      if (!globalCache[gameId]) {
        console.log(`Jeu non-caché trouvé: ${gameId}, récupération des métadonnées...`);
        fetchGameMetadata(gameId); // Récupérer les métadonnées
      }
    });
    
    // Mettre à jour les menus déroulants
    updateCategoryDropdown(globalCache);
    updateGenreDropdown(globalCache);

    refreshInterface();

  } catch (error) {
    console.error('Erreur lors du scan des jeux:', error);
    document.querySelector('.games-list').innerHTML = '<p>Erreur lors du scan des jeux.</p>';
  }
}