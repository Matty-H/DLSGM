import { startAutoRefresh } from './osHandler.js';
import { resetAndRedownloadImages } from './dataFetcher.js';
import { scanGames } from './gameScanner.js';

let settings = {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US',
  selectedSort: 'name_asc'
};

/**
 * Initialise l'interface utilisateur des paramètres.
 */
export async function initSettingsUI() {
  await loadSettings();
  
  const settingsButton = document.querySelector('.settings-button');
  
  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'settings-container';
  settingsContainer.style.display = 'none';

  settingsContainer.innerHTML = `
    <div class="settings-header">
      <h2>Paramètres</h2>
    </div>
    <div class="settings-content">
      <div class="setting-item">
        <label>Dossier des jeux :</label>
        <div class="folder-selection">
          <input type="text" class="destination-folder" readonly value="${settings.destinationFolder}">
          <button class="browse-button">Parcourir</button>
        </div>
      </div>
      <div class="setting-item">
        <label>Rafraîchissement (min) :</label>
        <div class="number-input-container">
          <input type="number" class="refresh-rate-input" min="0" max="120" value="${settings.refreshRate}" step="1">
        </div>
      </div>
      <div class="setting-item">
        <button class="reset-image-cache">Réinitialiser le cache images</button>
      </div>
      <div class="setting-item">
        <label>Langue :</label>
        <button class="language-toggle">${settings.language === 'en_US' ? '🇬🇧 English' : '🇯🇵 日本語'}</button>
      </div>
      <div class="setting-item">
        <button class="save-button">Enregistrer</button>
      </div>
    </div>
  `;

  document.body.appendChild(settingsContainer);

  settingsButton.addEventListener('click', () => {
    const isVisible = settingsContainer.style.display === 'block';
    settingsContainer.style.display = isVisible ? 'none' : 'block';
    settingsButton.classList.toggle('active', !isVisible);
  });

  document.querySelector('.reset-image-cache').addEventListener('click', () => {
    resetAndRedownloadImages();
  });

  // Fermer les paramètres si on clique sur le logo
  document.querySelector('.logo h1').addEventListener('click', () => {
    settingsContainer.style.display = 'none';
    settingsButton.classList.remove('active');
  });

  document.querySelector('.browse-button').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.openFolderDialog();
    if (folderPath) {
      settings.destinationFolder = folderPath;
      document.querySelector('.destination-folder').value = folderPath;
    }
  });

  const refreshRateInput = document.querySelector('.refresh-rate-input');
  refreshRateInput.addEventListener('input', () => {
    const value = parseInt(refreshRateInput.value, 10);
    if (!isNaN(value)) {
      settings.refreshRate = value;
    }
  });

  document.querySelector('.save-button').addEventListener('click', async () => {
    await saveSettings();
    scanGames();
    settingsContainer.style.display = 'none';
    settingsButton.classList.remove('active');
  });

  const languageToggleButton = document.querySelector('.language-toggle');
  languageToggleButton.addEventListener('click', () => {
    settings.language = settings.language === 'en_US' ? 'ja_JP' : 'en_US';
    languageToggleButton.textContent = settings.language === 'en_US' ? '🇬🇧 English' : '🇯🇵 日本語';
  });
}

/**
 * Sauvegarde les paramètres.
 */
export async function saveSettings() {
  try {
    await window.electronAPI.saveSettings(settings);
    startAutoRefresh(settings.refreshRate);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des paramètres:', error);
  }
}

/**
 * Charge les paramètres.
 */
export async function loadSettings() {
  try {
    const savedSettings = await window.electronAPI.getSettings();
    settings = { ...settings, ...savedSettings };
    return settings;
  } catch (error) {
    console.error('Erreur lors du chargement des paramètres:', error);
    return settings;
  }
}

export function getDestinationFolder() {
  return settings.destinationFolder || '';
}

export function getRefreshRate() {
  return Number(settings.refreshRate);
}
