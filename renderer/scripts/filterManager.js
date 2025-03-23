// État des filtres actuels
export let selectedGenres = [];
export let selectedCustomTags = [];

export function updateSelectedCustomTags(newTags) {
  selectedCustomTags.length = 0;
  newTags.forEach(tag => selectedCustomTags.push(tag));
}

// Met à jour la liste des genres sélectionnés
export function updateSelectedGenres(newGenres) {
  selectedGenres.length = 0;
  newGenres.forEach(genre => selectedGenres.push(genre));
}

// Détermine si un jeu correspond aux critères de filtrage actuels
export function matchesFilters(game, selectedCategoryCode, searchTerm) {
  // Vérifier si le jeu a un nom
  const gameName = game.work_name || '';
    
  // Filtrer par genre si des genres sont sélectionnés
  if (selectedGenres.length > 0) {
    const gameGenres = game.genre || [];
    const hasMatchingGenre = selectedGenres.some(genre => 
      gameGenres.includes(genre)
    );
    if (!hasMatchingGenre) return false;
  }

  // Filtrer par catégorie si une catégorie est sélectionnée
  if (selectedCategoryCode !== 'all' && game.category !== selectedCategoryCode) {
    return false;
  }
  
  // Filtrer par terme de recherche (dans le nom, le cercle, les tags personnalisés ou l'auteur)
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
