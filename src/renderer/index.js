// src/renderer/index.js

const path = require('path');
const CacheService = require('./services/CacheService');
const SettingsService = require('./services/SettingsService');
const GameService = require('./services/GameService');
const MetadataService = require('./services/MetadataService');
const GameStore = require('./stores/GameStore');

// Composants UI
const GameList = require('./ui/GameList');
const GameDetails = require('./ui/GameDetails');
const Filters = require('./ui/Filters');
const Settings = require('./ui/Settings');
const PanicMode = require('./ui/PanicMode');

/**
 * Application principale
 */
class DLsiteManager {
  constructor() {
    // Chemins des fichiers - __dirname pointe vers src/renderer
    const cacheFilePath = path.join(__dirname, 'data_base', 'cache.json');
    const settingsFilePath = path.join(__dirname, 'data_base', 'settings.json');
    const imgCacheDir = path.join(__dirname, 'img_cache');
    const pythonScriptDir = path.join(__dirname, 'pythonScript');
    
    console.log('=== Initializing DLsite Manager ===');
    console.log('Cache path:', cacheFilePath);
    console.log('Settings path:', settingsFilePath);
    console.log('Image cache dir:', imgCacheDir);
    console.log('Python script dir:', pythonScriptDir);

    // Initialiser les services
    this.cacheService = new CacheService(cacheFilePath);
    this.settingsService = new SettingsService(settingsFilePath);
    this.metadataService = new MetadataService();
    this.gameService = new GameService(
      this.cacheService,
      this.settingsService,
      imgCacheDir,
      pythonScriptDir
    );

    // Initialiser le store
    this.store = new GameStore(
      this.cacheService,
      this.settingsService,
      this.gameService,
      this.metadataService
    );

    // Initialiser les composants UI
    this.initializeUI();

    // Charger les jeux au démarrage
    this.initialLoad();
  }

  /**
   * Initialise tous les composants UI
   */
  initializeUI() {
    this.gameList = new GameList(this.store);
    this.gameDetails = new GameDetails(this.store);
    this.filters = new Filters(this.store);
    this.settings = new Settings(this.store, this.settingsService, this.gameService);
    this.panicMode = new PanicMode();

    // Configurer les gestionnaires d'événements
    this.setupEventListeners();
  }

  /**
   * Configure tous les écouteurs d'événements
   */
  setupEventListeners() {
    // Écouter les changements du store
    this.store.on('games-loaded', () => this.handleGamesLoaded());
    this.store.on('games-filtered', () => this.handleGamesFiltered());
    this.store.on('game-selected', (gameId) => this.handleGameSelected(gameId));
    this.store.on('game-deselected', () => this.handleGameDeselected());
    this.store.on('scan-completed', (data) => this.handleScanCompleted(data));
    this.store.on('loading-changed', (isLoading) => this.handleLoadingChanged(isLoading));
    this.store.on('error-changed', (error) => this.handleErrorChanged(error));

    // Auto-refresh
    this.startAutoRefresh();
  }

  /**
   * Chargement initial de l'application
   */
  async initialLoad() {
    try {
      await this.store.scanAndLoadGames();
      this.filters.updateDropdowns();
    } catch (error) {
      console.error('Error during initial load:', error);
    }
  }

  /**
   * Gère le chargement des jeux
   */
  handleGamesLoaded() {
    this.gameList.render();
    this.filters.updateDropdowns();
  }

  /**
   * Gère le filtrage des jeux
   */
  handleGamesFiltered() {
    this.gameList.render();
  }

  /**
   * Gère la sélection d'un jeu
   * @param {string} gameId - ID du jeu sélectionné
   */
  handleGameSelected(gameId) {
    this.gameDetails.show(gameId);
  }

  /**
   * Gère la désélection d'un jeu
   */
  handleGameDeselected() {
    this.gameDetails.hide();
  }

  /**
   * Gère la fin du scan
   * @param {Object} data - Données du scan
   */
  handleScanCompleted(data) {
    console.log(`Scan completed: ${data.newGames} new games found`);
  }

  /**
   * Gère le changement d'état de chargement
   * @param {boolean} isLoading - État de chargement
   */
  handleLoadingChanged(isLoading) {
    // Afficher/masquer l'indicateur de chargement
    const loadingIndicator = document.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = isLoading ? 'block' : 'none';
    }
  }

  /**
   * Gère les erreurs
   * @param {string} error - Message d'erreur
   */
  handleErrorChanged(error) {
    if (error) {
      console.error('Application error:', error);
      // Afficher une notification d'erreur à l'utilisateur
      alert(error);
    }
  }

  /**
   * Démarre le rafraîchissement automatique
   */
  startAutoRefresh() {
    const refreshRate = this.settingsService.getRefreshRate();
    
    if (refreshRate > 0) {
      const intervalInMilliseconds = refreshRate * 60 * 1000;
      
      setInterval(() => {
        this.gameList.render();
      }, intervalInMilliseconds);
    }
  }
}

// Initialiser l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DLsiteManager();
});
