import { startAutoRefresh, settingsPath } from './osHandler.js';
import { resetAndRedownloadImages } from './dataFetcher.js';
const { ipcRenderer } = require('electron');
const fs = require('fs');

// Charger les paramètres avant de créer l'interface !
let settings = {};
let destinationFolder = '';
let refreshRate = 5;
let language = 'en_US';

export function initSettingsUI() {
  const settingsButton = document.querySelector('.settings-button');
  const mainContainer = document.querySelector('.main-container');
  
  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'settings-container';
  settingsContainer.style.display = 'none';

  settingsContainer.innerHTML = `
    <div class="settings-header">
      <h2>Settings</h2>
    </div>
    <div class="settings-content">
      <div class="setting-item">
        <label for="destination-folder">Destination Folder:</label>
        <div class="folder-selection">
          <input type="text" class="destination-folder" readonly value="${settings.destinationFolder}">
          <button class="browse-button">Browse</button>
        </div>
      </div>
      <div class="setting-item">
        <label for="refresh-rate">Refresh Rate (in min):</label>
        <div class="number-input-container">
          <input type="number" class="refresh-rate-input" min="0" max="120" value="${settings.refreshRate}" step="1">
        </div>
      </div>
      <div class="setting-item">
        <button class="reset-image-cache">Reset Image Cache</button>
      </div>
      <div class="setting-item">
        <label for="language-toggle">Language:</label>
        <button class="language-toggle">🇬🇧 English</button>
      </div>
      <div class="setting-item">
        <button class="save-button">Save Settings</button>
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

  const refreshRateInput = document.querySelector('.refresh-rate-input');
  refreshRateInput.addEventListener('input', () => {
    const value = parseInt(refreshRateInput.value, 10);
    if (!isNaN(value)) {
      refreshRate = value;
    }
  });

  document.querySelector('.save-button').addEventListener('click', () => {
    saveSettings();
    scanGames();
  });

  const languageToggleButton = document.querySelector('.language-toggle');
  languageToggleButton.textContent = language === 'en_US' ? '🇯🇵 日本語' : '🇬🇧 English';

  languageToggleButton.addEventListener('click', () => {
    language = language === 'en_US' ? 'ja_JP' : 'en_US';
    languageToggleButton.textContent = language === 'en_US' ? '🇯🇵 日本語' : '🇬🇧 English';
  });
}

// === SETTINGS MANAGEMENT ===
function saveSettings() {
  const data = {
    destinationFolder: settings.destinationFolder,
    refreshRate: parseInt(settings.refreshRate, 10),
    language: settings.language,
  };

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    startAutoRefresh(data.refreshRate);
    ipcRenderer.send('update-language', data.language);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

export function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const fileContent = fs.readFileSync(settingsPath, 'utf8');
      const parsedData = JSON.parse(fileContent);

      settings = {
        destinationFolder: parsedData.destinationFolder || destinationFolder,
        refreshRate: parsedData.refreshRate || refreshRate,
        language: parsedData.language || language,
      };

      return settings;
    } else {
      const defaultSettings = {
        destinationFolder,
        refreshRate,
        language,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
      settings = defaultSettings;
      return defaultSettings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    return { destinationFolder, refreshRate, language };
  }
}

export function getDestinationFolder() {
  return settings.destinationFolder || '';
}

export function getRefreshRate() {
  return Number(settings.refreshRate);
}
