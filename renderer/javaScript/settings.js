import { startAutoRefresh, settingsPath } from './osHandler.js';
import { resetAndRedownloadImages } from './dataFetcher.js';
const { ipcRenderer } = require('electron');
const fs = require('fs');

let destinationFolder = '';
let refreshRate = 42; // Valeur par défaut, mais ça sera écrasé si on charge le JSON

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
      </div>
      <div class="setting-item">
        <button class="save-button">Enregistrer les paramètres</button>
      </div>
      <div class="setting-item">
        <button class="reset-img-cache">Reset image cache</button>
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
}

function saveSettings() {
  try {
    const settings = {
      destinationFolder,
      refreshRate: parseInt(refreshRate),
    };

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    startAutoRefresh(settings.refreshRate);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement des paramètres:', error);
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);

      destinationFolder = settings.destinationFolder || '';
      refreshRate = (typeof settings.refreshRate === 'number') ? settings.refreshRate : 5;

    } else {
      // Si le fichier n'existe pas, on utilise les valeurs par défaut
      destinationFolder = '';
      refreshRate = 5;
    }
  } catch (error) {
    console.error('Erreur lors du chargement des paramètres:', error);
    destinationFolder = '';
    refreshRate = 5;
  }
}

export function getDestinationFolder() {
  return destinationFolder;
}

export function getRefreshRate() {
  return parseInt(refreshRate);
}