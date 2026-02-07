// src/renderer/stores/GameStore.js

const EventEmitter = require('events');

/**
 * Store centralisé pour la gestion d'état de l'application
 * Implémente le pattern Observer pour notifier les changements
 */
class GameStore extends EventEmitter {
  constructor(cacheService, settingsService, gameService, metadataService) {
    super();
    
    this.cacheService = cacheService;
    this.settingsService = settingsService;
    this.gameService = gameService;
    this.metadataService = metadataService;
    
    // État de l'application
    this.state = {
      games: {},              // Cache des jeux
      filteredGames: [],      // Jeux filtrés affichés
      selectedGame: null,     // Jeu sélectionné pour affichage détaillé
      filters: {
        category: 'all',
        genres: [],
        searchTerm: ''
      },
      ui: {
        isLoading: false,
        error: null,
        runningGames: new Set()
      }
    };
  }

  /**
   * Récupère l'état complet
   * @returns {Object} L'état actuel
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Récupère tous les jeux
   * @returns {Object} Tous les jeux
   */
  getAllGames() {
    return { ...this.state.games };
  }

  /**
   * Récupère les jeux filtrés
   * @returns {Array} Jeux filtrés
   */
  getFilteredGames() {
    return [...this.state.filteredGames];
  }

  /**
   * Récupère un jeu spécifique
   * @param {string} gameId - ID du jeu
   * @returns {Object|null} Les données du jeu
   */
  getGame(gameId) {
    return this.state.games[gameId] || null;
  }

  /**
   * Charge les jeux depuis le cache
   */
  loadGames() {
    this.state.games = this.cacheService.getAll();
    this.applyFilters();
    this.emit('games-loaded');
  }

  /**
   * Scanne le dossier de jeux et charge les nouvelles métadonnées
   */
  async scanAndLoadGames() {
    console.log('=== Starting game scan ===');
    this.setLoading(true);
    
    try {
      // Purger les jeux obsolètes
      console.log('Purging obsolete games...');
      this.gameService.purgeObsoleteGames();
      
      // Récupérer les jeux non cachés
      console.log('Getting uncached games...');
      const uncachedGames = this.gameService.getUncachedGames();
      console.log('Found', uncachedGames.length, 'uncached games:', uncachedGames);
      
      // Charger les métadonnées pour chaque nouveau jeu
      if (uncachedGames.length > 0) {
        console.log('Fetching metadata for new games...');
        for (const gameId of uncachedGames) {
          try {
            console.log('Fetching metadata for:', gameId);
            await this.gameService.fetchGameMetadata(gameId);
          } catch (error) {
            console.error(`Error loading metadata for ${gameId}:`, error);
          }
        }
      } else {
        console.log('No new games to fetch metadata for');
      }
      
      // Recharger tous les jeux
      console.log('Loading all games from cache...');
      this.loadGames();
      
      this.setLoading(false);
      console.log('=== Scan completed ===');
      this.emit('scan-completed', { newGames: uncachedGames.length });
    } catch (error) {
      console.error('Error during scan:', error);
      this.setError(error.message);
      this.setLoading(false);
    }
  }

  /**
   * Met à jour les filtres
   * @param {Object} newFilters - Nouveaux filtres
   */
  updateFilters(newFilters) {
    this.state.filters = {
      ...this.state.filters,
      ...newFilters
    };
    this.applyFilters();
    this.emit('filters-updated');
  }

  /**
   * Réinitialise les filtres
   */
  resetFilters() {
    this.state.filters = {
      category: 'all',
      genres: [],
      searchTerm: ''
    };
    this.applyFilters();
    this.emit('filters-reset');
  }

  /**
   * Applique les filtres actuels aux jeux
   */
  applyFilters() {
    const { category, genres, searchTerm } = this.state.filters;
    const allGames = Object.entries(this.state.games);
    
    this.state.filteredGames = allGames
      .filter(([gameId, game]) => {
        // Filtrer par catégorie
        if (category !== 'all' && game.category !== category) {
          return false;
        }
        
        // Filtrer par genres
        if (genres.length > 0) {
          const gameGenres = game.genre || [];
          const hasMatchingGenre = genres.some(genre => gameGenres.includes(genre));
          if (!hasMatchingGenre) return false;
        }
        
        // Filtrer par terme de recherche
        if (searchTerm) {
          const lowerSearchTerm = searchTerm.toLowerCase();
          const gameName = (game.work_name || '').toLowerCase();
          const circle = (game.circle || '').toLowerCase();
          const author = String(game.author || '').toLowerCase();
          const customTags = game.customTags || [];
          
          const nameMatches = gameName.includes(lowerSearchTerm);
          const circleMatches = circle.includes(lowerSearchTerm);
          const authorMatches = author.includes(lowerSearchTerm);
          const tagsMatch = customTags.some(tag => 
            tag.toLowerCase().includes(lowerSearchTerm)
          );
          
          if (!nameMatches && !circleMatches && !authorMatches && !tagsMatch) {
            return false;
          }
        }
        
        return true;
      })
      .map(([gameId, game]) => ({ gameId, ...game }));
    
    this.emit('games-filtered');
  }

  /**
   * Sélectionne un jeu pour affichage détaillé
   * @param {string} gameId - ID du jeu
   */
  selectGame(gameId) {
    this.state.selectedGame = gameId;
    this.emit('game-selected', gameId);
  }

  /**
   * Désélectionne le jeu actuel
   */
  deselectGame() {
    this.state.selectedGame = null;
    this.emit('game-deselected');
  }

  /**
   * Met à jour les données d'un jeu
   * @param {string} gameId - ID du jeu
   * @param {Object} updates - Données à mettre à jour
   */
  updateGame(gameId, updates) {
    if (this.state.games[gameId]) {
      this.state.games[gameId] = {
        ...this.state.games[gameId],
        ...updates
      };
      
      this.cacheService.update(gameId, updates);
      this.applyFilters();
      this.emit('game-updated', gameId);
    }
  }

  /**
   * Met à jour la note d'un jeu
   * @param {string} gameId - ID du jeu
   * @param {number} rating - Note (1-5)
   */
  updateGameRating(gameId, rating) {
    this.updateGame(gameId, { rating });
  }

  /**
   * Ajoute un tag personnalisé à un jeu
   * @param {string} gameId - ID du jeu
   * @param {string} tag - Tag à ajouter
   */
  addCustomTag(gameId, tag) {
    const game = this.state.games[gameId];
    if (!game) return;
    
    const customTags = game.customTags || [];
    if (!customTags.includes(tag)) {
      customTags.push(tag);
      this.updateGame(gameId, { customTags });
    }
  }

  /**
   * Supprime un tag personnalisé d'un jeu
   * @param {string} gameId - ID du jeu
   * @param {string} tag - Tag à supprimer
   */
  removeCustomTag(gameId, tag) {
    const game = this.state.games[gameId];
    if (!game) return;
    
    const customTags = (game.customTags || []).filter(t => t !== tag);
    this.updateGame(gameId, { customTags });
  }

  /**
   * Lance un jeu
   * @param {string} gameId - ID du jeu
   */
  async launchGame(gameId) {
    try {
      await this.gameService.launchGame(gameId);
      this.state.ui.runningGames.add(gameId);
      this.emit('game-launched', gameId);
    } catch (error) {
      this.setError(`Failed to launch game: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ouvre le dossier d'un jeu
   * @param {string} gameId - ID du jeu
   */
  openGameFolder(gameId) {
    try {
      this.gameService.openGameFolder(gameId);
    } catch (error) {
      this.setError(`Failed to open folder: ${error.message}`);
    }
  }

  /**
   * Marque un jeu comme terminé
   * @param {string} gameId - ID du jeu
   */
  gameEnded(gameId) {
    this.state.ui.runningGames.delete(gameId);
    this.loadGames(); // Recharger pour mettre à jour les stats
    this.emit('game-ended', gameId);
  }

  /**
   * Définit l'état de chargement
   * @param {boolean} isLoading - État de chargement
   */
  setLoading(isLoading) {
    this.state.ui.isLoading = isLoading;
    this.emit('loading-changed', isLoading);
  }

  /**
   * Définit une erreur
   * @param {string|null} error - Message d'erreur
   */
  setError(error) {
    this.state.ui.error = error;
    this.emit('error-changed', error);
  }

  /**
   * Récupère toutes les catégories disponibles
   * @returns {Array} Catégories
   */
  getAvailableCategories() {
    return this.metadataService.collectAllCategories(this.state.games);
  }

  /**
   * Récupère tous les genres disponibles
   * @returns {Array} Genres
   */
  getAvailableGenres() {
    return this.metadataService.collectAllGenres(this.state.games);
  }

  /**
   * Vérifie si des jeux sont en cours
   * @returns {boolean}
   */
  hasRunningGames() {
    return this.state.ui.runningGames.size > 0;
  }

  /**
   * Vérifie si un jeu spécifique est en cours
   * @param {string} gameId - ID du jeu
   * @returns {boolean}
   */
  isGameRunning(gameId) {
    return this.state.ui.runningGames.has(gameId);
  }
}

module.exports = GameStore;
