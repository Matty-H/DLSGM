// src/renderer/ui/GameList.js

const { formatPlayTime } = require('../utils/formatters');
const { CATEGORY_MAP } = require('../../shared/constants');

/**
 * Composant pour afficher la liste des jeux
 */
class GameList {
  constructor(store) {
    this.store = store;
    this.container = document.querySelector('.games-list');
  }

  /**
   * Rend la liste des jeux
   */
  render() {
    if (!this.container) return;

    const filteredGames = this.store.getFilteredGames();
    
    // Vider le conteneur
    this.container.innerHTML = '';

    // Afficher un message si aucun jeu
    if (filteredGames.length === 0) {
      this.container.innerHTML = '<p>No games match the current filters.</p>';
      return;
    }

    // Créer les éléments de jeu
    filteredGames.forEach(game => {
      const gameElement = this.createGameElement(game);
      this.container.appendChild(gameElement);
    });
  }

  /**
   * Crée un élément DOM pour un jeu
   * @param {Object} game - Données du jeu
   * @returns {HTMLElement} L'élément DOM
   */
  createGameElement(game) {
    const gameDiv = document.createElement('div');
    gameDiv.className = 'game';
    gameDiv.dataset.gameId = game.gameId;

    const categoryLabel = CATEGORY_MAP[game.category] || 'Unknown';
    const playTime = formatPlayTime(game.totalPlayTime || 0);
    const isRunning = this.store.isGameRunning(game.gameId);
    const hasRunningGames = this.store.hasRunningGames();

    // Image du jeu
    const imageHtml = this.createImageHtml(game);

    // Bouton de lancement
    const buttonHtml = this.createLaunchButtonHtml(game.gameId, isRunning, hasRunningGames);

    // Tags personnalisés
    const customTagsHtml = this.createCustomTagsHtml(game.customTags || []);

    // Rating (étoiles)
    const ratingHtml = this.createRatingHtml(game.gameId, game.rating || 0);

    gameDiv.innerHTML = `
      ${imageHtml}
      <div class="game-actions">
        <div class="action-container">
          ${buttonHtml}
        </div>
      </div>
      <div class="category-label">${categoryLabel}</div>
      ${customTagsHtml}
      <div class="rating-container">
        ${playTime ? `<div class="total-time">⏳ ${playTime}</div>` : ''}
        ${ratingHtml}
      </div>
    `;

    // Attacher les événements
    this.attachEventListeners(gameDiv, game.gameId);

    return gameDiv;
  }

  /**
   * Crée le HTML de l'image du jeu
   * @param {Object} game - Données du jeu
   * @returns {string} HTML de l'image
   */
  createImageHtml(game) {
    if (!game.work_image) return '';

    const imagePath = `img_cache/${game.gameId}/work_image.jpg`;
    const gameName = game.work_name || game.gameId;

    return `
      <div class="game-container">
        <img src="${imagePath}" 
             alt="${gameName}" 
             class="game-thumbnail" 
             data-action="show-details" />
      </div>
    `;
  }

  /**
   * Crée le HTML du bouton de lancement
   * @param {string} gameId - ID du jeu
   * @param {boolean} isRunning - Si le jeu est en cours
   * @param {boolean} hasRunningGames - Si des jeux sont en cours
   * @returns {string} HTML du bouton
   */
  createLaunchButtonHtml(gameId, isRunning, hasRunningGames) {
    const buttonText = isRunning ? '⏳' : '▶';
    const buttonClass = hasRunningGames ? 'play-button disabled' : 'play-button';
    const disabled = hasRunningGames ? 'disabled' : '';

    return `
      <button class="${buttonClass}" 
              data-action="launch-game" 
              data-game-id="${gameId}" 
              ${disabled}>
        ${buttonText}
      </button>
    `;
  }

  /**
   * Crée le HTML des tags personnalisés
   * @param {string[]} customTags - Tags personnalisés
   * @returns {string} HTML des tags
   */
  createCustomTagsHtml(customTags) {
    if (!customTags || customTags.length === 0) return '';

    const tagsHtml = customTags
      .map(tag => `<span class="custom-tag">${tag}</span>`)
      .join('');

    return `<div class="custom-tags">${tagsHtml}</div>`;
  }

  /**
   * Crée le HTML du système de notation
   * @param {string} gameId - ID du jeu
   * @param {number} rating - Note actuelle (0-5)
   * @returns {string} HTML du rating
   */
  createRatingHtml(gameId, rating) {
    let html = `<div class="rating" data-game-id="${gameId}">`;
    
    for (let i = 1; i <= 5; i++) {
      const color = i <= rating ? 'crimson' : 'gray';
      html += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${color};">★</span>`;
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Attache les événements aux éléments du jeu
   * @param {HTMLElement} gameElement - Élément DOM du jeu
   * @param {string} gameId - ID du jeu
   */
  attachEventListeners(gameElement, gameId) {
    // Clic sur l'image pour afficher les détails
    const thumbnail = gameElement.querySelector('[data-action="show-details"]');
    if (thumbnail) {
      thumbnail.addEventListener('click', () => {
        this.store.selectGame(gameId);
      });
    }

    // Clic sur le bouton de lancement
    const launchButton = gameElement.querySelector('[data-action="launch-game"]');
    if (launchButton) {
      launchButton.addEventListener('click', async () => {
        if (!launchButton.disabled) {
          try {
            await this.store.launchGame(gameId);
            this.render(); // Re-rendre pour mettre à jour l'UI
          } catch (error) {
            console.error('Error launching game:', error);
          }
        }
      });
    }

    // Clic sur les étoiles de notation
    const stars = gameElement.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const rating = parseInt(star.dataset.value);
        this.store.updateGameRating(gameId, rating);
        this.render(); // Re-rendre pour mettre à jour l'UI
      });
    });
  }
}

module.exports = GameList;
