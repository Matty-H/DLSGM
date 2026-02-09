/**
 * Point d'entrée principal du processus de rendu.
 */

import { categoryMap } from './metadataManager.js';
import { refreshInterface } from './uiManager.js';
import { loadCache } from './cacheManager.js';
import { launchGame, startAutoRefresh } from './osHandler.js';
import { showGameInfo } from './gameInfoHandler.js';
import { scanGames } from './gameScanner.js';
import { initEventListeners } from './eventListeners.js';
import { initSettingsUI, getRefreshRate, loadSettings } from './settings.js';
import { initFiltersFromSettings } from './filterManager.js';

// État global
export let globalCache = {};

// Exposition de fonctions à la fenêtre globale pour les appels depuis le HTML (si nécessaire)
window.categoryMap = categoryMap;
window.launchGame = launchGame;
window.scanGames = scanGames;
window.refreshInterface = refreshInterface;
window.showGameInfo = (gameId) => showGameInfo(gameId, globalCache);

/**
 * Recharge le cache et met à jour l'interface utilisateur.
 */
export async function reloadCacheAndUI() {
  globalCache = await loadCache();
  refreshInterface();
}

// --- Gestion du Panic Button ---
const originalTitle = document.title;
const panicOverlay = createPanicOverlay();
const panicIframe = createPanicIframe();

function createPanicOverlay() {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
    zIndex: '9998',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
  });
  
  overlay.innerHTML = `
    <div style="text-align: center;">
      <div style="display: inline-block; width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 15px; font-family: Arial, sans-serif; color: #333; font-size: 16px;"><b>Chargement, veuillez patienter...</b></p>
      <p style="margin-top: 15px; font-family: Arial, sans-serif; color: #333; font-size: 10px;"><i>(Alt+Space pour fermer)</i></p>
    </div>
    <style>
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function createPanicIframe() {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    border: 'none',
    zIndex: '9999',
    display: 'none',
  });
  document.body.appendChild(iframe);
  return iframe;
}

let panicActive = false;

function togglePanicMode(active) {
  const delay = 500;

  if (active) {
    document.title = 'Wikipedia - L\'encyclopédie libre';
    panicOverlay.style.display = 'flex';

    setTimeout(() => {
      panicIframe.style.display = 'block';
      panicIframe.src = 'https://fr.wikipedia.org/wiki/Spécial:Aléatoire';
      panicIframe.onload = () => {
        panicOverlay.style.display = 'none';
      };
    }, delay);
  } else {
    panicOverlay.style.display = 'flex';

    setTimeout(() => {
      panicIframe.src = 'about:blank';
      panicIframe.style.display = 'none';
      document.title = originalTitle;
      panicOverlay.style.display = 'none';
    }, delay);
  }
}

// --- Initialisation ---

async function initApp() {
  console.log('Initialisation de l\'application...');
  
  // Chargement initial du cache
  globalCache = await loadCache();
  
  // Chargement des paramètres et initialisation des filtres
  const settings = await loadSettings();
  initFiltersFromSettings(settings);

  // Initialisation des composants
  initEventListeners();
  await initSettingsUI();

  // Mettre à jour la valeur affichée du tri
  const sortFilter = document.getElementById('sort-filter');
  if (sortFilter && settings.selectedSort) {
    sortFilter.value = settings.selectedSort;
  }
  
  // Démarrage du scan et de l'auto-rafraîchissement
  scanGames();
  startAutoRefresh(getRefreshRate());
  
  // Écoute de l'événement Panic Button via IPC
  if (window.electronAPI && window.electronAPI.onPanicTriggered) {
    window.electronAPI.onPanicTriggered(() => {
      panicActive = !panicActive;
      togglePanicMode(panicActive);
    });
  }
}

// Lancement au chargement du DOM
window.addEventListener('DOMContentLoaded', initApp);
