/**
 * Gère l'interface utilisateur (DOM, affichage de la liste des jeux, filtres).
 */

import { collectAllCategories, collectAllGenres, categoryMap } from './metadataManager.js';
import { matchesFilters } from './filterManager.js';
import { saveCache, loadCache } from './cacheManager.js';
import { getGamesFolderPath } from './osHandler.js';
import { formatPlayTime, formatLastPlayed } from './timeFormatter.js';
import { PLACEHOLDER_IMAGE } from './constants.js';

// État global du cycle de vie des jeux
export let isAnyGameRunning = false;
export const runningGames = new Set();

/**
 * Met à jour le menu déroulant des catégories.
 */
export function updateCategoryDropdown(cache) {
  const categoryList = collectAllCategories(cache);
  const categoryDropdown = document.querySelector('.category-filter');
  
  categoryDropdown.innerHTML = '<option value="all">Trier par</option>';
  
  categoryList.forEach(({ code, name }) => {
    const optionElement = document.createElement('option');
    optionElement.value = code;
    optionElement.textContent = name;
    categoryDropdown.appendChild(optionElement);
  });
}

/**
 * Met à jour le menu déroulant des genres.
 */
export function updateGenreDropdown(cache) {
  const genres = collectAllGenres(cache);
  const dropdown = document.querySelector('.genre-filter');

  dropdown.innerHTML = '';
  
  genres.forEach(genre => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    dropdown.appendChild(option);
  });
}

/**
 * Définit l'état d'exécution d'un jeu.
 */
export function setGameRunning(gameId, isRunning) {
  if (isRunning) {
    runningGames.add(gameId);
    isAnyGameRunning = true;
  } else {
    runningGames.delete(gameId);
    isAnyGameRunning = runningGames.size > 0;
  }
  
  updateAllGameButtons();
}

/**
 * Rafraîchit l'interface principale.
 */
export async function refreshInterface() {
  const cache = await loadCache();
  const selectedCategoryCode = document.querySelector('.category-filter').value;
  const searchTerm = document.querySelector('.search-input').value.toLowerCase();
  const list = document.querySelector('.games-list');
  
  list.innerHTML = '<div class="loading">Chargement...</div>';
  
  try {
    const gamesFolderPath = await getGamesFolderPath();
    
    if (!gamesFolderPath || !(await window.electronAPI.fsExists(gamesFolderPath))) {
      list.innerHTML = '<p>Dossier de jeux introuvable. Veuillez le configurer dans les paramètres.</p>';
      return;
    }
    
    const gameFolders = await window.electronAPI.listGameFolders(gamesFolderPath);
    
    if (gameFolders.length === 0) {
      list.innerHTML = '<p>Aucun jeu trouvé dans le dossier configuré.</p>';
      return;
    }
    
    list.innerHTML = '';
    let matchCount = 0;
    
    const userDataPath = await window.electronAPI.getUserDataPath();

    const gameElements = await Promise.all(gameFolders.map(async (folder) => {
      const gameId = folder;
      if (cache[gameId]) {
        const gameData = cache[gameId];
        if (matchesFilters(gameData, selectedCategoryCode, searchTerm)) {
          return await createGameElement(gameId, gameData, userDataPath);
        }
      }
      return null;
    }));

    gameElements.forEach(el => {
      if (el) {
        list.appendChild(el);
        matchCount++;
      }
    });

    attachRatingEventListeners(cache);
    updateAllGameButtons();

    if (matchCount === 0) {
      list.innerHTML = '<p>Aucun jeu ne correspond aux critères de recherche.</p>';
    }
  } catch (error) {
    console.error('Erreur lors du rafraîchissement de l\'interface:', error);
    list.innerHTML = `<p>Erreur lors du chargement des jeux : ${error.message}</p>`;
  }
}

/**
 * Crée un élément de jeu pour la liste.
 */
async function createGameElement(gameId, gameData, userDataPath) {
  const gameDiv = document.createElement('div');
  gameDiv.className = 'game';
  
  const gameName = gameData.work_name || gameId;
  const gameCategory = gameData.category;
  const gameCategoryLabel = categoryMap[gameCategory] || "Inconnu";
  const gameRating = gameData.rating || 0;
  const totalPlayTime = gameData.totalPlayTime || 0;
  
  const playTimeText = formatPlayTime(totalPlayTime);
  
  // Utilisation du chemin absolu pour les images (nécessite l'autorisation de fichiers locaux dans Electron)
  const imgPath = await window.electronAPI.pathJoin(userDataPath, 'img_cache', gameId, 'work_image.jpg');
  // Pour charger une image locale avec contextIsolation, on utilise souvent un protocole personnalisé.
  // Ici on va essayer avec file:// si autorisé, ou on passera par une URL atomique plus tard.
  const workImagePath = `atom:///${imgPath.replace(/\\/g, '/')}`;
  
  const customTags = gameData.customTags || [];
  const customTagsHtml = customTags.length > 0 
    ? `<div class="custom-tags">
        ${customTags.map(tag => `<span class="custom-tag">${tag}</span>`).join('')}
       </div>` 
    : '';
  
  const isThisGameRunning = runningGames.has(gameId);
  const buttonText = isThisGameRunning ? '⏳' : '▶';
  const buttonClass = (isAnyGameRunning && !isThisGameRunning) ? 'disabled' : '';

  const errorBadge = gameData.fetchFailed
    ? `<div class="error-badge" title="${gameData.error || 'Erreur inconnue'}">⚠️ Erreur</div>`
    : '';
  
  gameDiv.innerHTML = `
    <div class="game-container">
      ${errorBadge}
      <img src="${workImagePath}" alt="${gameName}" class="game-thumbnail" onclick="window.showGameInfo('${gameId}')"
           onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}';" />
    </div>
    <div class="game-actions">
      <div class="action-container">
        <button onclick="window.launchGame('${gameId}')" data-game-id="${gameId}" class="play-button ${buttonClass}">
          ${buttonText}
        </button>
      </div>
    </div>
    <div class="category-label">${gameCategoryLabel}</div>
    ${customTagsHtml}
    <div class="rating-container">
      ${totalPlayTime > 0 ? `<div class="total-time">⏳ ${playTimeText}</div>` : ''}
      ${createRatingHtml(gameId, gameRating)}
    </div>
  `;
  
  return gameDiv;
 }

/**
 * Met à jour l'état de tous les boutons de lancement.
 */
function updateAllGameButtons() {
  const allButtons = document.querySelectorAll('.game-actions button');
  
  allButtons.forEach(button => {
    const gameId = button.getAttribute('data-game-id');
    const isThisGameRunning = runningGames.has(gameId);
    
    if (isAnyGameRunning) {
      if (!isThisGameRunning) {
        button.disabled = true;
        button.classList.add('disabled');
        button.innerHTML = '▶';
      } else {
        button.innerHTML = '⏳';
      }
    } else {
      button.disabled = false;
      button.classList.remove('disabled');
      button.innerHTML = '▶';
    }
  });
}

function createRatingHtml(gameId, gameRating) {
  let ratingHtml = `<div class="rating" data-game-id="${gameId}">`;
  for (let i = 1; i <= 5; i++) {
    ratingHtml += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${i <= gameRating ? 'crimson' : 'gray'};">★</span>`;
  }
  ratingHtml += '</div>';
  return ratingHtml;
}

/**
 * Attache les gestionnaires d'événements pour les notes.
 */
function attachRatingEventListeners(cache) {
  document.querySelectorAll('.rating .star').forEach(star => {
    star.addEventListener('click', async function() {
      const gameId = this.parentNode.getAttribute('data-game-id');
      const rating = parseInt(this.getAttribute('data-value'));
      
      if (cache[gameId]) {
        cache[gameId].rating = rating;
        await saveCache(cache);
        
        const stars = this.parentNode.querySelectorAll('.star');
        stars.forEach((s, index) => {
          s.style.color = index < rating ? 'crimson' : 'gray';
        });
      }
    });
  });
}
