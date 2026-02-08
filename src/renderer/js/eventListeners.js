/**
 * Gère tous les écouteurs d'événements de l'interface utilisateur.
 */

import { scanGames } from './gameScanner.js';
import { refreshInterface, updateGenreDropdown } from './uiManager.js';
import { updateSelectedGenres, updateSelectedRating, updateSelectedSort, selectedGenres, selectedRating } from './filterManager.js';
import { openGameFolder } from './osHandler.js';
import { loadCache } from './cacheManager.js';
import { loadSettings, saveSettings } from './settings.js';

/**
 * Initialise les écouteurs d'événements globaux.
 */
export function initEventListeners() {
  // Filtre par catégorie
  document.querySelector('.category-filter').addEventListener('change', () => refreshInterface());

  // Toggle du panneau de filtrage avancé
  const advancedToggle = document.getElementById('advanced-filter-toggle');
  const advancedPanel = document.getElementById('advanced-filter-panel');

  advancedToggle.addEventListener('click', () => {
    advancedToggle.classList.toggle('active');
    advancedPanel.classList.toggle('show');
  });

  // Filtre de tri
  document.getElementById('sort-filter').addEventListener('change', async (e) => {
    const sortValue = e.target.value;
    updateSelectedSort(sortValue);

    // Sauvegarder le choix de tri dans les paramètres
    const settings = await loadSettings();
    settings.selectedSort = sortValue;
    await saveSettings();

    refreshInterface();
  });

  // Custom Genre Dropdown logic
  const dropdownBtn = document.getElementById('genre-dropdown-btn');
  const dropdownContent = document.getElementById('genre-dropdown-content');

  dropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownContent.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!dropdownContent.contains(e.target) && e.target !== dropdownBtn) {
      dropdownContent.classList.remove('show');
    }
  });

  window.toggleGenre = (genre) => {
    let newGenres = [...selectedGenres];
    if (newGenres.includes(genre)) {
      newGenres = newGenres.filter(g => g !== genre);
    } else {
      newGenres.push(genre);
    }
    updateSelectedGenres(newGenres);
    updateGenreDropdownButton();
    refreshInterface();
  };

  window.resetGenreSelection = () => {
    updateSelectedGenres([]);
    updateGenreDropdownButton();
    loadCache().then(cache => updateGenreDropdown(cache));
    refreshInterface();
  };

  function updateGenreDropdownButton() {
    if (selectedGenres.length === 0) {
      dropdownBtn.textContent = 'Genres';
    } else {
      dropdownBtn.textContent = `Genres (${selectedGenres.length})`;
    }
  }

  // Filtre par note dans le header
  const ratingFilterStars = document.querySelectorAll('#header-rating-filter .star');
  ratingFilterStars.forEach(star => {
    star.addEventListener('click', () => {
      const val = parseInt(star.dataset.value);
      if (selectedRating === val) {
        updateSelectedRating(0);
      } else {
        updateSelectedRating(val);
      }

      // Update UI
      ratingFilterStars.forEach(s => {
        const sVal = parseInt(s.dataset.value);
        s.classList.toggle('active', sVal <= selectedRating);
      });

      refreshInterface();
    });
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
    
    updateSelectedGenres([]);
    updateSelectedRating(0);
    updateSelectedSort('name_asc');

    // Reset stars UI
    document.querySelectorAll('#header-rating-filter .star').forEach(s => s.classList.remove('active'));

    // Reset dropdown UI
    updateGenreDropdownButton();
    loadCache().then(cache => updateGenreDropdown(cache));

    // Reset sort UI
    document.getElementById('sort-filter').value = 'name_asc';

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
