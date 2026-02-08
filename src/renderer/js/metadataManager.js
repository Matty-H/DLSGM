/**
 * Gère les métadonnées des jeux et les catégories.
 */

// Correspondance des codes de catégories DLSite et leurs noms d'affichage
export const categoryMap = {
  "ACN": "Action",
  "ADV": "Aventure",
  "QIZ": "Quiz",
  "ICG": "CG/Illustrations",
  "DNV": "Roman Numérique",
  "SCM": "Gekiga",
  "IMT": "Matériel d'Illustration",
  "MNG": "Manga",
  "ET3": "Divers",
  "ETC": "Jeu Divers",
  "MUS": "Musique",
  "AMT": "Matériel Musical",
  "NRE": "Roman",
  "PZL": "Puzzle",
  "RPG": "Jeu de Rôle (RPG)",
  "STG": "Shooting",
  "SLN": "Simulation",
  "TBL": "Table",
  "TOL": "Outils/Accessoires",
  "TYP": "Dactylographie",
  "MOV": "Vidéo",
  "SOU": "Voix/ASMR",
  "VCM": "Bande Dessinée Audio",
  "WBT": "Webtoon"
};

/**
 * Collecte toutes les catégories présentes dans le cache global.
 */
export function collectAllCategories(globalCache) {
  const uniqueCategoryCodes = new Set();
  
  Object.values(globalCache).forEach(game => {
    if (game.category) {
      uniqueCategoryCodes.add(game.category);
    }
  });
  
  const categories = Array.from(uniqueCategoryCodes).map(code => ({
    code,
    name: categoryMap[code] || code
  }));
  
  categories.sort((a, b) => a.name.localeCompare(b.name));
  
  return categories;
}

/**
 * Collecte tous les genres présents dans le cache global.
 */
export function collectAllGenres(globalCache) {
  const genreSet = new Set();

  Object.values(globalCache).forEach(game => {
    if (Array.isArray(game.genre)) {
      game.genre.forEach(genre => genreSet.add(genre));
    }
  });

  return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
}
