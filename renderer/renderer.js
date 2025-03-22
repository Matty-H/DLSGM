// Importations des modules
import { categoryMap } from './scripts/metadataManager.js';
import { refreshInterface } from './scripts/uiUpdater.js';
import { loadCache } from './scripts/cacheManager.js';
import { launchGame, startAutoRefresh, loadSettings } from './scripts/osHandler.js';
import { showGameInfo } from './scripts/gameInfoHandler.js';
import { scanGames } from './scripts/gameScanner.js';
import { initEventListeners } from './scripts/eventListeners.js';
import { initSettingsUI, getRefreshRate } from './scripts/settings.js';

// Cache global & Map de catégories disponibles dans la fenêtre globale
let cache = {};
export let globalCache = loadCache(cache);

window.categoryMap = categoryMap;
window.launchGame = launchGame;
window.scanGames = scanGames;
window.refreshInterface = refreshInterface;

// Fonction pour afficher les informations d'un jeu spécifique
window.showGameInfo = (gameId) => showGameInfo(gameId, globalCache);

// 🔄 Recharge le cache et met à jour l'interface utilisateur
export function reloadCacheAndUI() {
  loadSettings();
  
  console.log('[reloadCacheAndUI] Avant rechargement du cache :', globalCache);
  globalCache = loadCache(cache);
  console.log('[reloadCacheAndUI] Après rechargement du cache :', globalCache);

  refreshInterface();
}

// Fonction d'initialisation principale
function initApp() {
  initEventListeners();
  window.addEventListener('game-closed', () => {
    console.log('[event] game-closed capté !');
    globalCache = loadCache(); // Recharge le cache
    refreshInterface(); // Met à jour l'interface
  });
  scanGames();
  initSettingsUI();
  startAutoRefresh(getRefreshRate());
}

// Lance l'application une fois le DOM chargé
window.addEventListener('DOMContentLoaded', initApp);
