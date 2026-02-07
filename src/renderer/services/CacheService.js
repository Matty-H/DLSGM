// src/renderer/services/CacheService.js

const fs = require('fs');
const path = require('path');

/**
 * Service centralisé pour la gestion du cache des jeux
 * Corrige le bug où saveCache() écrivait toujours un objet vide
 */
class CacheService {
  constructor(cacheFilePath) {
    this.cacheFilePath = cacheFilePath;
    this.cache = {};
    this.initialize();
  }

  /**
   * Initialise le service en chargeant le cache existant
   */
  initialize() {
    this.cache = this.load();
  }

  /**
   * Charge le cache depuis le fichier
   * Crée le fichier s'il n'existe pas
   * @returns {Object} Le cache chargé
   */
  load() {
    try {
      // Vérifier si le fichier de cache existe
      if (fs.existsSync(this.cacheFilePath)) {
        const cacheContent = fs.readFileSync(this.cacheFilePath, 'utf8');
        return JSON.parse(cacheContent);
      } else {
        // Créer le répertoire parent si nécessaire
        const cacheDir = path.dirname(this.cacheFilePath);
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        // Créer un cache vide
        const emptyCache = {};
        fs.writeFileSync(this.cacheFilePath, JSON.stringify(emptyCache, null, 2));
        return emptyCache;
      }
    } catch (error) {
      console.error('Error loading cache:', error);
      // En cas d'erreur, créer un nouveau cache vide
      const emptyCache = {};
      try {
        fs.writeFileSync(this.cacheFilePath, JSON.stringify(emptyCache, null, 2));
      } catch (writeError) {
        console.error('Error creating empty cache:', writeError);
      }
      return emptyCache;
    }
  }

  /**
   * Sauvegarde le cache actuel dans le fichier
   * @returns {boolean} True si la sauvegarde a réussi
   */
  save() {
    try {
      // Écrire le cache ACTUEL (pas un objet vide !)
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving cache:', error);
      return false;
    }
  }

  /**
   * Récupère une entrée du cache par ID de jeu
   * @param {string} gameId - L'ID du jeu
   * @returns {Object|null} Les données du jeu ou null
   */
  get(gameId) {
    return this.cache[gameId] || null;
  }

  /**
   * Récupère tout le cache
   * @returns {Object} Le cache complet
   */
  getAll() {
    return { ...this.cache };
  }

  /**
   * Met à jour ou crée une entrée dans le cache
   * @param {string} gameId - L'ID du jeu
   * @param {Object} data - Les données à stocker
   * @returns {boolean} True si la mise à jour a réussi
   */
  set(gameId, data) {
    this.cache[gameId] = {
      ...(this.cache[gameId] || {}),
      ...data
    };
    return this.save();
  }

  /**
   * Met à jour partiellement une entrée existante
   * @param {string} gameId - L'ID du jeu
   * @param {Object} partialData - Les données partielles à fusionner
   * @returns {boolean} True si la mise à jour a réussi
   */
  update(gameId, partialData) {
    if (!this.cache[gameId]) {
      console.warn(`Game ${gameId} not found in cache`);
      return false;
    }
    
    this.cache[gameId] = {
      ...this.cache[gameId],
      ...partialData
    };
    
    return this.save();
  }

  /**
   * Supprime une entrée du cache
   * @param {string} gameId - L'ID du jeu à supprimer
   * @returns {boolean} True si la suppression a réussi
   */
  delete(gameId) {
    if (this.cache[gameId]) {
      delete this.cache[gameId];
      return this.save();
    }
    return false;
  }

  /**
   * Supprime plusieurs entrées du cache
   * @param {string[]} gameIds - Array d'IDs de jeux à supprimer
   * @returns {boolean} True si la suppression a réussi
   */
  deleteMultiple(gameIds) {
    let modified = false;
    
    gameIds.forEach(gameId => {
      if (this.cache[gameId]) {
        delete this.cache[gameId];
        modified = true;
      }
    });
    
    return modified ? this.save() : false;
  }

  /**
   * Vérifie si un jeu existe dans le cache
   * @param {string} gameId - L'ID du jeu
   * @returns {boolean} True si le jeu existe
   */
  has(gameId) {
    return !!this.cache[gameId];
  }

  /**
   * Récupère tous les IDs de jeux dans le cache
   * @returns {string[]} Array d'IDs de jeux
   */
  getAllGameIds() {
    return Object.keys(this.cache);
  }

  /**
   * Compte le nombre de jeux dans le cache
   * @returns {number} Nombre de jeux
   */
  count() {
    return Object.keys(this.cache).length;
  }

  /**
   * Vide complètement le cache
   * @returns {boolean} True si l'opération a réussi
   */
  clear() {
    this.cache = {};
    return this.save();
  }

  /**
   * Recharge le cache depuis le fichier
   * Utile après des modifications externes
   * @returns {Object} Le cache rechargé
   */
  reload() {
    this.cache = this.load();
    return this.cache;
  }
}

module.exports = CacheService;
