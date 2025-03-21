import { categoryMap } from './scripts/metadataManager.js';
import { refreshInterface } from './scripts/uiUpdater.js';
import { loadCache } from './scripts/cacheManager.js';
import { launchGame, startAutoRefresh, loadSettings } from './scripts/osHandler.js';
import { showGameInfo } from './scripts/gameInfoHandler.js';
import { scanGames } from './scripts/gameScanner.js';
import { initEventListeners } from './scripts/eventListeners.js';
import { initSettingsUI, getRefreshRate } from './scripts/settings.js';

// Exposer les variables et fonctions nécessaires globalement
window.categoryMap = categoryMap;
window.launchGame = launchGame;
window.showGameInfo = (gameId) => showGameInfo(gameId, globalCache);
window.scanGames = scanGames;
window.refreshInterface = refreshInterface;

// Initialiser le cache
let cache = {};
export let globalCache = loadCache(cache);

export function reloadCacheAndUI() {
  loadSettings();
  console.log('AAAAA');
  console.log(globalCache);
  globalCache = loadCache(cache);
  scanGames();
  refreshInterface();
  console.log('BBBBB');
  console.log(globalCache);
}


// Fonction d'initialisation à exécuter au chargement de la page
window.addEventListener('DOMContentLoaded', function() {
  // Initialiser les écouteurs d'événements pour le filtrage
  initEventListeners();
  
  // Écoute de la fermeture de jeu
  window.addEventListener('game-closed', () => {
    console.log('Événement game-closed capté !');
    globalCache = loadCache(); // Recharge les données fraîches
    refreshInterface(); // Rafraîchis l'affichage
  });
  
  // Scan initial des jeux
  scanGames();
  initSettingsUI();
});

// set autorefresh toutes les X minutes
startAutoRefresh(getRefreshRate());