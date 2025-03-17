const fs = require('fs');
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
import {cacheFilePath, globalCache, gamesFolderPath} from '../renderer.js';


// === CHARGEMENT DU CACHE ===
export function loadCache(cache) {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const cacheData = fs.readFileSync(cacheFilePath, 'utf8');
      cache = JSON.parse(cacheData);
      console.log('Cache chargé:', cache);
    } else {
      console.log('Aucun cache trouvé, création du cache...');
      fs.writeFileSync(cacheFilePath, JSON.stringify({}, null, 2));
    }
    return cache;
  } catch (error) {
    console.error('Erreur lors du chargement du cache:', error);
    fs.writeFileSync(cacheFilePath, JSON.stringify({}, null, 2));
  }
}


// === MISE À JOUR DU MENU DÉROULANT ===
export function updateCategoryDropdown() {
    const categories = collectAllCategories();
    const dropdown = document.getElementById('category-filter');
    
    // Conserver l'option "Toutes les catégories"
    dropdown.innerHTML = '<option value="all">Toutes les catégories</option>';
    
    // Ajouter uniquement les catégories présentes dans la bibliothèque
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.code;
      option.textContent = category.name;
      dropdown.appendChild(option);
    });
  }
  
  export function updateGenreDropdown() {
    const genres = collectAllGenres();
    const dropdown = document.getElementById('genre-filter');
  
    dropdown.innerHTML = ''; // On vide avant de remplir
    
    genres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre;
      dropdown.appendChild(option);
    });
  }
  
  // === FILTRAGE DES JEUX ===
  export function collectAllGenres() {
    const genreSet = new Set();
  
    Object.values(globalCache).forEach(game => {
      if (Array.isArray(game.genre)) {
        game.genre.forEach(genre => genreSet.add(genre));
      }
    });
  
    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }
  
  export function filterGames() {
    const selectedCategoryCode = document.getElementById('category-filter').value;
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const list = document.getElementById('games-list');
    
    // Vider la liste
    list.innerHTML = '';
    
    try {
      if (!fs.existsSync(gamesFolderPath)) {
        console.error('Le dossier SCAN n\'existe pas');
        list.innerHTML = '<p>Dossier SCAN introuvable. Veuillez créer le dossier SCAN sur votre bureau.</p>';
        return;
      }
  
      const files = fs.readdirSync(gamesFolderPath);
      const gameFolders = files.filter(file => /^RJ\d{6,9}$/.test(file));
  
      if (gameFolders.length === 0) {
        list.innerHTML = '<p>Aucun jeu trouvé dans SCAN.</p>';
        return;
      }
  
      // Filtrer et afficher les jeux
      gameFolders.forEach(folder => {
        const gameId = folder;
        
        // Vérifier si le jeu correspond aux critères de filtrage
        if (globalCache[gameId]) {
          const gameName = globalCache[gameId].work_name || gameId;
          const gameCategory = globalCache[gameId].category;
  
          // // Filtrer par genre si un ou plusieurs genres sont sélectionnés
          // if (selectedGenres.length > 0) {
          //   const gameGenres = globalCache[gameId].genre || [];
          //   const hasMatchingGenre = selectedGenres.some(genre => gameGenres.includes(genre));
          //   if (!hasMatchingGenre) {
          //     return; // Ce jeu n'a aucun des genres sélectionnés
          //   }
          // }
  
          // Filtrer par catégorie si une catégorie spécifique est sélectionnée
          if (selectedCategoryCode !== 'all' && gameCategory !== selectedCategoryCode) {
            return; // Ignorer ce jeu
          }
          
          // Filtrer par terme de recherche si présent
          if (searchTerm && !gameName.toLowerCase().includes(searchTerm)) {
            return; // Ignorer ce jeu
          }
          
          // Le jeu correspond aux critères, l'ajouter à l'affichage
          const gameDiv = document.createElement('div');
          gameDiv.className = 'game';
          
          // Récupération des données du jeu depuis le cache
          const gameCircle = globalCache[gameId] ? globalCache[gameId].circle : 'Inconnu';
          const gameCategoryLabel = categoryMap[gameCategory] || "Inconnu";
          const gameRating = globalCache[gameId] && globalCache[gameId].rating ? cache[gameId].rating : 0;
          
          // Ajouter l'image principale si disponible
          let gameImageHtml = '';
          if (globalCache[gameId] && globalCache[gameId].work_image) {
            const workImagePath = `img_cache/${gameId}/work_image.jpg`;
            gameImageHtml = `<img src="${workImagePath}" alt="${gameName}" class="game-thumbnail" onclick="window.showGameInfo('${gameId}')" />`;
          }
  
          // Générer les étoiles
          let ratingHtml = '<div class="rating" data-game-id="' + gameId + '">';
          for (let i = 1; i <= 5; i++) {
            ratingHtml += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${i <= gameRating ? 'gold' : 'gray'};">★</span>`;
          }
          ratingHtml += '</div>';
  
          gameDiv.innerHTML = `
            ${gameImageHtml}
            <div class="category-label">${gameCategoryLabel}</div>
              <div class="game_title">
                <h3>${gameName}</h3>
                <p>${gameCircle}</p>
              </div>
              ${ratingHtml}
              <div class="game-actions">
                <button onclick="window.launchGame('${folder}')">
                  ▶ Lancer le jeu
                </button>
            </div>
          `;
          
          list.appendChild(gameDiv);
        }
      });
  
      // Ajouter les écouteurs d'événements pour la notation
      document.querySelectorAll('.rating .star').forEach(star => {
        star.addEventListener('click', function() {
          const gameId = this.parentNode.getAttribute('data-game-id');
          const rating = parseInt(this.getAttribute('data-value'));
          globalCache[gameId].rating = rating;
          fs.writeFileSync(globalCache, JSON.stringify(globalCache, null, 2));
          filterGames(); // Mettre à jour l'affichage au lieu de scanGames
        });
      });
  
      // Afficher un message si aucun jeu ne correspond aux critères
      if (list.children.length === 0) {
        list.innerHTML = '<p>Aucun jeu ne correspond aux critères de recherche.</p>';
      }
    } catch (error) {
      console.error('Erreur lors du filtrage des jeux:', error);
      list.innerHTML = '<p>Erreur lors du filtrage des jeux.</p>';
    }
  }

  // === COLLECTE DES CATÉGORIES PRÉSENTES DANS LE CACHE ===
  function collectAllCategories() {
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