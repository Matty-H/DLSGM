// src/renderer/ui/Settings.js

const { ipcRenderer } = require('electron');

/**
 * Composant pour la gestion des paramètres de l'application
 */
class Settings {
  constructor(store, settingsService, gameService) {
    this.store = store;
    this.settingsService = settingsService;
    this.gameService = gameService;

    this.setupUI();
    this.setupEventListeners();
  }

  /**
   * Configure l'interface utilisateur des paramètres
   */
  setupUI() {
    const settingsButton = document.querySelector('.settings-button');
    if (!settingsButton) return;

    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'settings-container';
    settingsContainer.style.display = 'none';

    const settings = this.settingsService.getAll();

    settingsContainer.innerHTML = `
      <div class="settings-header">
        <h2>Settings</h2>
      </div>
      <div class="settings-content">
        <div class="setting-item">
          <label for="destination-folder">Destination Folder:</label>
          <div class="folder-selection">
            <input type="text" 
                   class="destination-folder" 
                   readonly 
                   value="${settings.destinationFolder || ''}" />
            <button class="browse-button">Browse</button>
          </div>
        </div>
        <div class="setting-item">
          <label for="refresh-rate">Refresh Rate (in min):</label>
          <div class="number-input-container">
            <input type="number" 
                   class="refresh-rate-input" 
                   min="0" 
                   max="120" 
                   value="${settings.refreshRate}" 
                   step="1" />
          </div>
        </div>
        <div class="setting-item">
          <button class="reset-image-cache">Reset Image Cache</button>
        </div>
        <div class="setting-item">
          <label for="language-toggle">Language:</label>
          <button class="language-toggle">
            ${settings.language === 'en_US' ? '🇯🇵 日本語' : '🇬🇧 English'}
          </button>
        </div>
        <div class="setting-item">
          <button class="save-button">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(settingsContainer);
    this.container = settingsContainer;
    this.settingsButton = settingsButton;
  }

  /**
   * Configure les écouteurs d'événements
   */
  setupEventListeners() {
    if (!this.container) return;

    // Bouton pour afficher/masquer les paramètres
    this.settingsButton.addEventListener('click', () => {
      this.toggle();
    });

    // Masquer lors du clic sur le titre
    const title = document.querySelector('header h1');
    if (title) {
      title.addEventListener('click', () => {
        this.hide();
      });
    }

    // Bouton de navigation de dossier
    const browseButton = this.container.querySelector('.browse-button');
    if (browseButton) {
      browseButton.addEventListener('click', () => {
        ipcRenderer.send('open-folder-dialog');
      });
    }

    // Réception du dossier sélectionné
    ipcRenderer.on('selected-folder', (event, folderPath) => {
      const input = this.container.querySelector('.destination-folder');
      if (input) {
        input.value = folderPath;
      }
    });

    // Bouton de sauvegarde
    const saveButton = this.container.querySelector('.save-button');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        this.saveSettings();
      });
    }

    // Bouton de réinitialisation du cache d'images
    const resetCacheButton = this.container.querySelector('.reset-image-cache');
    if (resetCacheButton) {
      resetCacheButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset the image cache? This will re-download all images.')) {
          await this.gameService.resetAndRedownloadImages();
          alert('Image cache reset completed');
        }
      });
    }

    // Bouton de changement de langue
    const languageToggle = this.container.querySelector('.language-toggle');
    if (languageToggle) {
      languageToggle.addEventListener('click', () => {
        const currentLang = this.settingsService.getLanguage();
        const newLang = currentLang === 'en_US' ? 'ja_JP' : 'en_US';
        languageToggle.textContent = newLang === 'en_US' ? '🇯🇵 日本語' : '🇬🇧 English';
      });
    }
  }

  /**
   * Sauvegarde les paramètres
   */
  async saveSettings() {
    const folderInput = this.container.querySelector('.destination-folder');
    const refreshRateInput = this.container.querySelector('.refresh-rate-input');
    const languageToggle = this.container.querySelector('.language-toggle');

    const destinationFolder = folderInput ? folderInput.value : '';
    const refreshRate = refreshRateInput ? parseInt(refreshRateInput.value, 10) : 5;
    const language = languageToggle?.textContent.includes('日本語') ? 'en_US' : 'ja_JP';

    // Mettre à jour les paramètres
    this.settingsService.update({
      destinationFolder,
      refreshRate,
      language
    });

    // Notifier le processus principal pour la langue
    ipcRenderer.send('update-language', language);

    // Rescanner les jeux avec le nouveau dossier
    await this.store.scanAndLoadGames();

    alert('Settings saved successfully');
  }

  /**
   * Affiche les paramètres
   */
  show() {
    if (this.container) {
      this.container.style.display = 'block';
      this.settingsButton.classList.add('active');
    }
  }

  /**
   * Masque les paramètres
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
      this.settingsButton.classList.remove('active');
    }
  }

  /**
   * Bascule l'affichage des paramètres
   */
  toggle() {
    const isVisible = this.container.style.display === 'block';
    if (isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
}

module.exports = Settings;
