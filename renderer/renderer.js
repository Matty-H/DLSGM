import { categoryMap } from './scripts/metadataManager.js';
import { filterGames } from './scripts/uiUpdater.js';
import { loadCache } from './scripts/cacheManager.js';
import { launchGame } from './scripts/osHandler.js';
import { showGameInfo } from './scripts/gameInfoHandler.js';
import { scanGames } from './scripts/gameScanner.js';
import { initEventListeners } from './scripts/eventListeners.js';

// Exposer les variables et fonctions nécessaires globalement
window.categoryMap = categoryMap;
window.launchGame = launchGame;
window.showGameInfo = (gameId) => showGameInfo(gameId, globalCache);
window.scanGames = scanGames;
window.filterGames = filterGames;

// Initialiser le cache
let cache = {};
export let globalCache = loadCache(cache);

// Fonction d'initialisation à exécuter au chargement de la page
window.addEventListener('DOMContentLoaded', function() {
  // Initialiser les écouteurs d'événements pour le filtrage
  initEventListeners();
  
  // Lancer le scan des jeux et charger les données au démarrage
  scanGames();
});