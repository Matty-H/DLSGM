const fs = require('fs');
import { collectAllCategories, collectAllGenres, categoryMap } from './metadataManager.js';
import { matchesFilters, selectedGenres } from './filterManager.js';
import { saveCache, loadCache } from './cacheManager.js';
import { gamesFolderPath } from './osHandler.js';
import { globalCache } from '../renderer.js';


// Met à jour le menu déroulant des catégories
export function updateCategoryDropdown(globalCache) {
  const categories = collectAllCategories(globalCache);
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

// Met à jour le menu déroulant des genres
export function updateGenreDropdown(globalCache) {
  const genres = collectAllGenres(globalCache);
  const dropdown = document.getElementById('genre-filter');

  dropdown.innerHTML = ''; // On vide avant de remplir
  
  genres.forEach(genre => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    dropdown.appendChild(option);
  });
}

// Filtre et affiche les jeux selon les critères actuels
export function filterGames() {
  const cache = loadCache();
  console.log('XXXXXXXXXX')
  console.log("Filtrage des jeux avec genres:", selectedGenres);
  console.log("globalCache :", cache);
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
    const gameFolders = files.filter(file => /^[A-Z]{2}\d{6,9}$/.test(file));;
    
    if (gameFolders.length === 0) {
      list.innerHTML = '<p>Aucun jeu trouvé dans SCAN.</p>';
      return;
    }
    
    // Filtrer et afficher les jeux
    gameFolders.forEach(folder => {
      const gameId = folder;
      // console.log(String(cache) + " : " + String(gameId))
      
      // Vérifier si le jeu existe dans le cache
      if (cache[gameId]) {
        const gameData = cache[gameId];
        
        // Vérifier si le jeu correspond aux critères de filtrage
        if (matchesFilters(gameData, selectedCategoryCode, searchTerm)) {
          // Créer et ajouter l'élément du jeu à la liste
          const gameElement = createGameElement(gameId, gameData);
          list.appendChild(gameElement);
        }
      }
    });

    // Ajouter les écouteurs d'événements pour la notation
    attachRatingEventListeners();

    // Afficher un message si aucun jeu ne correspond aux critères
    if (list.children.length === 0) {
      list.innerHTML = '<p>Aucun jeu ne correspond aux critères de recherche.</p>';
    }
  } catch (error) {
    console.error('Erreur lors du filtrage des jeux:', error);
    list.innerHTML = '<p>Erreur lors du filtrage des jeux.</p>';
  }
}

// Crée l'élément HTML pour un jeu
function createGameElement(gameId, gameData) {
  const gameDiv = document.createElement('div');
  gameDiv.className = 'game';
  const gameName = gameData.work_name || gameId;
  const gameCircle = gameData.circle || 'Inconnu';
  const gameCategory = gameData.category;
  const gameCategoryLabel = categoryMap[gameCategory] || "Inconnu";
  const gameRating = gameData.rating || 0;
  
  // Récupérer les données de temps de jeu depuis le cache
  const totalPlayTime = gameData.totalPlayTime || 0;
  const lastPlayed = gameData.lastPlayed || null;
  
  // Formatter le temps de jeu total
  let playTimeText = 'Jamais joué';
  if (totalPlayTime > 0) {
    if (totalPlayTime < 60) {
      playTimeText = `${totalPlayTime} secondes`;
    } else if (totalPlayTime < 3600) {
      const minutes = Math.floor(totalPlayTime / 60);
      playTimeText = `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(totalPlayTime / 3600);
      playTimeText = `${hours} heure${hours > 1 ? 's' : ''}`;
    }
  }
  
  // Formatter la dernière fois jouée
  let lastPlayedText = '';
  if (lastPlayed) {
    const lastPlayedDate = new Date(lastPlayed);
    const now = new Date();
    const diffTime = Math.abs(now - lastPlayedDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    
    if (diffDays > 0) {
      lastPlayedText = `il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      lastPlayedText = `il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    } else if (diffMinutes > 0) {
      lastPlayedText = `il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    } else {
      lastPlayedText = 'à l\'instant';
    }
  }
  
  // Ajouter l'image principale si disponible
  let gameImageHtml = '';
if (gameData.work_image) {
  const workImagePath = `img_cache/${gameId}/work_image.jpg`;
  gameImageHtml = `
    <div class="game-container">
      <img src="${workImagePath}" alt="${gameName}" class="game-thumbnail" onclick="window.showGameInfo('${gameId}')" />
      ${totalPlayTime > 0 || lastPlayed ? `
        <div class="play-time-info">
          <div class="total-time">Temps de jeu: ${playTimeText}</div>
          ${lastPlayed ? `<div class="last-played">Dernier lancement: ${lastPlayedText}</div>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}
  
  // Générer les étoiles
  let ratingHtml = '<div class="rating" data-game-id="' + gameId + '">';
  for (let i = 1; i <= 5; i++) {
    ratingHtml += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${i <= gameRating ? 'gold' : 'gray'};">★</span>`;
  }
  ratingHtml += '</div>';
  
  // Créer l'encart de temps de jeu (seulement s'il y a des données)
  let playTimeHtml = '';
  if (totalPlayTime > 0 || lastPlayed) {
    playTimeHtml = `
      <div class="play-time-info">
        <div class="total-time">Temps de jeu: ${playTimeText}</div>
        ${lastPlayed ? `<div class="last-played">Dernier lancement: ${lastPlayedText}</div>` : ''}
      </div>
    `;
  }
  
  gameDiv.innerHTML = `
  ${gameImageHtml}
  <div class="category-label">${gameCategoryLabel}</div>
  <div class="game_title">
    <h3>${gameName}</h3>
    <p>${gameCircle}</p>
  </div>
  ${ratingHtml}
  <div class="game-actions">
    <button onclick="window.launchGame('${gameId}')">
      ▶ Lancer le jeu
    </button>
  </div>
`;
  
  return gameDiv;
}

// Attache les écouteurs d'événements pour la notation par étoiles
function attachRatingEventListeners() {
  document.querySelectorAll('.rating .star').forEach(star => {
    star.addEventListener('click', function() {
      const gameId = this.parentNode.getAttribute('data-game-id');
      const rating = parseInt(this.getAttribute('data-value'));
      
      // Mettre à jour la note dans le cache
      globalCache[gameId].rating = rating;
      saveCache(globalCache);
      
      // Mettre à jour l'affichage des étoiles
      const stars = this.parentNode.querySelectorAll('.star');
      stars.forEach((s, index) => {
        s.style.color = index < rating ? 'gold' : 'gray';
      });
    });
  });
}
