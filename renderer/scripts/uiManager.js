const fs = require('fs');
import { collectAllCategories, collectAllGenres, categoryMap } from './metadataManager.js';
import { matchesFilters } from './filterManager.js';
import { saveCache, loadCache } from './cacheManager.js';
import { getGamesFolderPath } from './osHandler.js';
import { formatPlayTime, formatLastPlayed } from './timeFormatter.js';

// === STATE MANAGEMENT ===
export let isAnyGameRunning = false;
export const runningGames = new Set();

// === DROPDOWNS MANAGEMENT ===
export function updateCategoryDropdown(cache) {
  const categories = collectAllCategories(cache);
  const dropdown = document.querySelector('.category-filter');
  
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

export function updateGenreDropdown(cache) {
  const genres = collectAllGenres(cache);
  const dropdown = document.querySelector('.genre-filter');

  dropdown.innerHTML = ''; // On vide avant de remplir
  
  genres.forEach(genre => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    dropdown.appendChild(option);
  });
}

// === GAME RUNNING STATE ===
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

// === MAIN INTERFACE REFRESH ===
export function refreshInterface(globalCache) {
  const cache = globalCache || loadCache();
  const selectedCategoryCode = document.querySelector('.category-filter').value;
  const searchTerm = document.querySelector('.search-input').value.toLowerCase();
  const list = document.querySelector('.games-list');
  
  list.innerHTML = '';
  
  try {
    const gamesFolderPath = getGamesFolderPath();
    
    if (!gamesFolderPath || !fs.existsSync(gamesFolderPath)) {
      list.innerHTML = '<p>Dossier de jeux introuvable. Veuillez configurer le dossier dans les paramètres.</p>';
      return;
    }
    
    const files = fs.readdirSync(gamesFolderPath);
    const gameFolders = files.filter(file => /^[A-Z]{2}\d{6,9}$/.test(file));
    
    if (gameFolders.length === 0) {
      list.innerHTML = '<p>Aucun jeu trouvé dans le dossier configuré.</p>';
      return;
    }
    
    let matchCount = 0;
    
    gameFolders.forEach(folder => {
      const gameId = folder;
      
      if (cache[gameId]) {
        const gameData = cache[gameId];
        
        if (matchesFilters(gameData, selectedCategoryCode, searchTerm)) {
          const gameElement = createGameElement(gameId, gameData);
          list.appendChild(gameElement);
          matchCount++;
        }
      }
    });

    // Attacher les événements après avoir généré la liste complète
    attachRatingEventListeners(cache);
    
    // Mettre à jour l'état de tous les boutons
    updateAllGameButtons();

    if (matchCount === 0) {
      list.innerHTML = '<p>Aucun jeu ne correspond aux critères de recherche.</p>';
    }
  } catch (error) {
    console.error('Erreur lors du filtrage des jeux:', error);
    list.innerHTML = `<p>Erreur lors du filtrage des jeux: ${error.message}</p>`;
  }
}

// === GAME ELEMENT CREATION ===
function createGameElement(gameId, gameData) {
  const gameDiv = document.createElement('div');
  gameDiv.className = 'game';
  
  // Récupération des données du jeu
  const gameName = gameData.work_name || gameId;
  const gameCircle = gameData.circle || gameData.author || 'Inconnu';
  const gameCategory = gameData.category;
  const gameCategoryLabel = categoryMap[gameCategory] || "Inconnu";
  const gameRating = gameData.rating || 0;
  const totalPlayTime = gameData.totalPlayTime || 0;
  const lastPlayed = gameData.lastPlayed || null;
  
  // Formatage des informations de temps
  const playTimeText = formatPlayTime(totalPlayTime);
  const lastPlayedText = formatLastPlayed(lastPlayed);
  
  // Gestion de l'image du jeu
  const gameImageHtml = createGameImageHtml(gameId, gameName, totalPlayTime, playTimeText, lastPlayed, lastPlayedText, gameData);  
  
  // Génération des étoiles de notation
  const ratingHtml = createRatingHtml(gameId, gameRating);
  
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

function createGameImageHtml(gameId, gameName, totalPlayTime, playTimeText, lastPlayed, lastPlayedText, gameData) {
  if (!gameData || !gameData.work_image) {
    return '';
  }
  
  const workImagePath = `img_cache/${gameId}/work_image.jpg`;
  return `
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

function createRatingHtml(gameId, gameRating) {
  let ratingHtml = '<div class="rating" data-game-id="' + gameId + '">';
  for (let i = 1; i <= 5; i++) {
    ratingHtml += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${i <= gameRating ? 'gold' : 'gray'};">★</span>`;
  }
  ratingHtml += '</div>';
  return ratingHtml;
}

// === EVENT HANDLERS ===
function attachRatingEventListeners(cache) {
  document.querySelectorAll('.rating .star').forEach(star => {
    star.addEventListener('click', function() {
      const gameId = this.parentNode.getAttribute('data-game-id');
      const rating = parseInt(this.getAttribute('data-value'));
      
      if (cache[gameId]) {
        cache[gameId].rating = rating;
        saveCache(cache);
        
        const stars = this.parentNode.querySelectorAll('.star');
        stars.forEach((s, index) => {
          s.style.color = index < rating ? 'gold' : 'gray';
        });
      }
    });
  });
}