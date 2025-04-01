import { startAutoRefresh, settingsPath } from './osHandler.js';
import { resetAndRedownloadImages } from './dataFetcher.js';
const { ipcRenderer } = require('electron');
const fs = require('fs');

let destinationFolder = '';
let language = 'en_US'; // Valeur par défaut
let refreshRate = 5; // Valeur par défaut, mais ça sera écrasé si on charge le JSON

export function initSettingsUI() {
  const settingsButton = document.querySelector('.settings-button');
  const mainContainer = document.querySelector('.main-container');
  
  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'settings-container';
  settingsContainer.style.display = 'none';

  // Charger les paramètres avant de créer l'interface !
  loadSettings();

  // Maintenant que refreshRate et destinationFolder ont été mis à jour,
  // on peut utiliser leurs valeurs pour créer le HTML
  settingsContainer.innerHTML = `
    <div class="settings-header">
      <h2>Paramètres</h2>
    </div>
    <div class="settings-content">
      <div class="setting-item">
        <label for="destination-folder">Dossier de destination:</label>
        <div class="folder-selection">
          <input type="text" class="destination-folder" readonly value="${destinationFolder}">
          <button class="browse-button">Parcourir</button>
        </div>
      </div>
      <div class="setting-item">
        <label for="refresh-rate">Refresh rate (in min):</label>
        <div class="number-input-container">
          <input type="number" class="refresh-rate-input" min="0" max="120" value="${refreshRate}" step="1">
        </div>
      </div>
      <div class="setting-item">
        <button class="reset-img-cache">Reset image cache</button>
      </div>
      <div class="setting-item">
        <label for="language-toggle">Langue :</label>
        <button class="language-toggle">🇬🇧 English</button>
      </div>
      <div class="setting-item">
        <button class="save-button">Enregistrer les paramètres</button>
      </div>

    </div>
  `;

  document.body.appendChild(settingsContainer);

  // Transformer le bouton settings en toggle
  settingsButton.addEventListener('click', () => {
    const isVisible = settingsContainer.style.display === 'block';
  
    settingsContainer.style.display = isVisible ? 'none' : 'block';
    settingsButton.classList.toggle('active', !isVisible);
  });

  document.querySelector('.reset-img-cache').addEventListener('click', () => {
    resetAndRedownloadImages();
  });

  // On supprime le bouton "Retour" qui n'est plus nécessaire

  document.querySelector('header h1').addEventListener('click', () => {
    settingsContainer.style.display = 'none';
    settingsButton.classList.remove('active');
  });

  document.querySelector('.browse-button').addEventListener('click', async () => {
    ipcRenderer.send('open-folder-dialog');
  });

  ipcRenderer.on('selected-folder', (event, folderPath) => {
    if (folderPath) {
      destinationFolder = folderPath;
      document.querySelector('.destination-folder').value = destinationFolder;
    }
  });

  const refreshInput = document.querySelector('.refresh-rate-input');

  refreshInput.addEventListener('input', () => {
    const value = parseInt(refreshInput.value);
    if (!isNaN(value)) {
      refreshRate = value;
    }
  });

  document.querySelector('.save-button').addEventListener('click', () => {
    saveSettings();
    scanGames()
  });

  document.querySelector('.language-toggle').addEventListener('click', (event) => {
    language = language === 'en_US' ? 'ja_JP' : 'en_US';
    event.target.textContent = language === 'en_US' ? '🇬🇧 English' : '🇯🇵 日本語';
  });
}



// === SETTINGS MANAGEMENT ===
function saveSettings() {
  try {
    const settings = {
      destinationFolder,
      refreshRate: parseInt(refreshRate),
      language
    };

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    startAutoRefresh(settings.refreshRate);
    ipcRenderer.send('update-language', language);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement des paramètres:', error);
  }
}

export function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);
      console.log('settings chargé:', Object.keys(settings).length, 'entrées');
      return settings;
    } else {
      console.log('Aucun settings trouvé, création du settings...');
      const defaultSettings = {};
      fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
  } catch (error) {
    console.error('Erreur lors du chargement du settings:', error);
    const defaultSettings = {};
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
}

export function getDestinationFolder() {
  return destinationFolder;
}

export function getRefreshRate() {
  return parseInt(refreshRate);
}