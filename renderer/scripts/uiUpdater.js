const fs = require('fs');
import { collectAllCategories, collectAllGenres, categoryMap } from './metadataManager.js';
import { matchesFilters } from './filterManager.js';
import { saveCache, loadCache } from './cacheManager.js';
import { gamesFolderPath } from './osHandler.js';
import { globalCache } from '../renderer.js';

// Garder trace des jeux en cours d'exécution
export let isAnyGameRunning = false;
export const runningGames = new Set();

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

export function updateTagDropdown(globalCache) {
  const allCustomTags = new Set();

  // Parcours pour récupérer tous les tags existants
  Object.values(globalCache).forEach(game => {
    (game.customTags || []).forEach(tag => allCustomTags.add(tag));
  });

  const container = document.getElementById('custom-tags-options');
  // container.innerHTML = '';

  allCustomTags.forEach(tag => {
    const tagElement = document.createElement('span');
    tagElement.classList.add('custom-tag-filter');
    tagElement.textContent = tag;

    tagElement.addEventListener('click', () => {
      // Sélection/désélection
      if (selectedCustomTags.includes(tag)) {
        updateSelectedCustomTags(selectedCustomTags.filter(t => t !== tag));
        tagElement.classList.remove('selected');
      } else {
        updateSelectedCustomTags([...selectedCustomTags, tag]);
        tagElement.classList.add('selected');
      }

      // Met à jour la liste des jeux affichés en fonction des filtres
      filterGames();
    });

    container.appendChild(tagElement);
  });
}


// Marque un jeu comme en cours d'exécution
export function setGameRunning(gameId, isRunning) {
  if (isRunning) {
    runningGames.add(gameId);
    isAnyGameRunning = true;
  } else {
    runningGames.delete(gameId);
    isAnyGameRunning = runningGames.size > 0;
  }
  
  // Mettre à jour tous les boutons
  updateAllGameButtons();
}

// Met à jour l'état de tous les boutons de jeu
function updateAllGameButtons() {
  const allButtons = document.querySelectorAll('.game-actions button');
  
  allButtons.forEach(button => {
    const gameId = button.getAttribute('data-game-id');
    const isThisGameRunning = runningGames.has(gameId);
    
    if (isAnyGameRunning) {
      // Si un jeu est en cours, désactiver tous les boutons
      button.disabled = true;
      button.classList.add('disabled');
      
      // Afficher "En cours" seulement pour le jeu qui est lancé
      if (isThisGameRunning) {
        button.innerHTML = '⏳ En cours';
      } else {
        button.innerHTML = '▶ Lancer le jeu';
      }
    } else {
      // Aucun jeu en cours, activer tous les boutons
      button.disabled = false;
      button.classList.remove('disabled');
      button.innerHTML = '▶ Lancer le jeu';
    }
  });
}

export function filterGames() {
  const cache = loadCache();
  const selectedCategoryCode = document.getElementById('category-filter').value;
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const list = document.getElementById('games-list');
  
  list.innerHTML = '';
  
  try {
    if (!fs.existsSync(gamesFolderPath)) {
      list.innerHTML = '<p>Dossier SCAN introuvable. Veuillez créer le dossier SCAN sur votre bureau.</p>';
      return;
    }
    
    const files = fs.readdirSync(gamesFolderPath);
    const gameFolders = files.filter(file => /^[A-Z]{2}\d{6,9}$/.test(file));
    
    if (gameFolders.length === 0) {
      list.innerHTML = '<p>Aucun jeu trouvé dans SCAN.</p>';
      return;
    }
    
    gameFolders.forEach(folder => {
      const gameId = folder;
      
      if (cache[gameId]) {
        const gameData = cache[gameId];
        
        if (matchesFilters(gameData, selectedCategoryCode, searchTerm)) {
          const gameElement = createGameElement(gameId, gameData);
          list.appendChild(gameElement);
        }
      }
    });

    attachRatingEventListeners();
    
    // Mettre à jour l'état de tous les boutons après avoir généré la liste
    updateAllGameButtons();

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
  
  // Vérifier si ce jeu est en cours d'exécution
  const isThisGameRunning = runningGames.has(gameId);
  const buttonText = isThisGameRunning ? '⏳ En cours' : '▶ Lancer le jeu';
  const buttonClass = isAnyGameRunning ? 'disabled' : '';
  const buttonDisabled = isAnyGameRunning ? 'disabled' : '';
  
  gameDiv.innerHTML = `
  ${gameImageHtml}
  <div class="category-label">${gameCategoryLabel}</div>
  <div class="game_title">
    <h3>${gameName}</h3>
    <p>${gameCircle}</p>
  </div>
  ${ratingHtml}
  <div class="game-actions">
    <button onclick="window.launchGame('${gameId}')" data-game-id="${gameId}" class="${buttonClass}" ${buttonDisabled}>
      ${buttonText}
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
      
      globalCache[gameId].rating = rating;
      saveCache(globalCache);
      
      const stars = this.parentNode.querySelectorAll('.star');
      stars.forEach((s, index) => {
        s.style.color = index < rating ? 'gold' : 'gray';
      });
    });
  });
}
