/**
 * Gère le filtrage de la liste des jeux.
 */

// État des filtres actuels
export let selectedGenres = [];
export let selectedCustomTags = [];
export let selectedRating = 0;
export let selectedSort = 'name_asc';

/**
 * Initialise les filtres depuis les paramètres.
 */
export function initFiltersFromSettings(settings) {
  if (settings.selectedSort) {
    selectedSort = settings.selectedSort;
  }
}

/**
 * Met à jour le tri sélectionné.
 */
export function updateSelectedSort(sort) {
  selectedSort = sort;
}

/**
 * Met à jour la note sélectionnée.
 */
export function updateSelectedRating(rating) {
  selectedRating = rating;
}

/**
 * Met à jour les tags personnalisés sélectionnés.
 */
export function updateSelectedCustomTags(newTags) {
  selectedCustomTags.length = 0;
  newTags.forEach(tag => selectedCustomTags.push(tag));
}

/**
 * Met à jour les genres sélectionnés.
 */
export function updateSelectedGenres(newGenres) {
  selectedGenres.length = 0;
  newGenres.forEach(genre => selectedGenres.push(genre));
}

/**
 * Détermine si un jeu correspond aux critères de filtrage actuels.
 */
export function matchesFilters(game, selectedCategoryCode, searchTerm) {
  const gameName = game.work_name || '';

  // Filtrage par note (si sélectionné)
  if (selectedRating > 0) {
    const gameRating = game.rating || 0;
    if (gameRating !== selectedRating) return false;
  }
    
  // Filtrage par genre (si sélectionné)
  if (selectedGenres.length > 0) {
    const gameGenres = game.genre || [];
    const hasMatchingGenre = selectedGenres.some(genre => 
      gameGenres.includes(genre)
    );
    if (!hasMatchingGenre) return false;
  }

  // Filtrage par catégorie
  if (selectedCategoryCode !== 'all' && game.category !== selectedCategoryCode) {
    return false;
  }
  
  // Filtrage par terme de recherche (nom, cercle, auteur, tags)
  if (searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();

    const nameMatches = gameName.toLowerCase().includes(lowerSearchTerm);
    const circleMatches = (game.circle || '').toLowerCase().includes(lowerSearchTerm);
    const authorMatches = String(game.author || '').toLowerCase().includes(lowerSearchTerm);
    const customTags = game.customTags || [];
    const tagsMatch = customTags.some(tag => tag.toLowerCase().includes(lowerSearchTerm));

    if (!nameMatches && !circleMatches && !tagsMatch && !authorMatches) {
      return false;
    }
  }
  
  return true;
}
