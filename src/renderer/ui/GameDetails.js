// src/renderer/ui/GameDetails.js

const { CATEGORY_MAP } = require('../../shared/constants');

/**
 * Composant pour afficher les détails d'un jeu
 */
class GameDetails {
  constructor(store) {
    this.store = store;
    this.container = document.querySelector('.game-info');
    this.detailsContainer = document.querySelector('.game-details');
    this.currentGameId = null;
  }

  /**
   * Affiche les détails d'un jeu
   * @param {string} gameId - ID du jeu
   */
  show(gameId) {
    this.currentGameId = gameId;
    const game = this.store.getGame(gameId);

    if (!game) {
      this.detailsContainer.innerHTML = '<p>Game information not available.</p>';
      return;
    }

    this.render(game);
    this.container.classList.add('show');
  }

  /**
   * Masque les détails
   */
  hide() {
    this.container.classList.remove('show');
    this.currentGameId = null;
  }

  /**
   * Rend les détails du jeu
   * @param {Object} game - Données du jeu
   */
  render(game) {
    const carousel = this.createCarouselHtml(game);
    const details = this.createDetailsHtml(game);

    this.detailsContainer.innerHTML = carousel + details;
    this.attachEventListeners();
  }

  /**
   * Crée le HTML du carousel d'images
   * @param {Object} game - Données du jeu
   * @returns {string} HTML du carousel
   */
  createCarouselHtml(game) {
    const imagePath = game.work_image 
      ? `img_cache/${this.currentGameId}/work_image.jpg` 
      : 'placeholder.jpg';
    
    const sampleImages = game.sample_images || [];
    const categoryLabel = CATEGORY_MAP[game.category] || 'Unknown';

    let samplesHtml = '';
    sampleImages.forEach((_, i) => {
      samplesHtml += `<img src="img_cache/${this.currentGameId}/sample_${i + 1}.jpg" class="carousel-img" />`;
    });

    return `
      <div class="carousel-container">
        <button class="close-game-info">✖</button>
        <div class="carousel">
          <button class="prev-btn">❮</button>
          <div class="carousel-images">
            <img src="${imagePath}" class="carousel-img active" />
            ${samplesHtml}
          </div>
          <button class="next-btn">❯</button>
        </div>
      </div>
      <div class="category-label">${categoryLabel}</div>
    `;
  }

  /**
   * Crée le HTML des détails du jeu
   * @param {Object} game - Données du jeu
   * @returns {string} HTML des détails
   */
  createDetailsHtml(game) {
    const creator = game.circle || game.author || 'Unknown Creator';
    const customTags = game.customTags || [];

    let html = `
      <div class="header-info">
        <h3>${game.work_name || 'Name not available'}</h3>
        <h4>by ${creator}</h4>
        ${this.createCustomTagsSection(customTags)}
      </div>
    `;

    // Ajouter les champs de métadonnées
    html += this.createMetadataFields(game);

    // Ajouter les genres
    if (game.genre && game.genre.length > 0) {
      const genreTags = game.genre
        .map(genre => `<span class="genre-tag" data-genre="${genre}">${genre}</span>`)
        .join(', ');
      html += `<p><strong>Genres:</strong> ${genreTags}</p>`;
    }

    // Ajouter la description
    if (game.description) {
      html += `<p>${game.description}</p>`;
    }

    // Ajouter les boutons d'action
    html += this.createActionButtons();

    return html;
  }

  /**
   * Crée la section des tags personnalisés
   * @param {string[]} customTags - Tags personnalisés
   * @returns {string} HTML de la section
   */
  createCustomTagsSection(customTags) {
    const tagsHtml = customTags
      .map(tag => `
        <span class="custom-tag">
          ${tag} <button class="remove-tag-btn" data-tag="${tag}">x</button>
        </span>
      `)
      .join('');

    return `
      <div class="custom-tags-section">
        <div class="custom-tags-list">${tagsHtml}</div>
        <div class="custom-tag-input-container">
          <input type="text" class="new-custom-tag-input" placeholder="Add custom tag" />
          <button class="add-custom-tag-btn">+</button>
        </div>
      </div>
    `;
  }

  /**
   * Crée les champs de métadonnées
   * @param {Object} game - Données du jeu
   * @returns {string} HTML des champs
   */
  createMetadataFields(game) {
    const formatDate = (dateString) => {
      return dateString ? dateString.split('T')[0] : 'Unknown';
    };

    const fields = [
      { label: 'Circle', value: game.circle },
      { label: 'Brand', value: game.brand },
      { label: 'Publisher', value: game.publisher },
      { label: 'Release Date', value: formatDate(game.release_date) },
      { label: 'File Size', value: game.file_size },
      { label: 'Language', value: game.language },
      { label: 'Series', value: game.series },
      { label: 'Page Count', value: game.page_count },
      { label: 'Author', value: game.author },
      { label: 'Writer', value: game.writer },
      { label: 'Scenario', value: game.scenario },
      { label: 'Illustration', value: game.illustration },
      { label: 'Voice Actor', value: game.voice_actor },
      { label: 'Music', value: game.music },
      { label: 'Events', value: game.event?.join(', ') }
    ];

    let html = '';
    fields.forEach(field => {
      if (field.value && field.value !== 'N/A') {
        html += `<p><strong>${field.label}:</strong> ${field.value}</p>`;
      }
    });

    return html;
  }

  /**
   * Crée les boutons d'action
   * @returns {string} HTML des boutons
   */
  createActionButtons() {
    return `
      <div class="action-buttons">
        <a href="https://www.dlsite.com/maniax/work/=/product_id/${this.currentGameId}.html" 
           target="_blank" 
           class="dlsite-link">
          View on DLsite
        </a>
        <a href="#" class="open-folder-btn">
          Open Folder
        </a>
      </div>
    `;
  }

  /**
   * Attache les événements aux éléments
   */
  attachEventListeners() {
    // Bouton de fermeture
    const closeBtn = this.container.querySelector('.close-game-info');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.store.deselectGame());
    }

    // Navigation du carousel
    this.attachCarouselListeners();

    // Bouton d'ouverture du dossier
    const openFolderBtn = this.container.querySelector('.open-folder-btn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.store.openGameFolder(this.currentGameId);
      });
    }

    // Tags personnalisés
    this.attachCustomTagsListeners();

    // Filtrage par genre
    this.attachGenreTagListeners();
  }

  /**
   * Attache les événements du carousel
   */
  attachCarouselListeners() {
    const images = this.container.querySelectorAll('.carousel-img');
    let currentIndex = 0;

    const showImage = (index) => {
      images.forEach((img, i) => {
        img.classList.toggle('active', i === index);
      });
    };

    const prevBtn = this.container.querySelector('.prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        showImage(currentIndex);
      });
    }

    const nextBtn = this.container.querySelector('.next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % images.length;
        showImage(currentIndex);
      });
    }
  }

  /**
   * Attache les événements des tags personnalisés
   */
  attachCustomTagsListeners() {
    // Ajouter un tag
    const addBtn = this.container.querySelector('.add-custom-tag-btn');
    const input = this.container.querySelector('.new-custom-tag-input');
    
    if (addBtn && input) {
      addBtn.addEventListener('click', () => {
        const newTag = input.value.trim();
        if (newTag) {
          this.store.addCustomTag(this.currentGameId, newTag);
          input.value = '';
          this.show(this.currentGameId); // Re-rendre
        }
      });
    }

    // Supprimer un tag
    const removeButtons = this.container.querySelectorAll('.remove-tag-btn');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        this.store.removeCustomTag(this.currentGameId, tag);
        this.show(this.currentGameId); // Re-rendre
      });
    });
  }

  /**
   * Attache les événements des tags de genre
   */
  attachGenreTagListeners() {
    const genreTags = this.container.querySelectorAll('.genre-tag');
    genreTags.forEach(tag => {
      tag.addEventListener('click', () => {
        const genre = tag.dataset.genre;
        this.store.updateFilters({ genres: [genre] });
        this.hide();
      });
    });
  }
}

module.exports = GameDetails;
