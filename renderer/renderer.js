// Importations des modules
import { categoryMap } from './javaScript/metadataManager.js';
import { refreshInterface } from './javaScript/uiManager.js';
import { loadCache } from './javaScript/cacheManager.js';
import { launchGame, startAutoRefresh } from './javaScript/osHandler.js';
import { showGameInfo } from './javaScript/gameInfoHandler.js';
import { scanGames } from './javaScript/gameScanner.js';
import { initEventListeners } from './javaScript/eventListeners.js';
import { initSettingsUI, getRefreshRate, loadSettings } from './javaScript/settings.js';

// Pour Electron, nous avons besoin d'accéder aux modules depuis le processus de rendu
const { ipcRenderer } = require('electron');

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

// Titre original de l'application
const originalTitle = document.title;

// Création d'un div de couverture blanche pour le "panic button"
const panicOverlay = document.createElement('div');
panicOverlay.style.position = 'fixed';
panicOverlay.style.top = '0';
panicOverlay.style.left = '0';
panicOverlay.style.width = '100%';
panicOverlay.style.height = '100%';
panicOverlay.style.backgroundColor = 'white';
panicOverlay.style.zIndex = '9998';  // Juste en dessous de l'iframe
panicOverlay.style.display = 'flex';
panicOverlay.style.alignItems = 'center';
panicOverlay.style.justifyContent = 'center';
panicOverlay.style.flexDirection = 'column';
document.body.appendChild(panicOverlay);

// Création de l'animation de chargement
const loaderContainer = document.createElement('div');
loaderContainer.innerHTML = `
  <div style="text-align: center;">
    <div style="display: inline-block; width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    <p style="margin-top: 15px; font-family: Arial, sans-serif; color: #333; font-size: 16px;"><b>Loading, please wait...</b></p>
    <p style="margin-top: 15px; font-family: Arial, sans-serif; color: #333; font-size: 10px;"><i>(Alt+Space to close)</i></p>
  </div>
  <style>
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
`;
panicOverlay.appendChild(loaderContainer);

// Création d'un iframe pour le "panic button"
const panicIframe = document.createElement('iframe');
panicIframe.style.position = 'fixed';
panicIframe.style.top = '0';
panicIframe.style.left = '0';
panicIframe.style.width = '100%';
panicIframe.style.height = '100%';
panicIframe.style.border = 'none';
panicIframe.style.zIndex = '9999';
panicIframe.style.display = 'none';
document.body.appendChild(panicIframe);

// Fonction pour gérer l'activation et désactivation du panic button
function togglePanicMode(activate) {
  if (activate) {
    // Change le titre de la page
    document.title = "Wikipédia - L'encyclopédie libre";
    
    // Affiche d'abord la couverture blanche avec l'animation de chargement
    panicOverlay.style.display = 'flex';
    
    // Attend un moment puis active l'iframe de Wikipédia
    setTimeout(() => {
      panicIframe.style.display = 'block';
      panicIframe.src = 'https://fr.wikipedia.org/wiki/Spécial:Page_au_hasard';
      
      // Après le chargement de l'iframe, cache la couverture blanche
      panicIframe.onload = () => {
        panicOverlay.style.display = 'none';
      };
    }, 500);
  } else {
    // Réaffiche brièvement la couverture blanche
    panicOverlay.style.display = 'flex';
    
    // Vide et cache l'iframe
    panicIframe.src = 'about:blank';
    panicIframe.style.display = 'none';
    
    // Restaure le titre original
    document.title = originalTitle;
    
    // Cache la couverture blanche après un court délai
    setTimeout(() => {
      panicOverlay.style.display = 'none';
    }, 200);
  }
}

// Variables pour gérer le double appui
let lastPressTime = 0;
let panicActive = false;

// Version Electron : Configurer un raccourci global
// Cette partie doit être ajoutée au fichier principal (main.js ou index.js) de votre application Electron
if (typeof ipcRenderer !== 'undefined') {
  // Mise en place de la communication IPC pour le panic button
  ipcRenderer.on('panic-button-triggered', () => {
    console.log('[panicButton] Triggered via IPC');
    panicActive = !panicActive;
    togglePanicMode(panicActive);
  });
  
  // Informer le processus principal que nous sommes prêts à recevoir les événements
  ipcRenderer.send('register-panic-shortcut');
}

// Version navigateur : utilise l'approche standard pour les événements clavier
function handleKeyDown(event) {
  if (event.code === 'Space') {
    console.log('[panicButton] Hit');
    const currentTime = new Date().getTime();
    if (currentTime - lastPressTime < 300) { // Double appui rapide
      console.log('[panicButton] Double appui détecté');
      panicActive = !panicActive;
      togglePanicMode(panicActive);
    }
    lastPressTime = currentTime;
  }
}

// Installons l'écouteur d'événements au niveau de la fenêtre
window.addEventListener('keydown', handleKeyDown);

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
  
  // Cacher l'overlay de chargement au démarrage
  panicOverlay.style.display = 'none';
}

// Lance l'application une fois le DOM chargé
window.addEventListener('DOMContentLoaded', initApp);