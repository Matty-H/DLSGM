import { scanGames } from './gameScanner.js';
import { refreshInterface } from './uiUpdater.js';
import { updateSelectedGenres} from './filterManager.js';
import { openGameFolder } from './osHandler.js';
const { shell } = require('electron');

// Initialise tous les écouteurs d'événements de l'interface utilisateur
export function initEventListeners() {
  // Filtre par catégorie
  document.querySelector('.category-filter').addEventListener('change', refreshInterface);
  
  // Filtre par genre (multi-select)
  document.querySelector('.genre-filter').addEventListener('change', function() {
    const selectedOptions = Array.from(this.selectedOptions);
    const newGenres = selectedOptions.map(opt => opt.value);
    updateSelectedGenres(newGenres);
    refreshInterface();
  });


  // Recherche avec délai
  let searchTimeout;
  document.querySelector('.search-input').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshInterface, 300);
  });

  // Réinitialisation des filtres
  document.querySelector('.reset-filters').addEventListener('click', function() {
    // Réinitialiser les sélections et barre de recherche
    console.log('prout')
    document.querySelector('.game-info').classList.remove("show");
    document.querySelector('.category-filter').value = 'all';
    document.querySelector('.search-input').value = '';
    
    // Réinitialiser multi-select de genres
    const genreSelect = document.querySelector('.genre-filter');
    Array.from(genreSelect.options).forEach(option => {
      option.selected = false;
    });
    
    // Réinitialiser les variables de filtrage
    updateSelectedGenres([]);
    
    // Rafraîchir l'affichage
    scanGames()
  });
  }

// Ouvre lien dans navigateur
export function attachGameInfoEventListeners(gameInfoDiv, gameId) {
  // Close button
  document.querySelector('.close-game-info').addEventListener('click', () => {
    gameInfoDiv.classList.remove("show");
  });

  // DLsite link handler
  document.querySelector('.dlsite-link').addEventListener('click', (event) => {
    event.preventDefault();
    shell.openExternal(event.target.href);
  });

  // Carousel navigation
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

  gameInfoDiv.querySelector('.open-folder-btn')?.addEventListener('click', () => {
    openGameFolder(gameId);

  });

  const genreTags = gameInfoDiv.querySelectorAll('.genre-tag');
  genreTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const genre = tag.dataset.genre;
      console.log('PIMPON', genre);
      updateSelectedGenres([genre]);
      refreshInterface();
    });
  });
}