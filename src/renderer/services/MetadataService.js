// src/renderer/services/MetadataService.js

const { CATEGORY_MAP } = require('../../shared/constants');

/**
 * Service pour la gestion et l'analyse des métadonnées des jeux
 */
class MetadataService {
  /**
   * Collecte toutes les catégories uniques présentes dans le cache
   * @param {Object} cache - Le cache des jeux
   * @returns {Array<{code: string, name: string}>} Array de catégories triées
   */
  collectAllCategories(cache) {
    const uniqueCategoryCodes = new Set();
    
    Object.values(cache).forEach(game => {
      if (game.category) {
        uniqueCategoryCodes.add(game.category);
      }
    });
    
    const categories = Array.from(uniqueCategoryCodes).map(code => ({
      code,
      name: CATEGORY_MAP[code] || code
    }));
    
    // Trier par nom de catégorie
    categories.sort((a, b) => a.name.localeCompare(b.name));
    
    return categories;
  }

  /**
   * Collecte tous les genres uniques présents dans le cache
   * @param {Object} cache - Le cache des jeux
   * @returns {string[]} Array de genres triés
   */
  collectAllGenres(cache) {
    const genreSet = new Set();

    Object.values(cache).forEach(game => {
      if (Array.isArray(game.genre)) {
        game.genre.forEach(genre => genreSet.add(genre));
      }
    });

    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Récupère le nom d'affichage d'une catégorie
   * @param {string} categoryCode - Le code de la catégorie
   * @returns {string} Le nom d'affichage
   */
  getCategoryName(categoryCode) {
    return CATEGORY_MAP[categoryCode] || categoryCode || 'Unknown';
  }

  /**
   * Formate une date ISO en format lisible
   * @param {string} dateString - Date au format ISO
   * @returns {string} Date formatée (YYYY-MM-DD)
   */
  formatDate(dateString) {
    if (!dateString) return 'Unknown';
    return dateString.split('T')[0];
  }

  /**
   * Extrait le créateur d'un jeu (circle ou author)
   * @param {Object} metadata - Les métadonnées du jeu
   * @returns {string} Le nom du créateur
   */
  getCreator(metadata) {
    return metadata.circle || metadata.author || 'Unknown Creator';
  }

  /**
   * Récupère tous les champs de métadonnées à afficher
   * @param {Object} metadata - Les métadonnées du jeu
   * @returns {Array<{label: string, value: string}>} Array de champs
   */
  getDisplayFields(metadata) {
    const fields = [
      { label: 'Circle', value: metadata.circle },
      { label: 'Brand', value: metadata.brand },
      { label: 'Publisher', value: metadata.publisher },
      { label: 'Release Date', value: this.formatDate(metadata.release_date) },
      { label: 'File Size', value: metadata.file_size },
      { label: 'Language', value: metadata.language },
      { label: 'Series', value: metadata.series },
      { label: 'Page Count', value: metadata.page_count },
      { label: 'Author', value: metadata.author },
      { label: 'Writer', value: metadata.writer },
      { label: 'Scenario', value: metadata.scenario },
      { label: 'Illustration', value: metadata.illustration },
      { label: 'Voice Actor', value: metadata.voice_actor },
      { label: 'Music', value: metadata.music },
      { label: 'Events', value: metadata.event?.join(', ') }
    ];

    // Filtrer les champs vides ou N/A
    return fields.filter(field => field.value && field.value !== 'N/A');
  }

  /**
   * Vérifie si les métadonnées sont complètes
   * @param {Object} metadata - Les métadonnées à vérifier
   * @returns {boolean} True si les métadonnées sont complètes
   */
  isComplete(metadata) {
    return !!(
      metadata.work_name &&
      metadata.work_image &&
      metadata.category
    );
  }

  /**
   * Calcule un score de qualité des métadonnées (0-100)
   * @param {Object} metadata - Les métadonnées à évaluer
   * @returns {number} Score de qualité
   */
  getQualityScore(metadata) {
    let score = 0;
    const weights = {
      work_name: 15,
      work_image: 15,
      category: 10,
      description: 10,
      genre: 10,
      circle: 10,
      release_date: 10,
      sample_images: 10,
      file_size: 5,
      language: 5
    };

    Object.entries(weights).forEach(([key, weight]) => {
      if (metadata[key]) {
        if (Array.isArray(metadata[key])) {
          if (metadata[key].length > 0) score += weight;
        } else {
          score += weight;
        }
      }
    });

    return score;
  }
}

module.exports = MetadataService;
