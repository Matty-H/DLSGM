import { scanGames } from './gameScanner.js';
import { filterGames } from './uiUpdater.js';
import { updateSelectedGenres} from './filterManager.js';

// Initialise tous les écouteurs d'événements de l'interface utilisateur
export function initEventListeners() {
  // Filtre par catégorie
  document.getElementById('category-filter').addEventListener('change', filterGames);
  
  // Filtre par genre (multi-select)
  document.getElementById('genre-filter').addEventListener('change', function() {
    const selectedOptions = Array.from(this.selectedOptions);
    const newGenres = selectedOptions.map(opt => opt.value);
    updateSelectedGenres(newGenres);
    filterGames();
  });
  
  // Recherche avec délai
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterGames, 300);
  });

  // Réinitialisation des filtres
  document.getElementById('reset-filters').addEventListener('click', function() {
    // Réinitialiser les sélections
    console.log('prout')
    document.getElementById("game-info").classList.remove("show");
    document.getElementById('category-filter').value = 'all';
    
    // Réinitialiser multi-select de genres
    const genreSelect = document.getElementById('genre-filter');
    Array.from(genreSelect.options).forEach(option => {
      option.selected = false;
    });
    
    // Vider la barre de recherche
    document.getElementById('search-input').value = '';
    
    // Réinitialiser les variables de filtrage
    updateSelectedGenres([]);
    
    // Rafraîchir l'affichage
    filterGames();
  });
  
  // Bouton de scan
  document.getElementById('scan-button')?.addEventListener('click', scanGames);
}
