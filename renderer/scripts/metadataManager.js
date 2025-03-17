const fs = require('fs');

// Mapping des catégories et leur nom d'affichage
export const categoryMap = {
  "ACN": "Action",
  "ADV": "Adventure",
  "QIZ": "Quiz",
  "ICG": "CG/Illustrations",
  "DNV": "Digital Novel",
  "SCM": "Gekiga",
  "IMT": "Illustration Materials",
  "MNG": "Manga",
  "ET3": "Miscellaneous",
  "ETC": "Miscellaneous Game",
  "MUS": "Music",
  "AMT": "Music Materials",
  "NRE": "Novel",
  "PZL": "Puzzle",
  "RPG": "Role Playing",
  "STG": "Shooting",
  "SLN": "Simulation",
  "TBL": "Table",
  "TOL": "Tools/Accessories",
  "TYP": "Typing",
  "MOV": "Video",
  "SOU": "Voice/ASMR",
  "VCM": "Voiced Comic",
  "WBT": "Webtoon"
};

// Collecte toutes les catégories présentes dans la bibliothèque
export function collectAllCategories(globalCache) {
  const uniqueCategoryCodes = new Set();
  
  // Parcourir tous les jeux dans le cache et collecter les codes de catégorie utilisés
  Object.values(globalCache).forEach(game => {
    if (game.category) {
      uniqueCategoryCodes.add(game.category);
    }
  });
  
  // Convertir en tableau d'objets avec code et nom
  const categories = Array.from(uniqueCategoryCodes).map(code => ({
    code,
    name: categoryMap[code] || code // Utiliser le nom du mapping ou le code si pas de mapping
  }));
  
  // Trier par nom de catégorie
  categories.sort((a, b) => a.name.localeCompare(b.name));
  
  return categories;
}

// Collecte tous les genres présents dans la bibliothèque
export function collectAllGenres(globalCache) {
  const genreSet = new Set();

  Object.values(globalCache).forEach(game => {
    if (Array.isArray(game.genre)) {
      game.genre.forEach(genre => genreSet.add(genre));
    }
  });

  return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
}
