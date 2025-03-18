import { updateCategoryDropdown, updateGenreDropdown, filterGames } from './uiUpdater.js';
import { globalCache } from '../renderer.js';
import { fetchGameMetadata } from './dataFetcher.js';
import { gamesFolderPath } from './osHandler.js';
import { saveCache } from './cacheManager.js';
const fs = require('fs');

// Scanne le dossier des jeux, purge les entrées obsolètes et met à jour l'interface
export function scanGames() {
  console.log('function scanGames');
  try {
    if (!fs.existsSync(gamesFolderPath)) {
      console.error('Le dossier SCAN n\'existe pas');
      document.getElementById('games-list').innerHTML = '<p>Dossier SCAN introuvable. Veuillez créer le dossier SCAN sur votre bureau.</p>';
      return;
    }
    
    const files = fs.readdirSync(gamesFolderPath);
    const gameFolders = files.filter(file => /^RJ\d{6,9}$/.test(file));
    
    if (gameFolders.length === 0) {
      document.getElementById('games-list').innerHTML = '<p>Aucun jeu trouvé dans SCAN.</p>';
      return;
    }
    
    // Étape de purge : supprimer du cache les jeux qui n'existent plus dans le dossier
    const gameIdsToKeep = new Set(gameFolders);
    const cachedGameIds = Object.keys(globalCache);
    
    const purgedEntries = [];
    cachedGameIds.forEach(gameId => {
      if (!gameIdsToKeep.has(gameId)) {
        purgedEntries.push(gameId);
        delete globalCache[gameId];
      }
    });
    
    // Afficher les informations de purge dans la console
    if (purgedEntries.length > 0) {
      console.log(`Purge de ${purgedEntries.length} entrées obsolètes:`, purgedEntries);
      saveCache(globalCache); // Sauvegarde le nouveau cache après purge
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
    
    // Filtrer et afficher les jeux
    filterGames();
  } catch (error) {
    console.error('Erreur lors du scan des jeux:', error);
    document.getElementById('games-list').innerHTML = '<p>Erreur lors du scan des jeux.</p>';
  }
}