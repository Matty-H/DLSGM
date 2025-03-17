// État des filtres actuels
export let selectedGenres = [];

// Met à jour la liste des genres sélectionnés
export function updateSelectedGenres(newGenres) {
  // Vider le tableau existant
  selectedGenres.length = 0;
  // Ajouter les nouveaux genres
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
  
  // Filtrer par terme de recherche
  if (searchTerm && !gameName.toLowerCase().includes(searchTerm.toLowerCase())) {
    return false;
  }
  
  return true;
}
