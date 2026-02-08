/**
 * Gère tous les écouteurs d'événements de l'interface utilisateur.
 */

import { scanGames } from './gameScanner.js';
import { refreshInterface } from './uiManager.js';
import { updateSelectedGenres } from './filterManager.js';
import { openGameFolder } from './osHandler.js';

/**
 * Initialise les écouteurs d'événements globaux.
 */
export function initEventListeners() {
  // Filtre par catégorie
  document.querySelector('.category-filter').addEventListener('change', () => refreshInterface());
  
  // Filtre par genre (sélection multiple)
  document.querySelector('.genre-filter').addEventListener('change', function() {
    const selectedOptions = Array.from(this.selectedOptions);
    const newGenres = selectedOptions.map(opt => opt.value);
    updateSelectedGenres(newGenres);
    refreshInterface();
  });

  // Recherche avec délai (debounce)
  let searchTimeout;
  document.querySelector('.search-input').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => refreshInterface(), 300);
  });

  // Réinitialisation des filtres
  document.querySelector('.reset-filters').addEventListener('click', function() {
    document.querySelector('.game-info').classList.remove("show");
    document.querySelector('.category-filter').value = 'all';
    document.querySelector('.search-input').value = '';
    
    const genreSelect = document.querySelector('.genre-filter');
    Array.from(genreSelect.options).forEach(option => {
      option.selected = false;
    });
    
    updateSelectedGenres([]);
    scanGames();
  });
}

/**
 * Attache les écouteurs d'événements spécifiques au panneau d'information d'un jeu.
 */
export function attachGameInfoEventListeners(gameInfoDiv, gameId) {
  // Bouton de fermeture
  document.querySelector('.close-game-info').addEventListener('click', () => {
    gameInfoDiv.classList.remove("show");
  });

  // Lien DLSite (ouvrir dans le navigateur externe)
  document.querySelector('.dlsite-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    window.electronAPI.openExternal(event.target.href);
  });
  
  // Carousel : Navigation
  const carouselImages = gameInfoDiv.querySelectorAll('.carousel-img');
  let currentIndex = 0;

  const showImage = (index) => {
    carouselImages.forEach((img, i) => {
      img.classList.toggle('active', i === index);
    });
  };

  gameInfoDiv.querySelector('.prev-btn')?.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + carouselImages.length) % carouselImages.length;
    showImage(currentIndex);
  });

  gameInfoDiv.querySelector('.next-btn')?.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % carouselImages.length;
    showImage(currentIndex);
  });

  // Bouton d'ouverture du dossier
  gameInfoDiv.querySelector('.open-folder-btn')?.addEventListener('click', () => {
    openGameFolder(gameId);
  });

  // Tags de genre cliquables
  const genreTags = gameInfoDiv.querySelectorAll('.genre-tag');
  genreTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const genre = tag.dataset.genre;
      updateSelectedGenres([genre]);
      refreshInterface();
    });
  });
}
