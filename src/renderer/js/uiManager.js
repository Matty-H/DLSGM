/**
 * Gère l'interface utilisateur (DOM, affichage de la liste des jeux, filtres).
 */

import { collectAllCategories, collectAllGenres, categoryMap } from './metadataManager.js';
import { matchesFilters, selectedGenres, selectedSort } from './filterManager.js';
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
 * Met à jour le menu déroulant des genres (custom dropdown).
 */
export function updateGenreDropdown(cache) {
  const genres = collectAllGenres(cache);
  const dropdownContent = document.getElementById('genre-dropdown-content');

  if (!dropdownContent) return;

  dropdownContent.innerHTML = '';
  
  // Ajouter l'option de réinitialisation
  const resetItem = document.createElement('div');
  resetItem.className = 'dropdown-item dropdown-reset';
  resetItem.textContent = 'Réinitialiser la sélection';
  resetItem.onclick = (e) => {
    e.stopPropagation();
    window.resetGenreSelection();
  };
  dropdownContent.appendChild(resetItem);

  genres.forEach(genre => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = genre;

    // On doit vérifier si le genre est déjà sélectionné
    if (selectedGenres.includes(genre)) {
        checkbox.checked = true;
    }

    checkbox.onclick = (e) => {
      e.stopPropagation();
      window.toggleGenre(genre);
    };

    item.onclick = (e) => {
      checkbox.checked = !checkbox.checked;
      window.toggleGenre(genre);
    };

    const label = document.createElement('span');
    label.textContent = genre;

    item.appendChild(checkbox);
    item.appendChild(label);
    dropdownContent.appendChild(item);
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
    
    const userDataPath = await window.electronAPI.getUserDataPath();

    // Filtrage des jeux
    const filteredGames = gameFolders
      .filter(gameId => cache[gameId])
      .map(gameId => ({ id: gameId, data: cache[gameId] }))
      .filter(game => matchesFilters(game.data, selectedCategoryCode, searchTerm));

    // Tri des jeux
    filteredGames.sort((a, b) => {
      const nameA = (a.data.work_name || a.id).toLowerCase();
      const nameB = (b.data.work_name || b.id).toLowerCase();

      switch (selectedSort) {
        case 'name_asc':
          return nameA.localeCompare(nameB);
        case 'name_desc':
          return nameB.localeCompare(nameA);
        case 'last_played':
          const lpA = a.data.lastPlayed ? new Date(a.data.lastPlayed) : new Date(0);
          const lpB = b.data.lastPlayed ? new Date(b.data.lastPlayed) : new Date(0);
          return lpB - lpA;
        case 'last_added':
          const adA = a.data.addedDate ? new Date(a.data.addedDate) : new Date(0);
          const adB = b.data.addedDate ? new Date(b.data.addedDate) : new Date(0);
          return adB - adA;
        default:
          return 0;
      }
    });

    const gameElements = await Promise.all(filteredGames.map(async (game) => {
      return await createGameElement(game.id, game.data, userDataPath);
    }));

    gameElements.forEach(el => {
      if (el) list.appendChild(el);
    });

    let matchCount = gameElements.length;

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
  
  const imgPath = await window.electronAPI.pathJoin(userDataPath, 'img_cache', gameId, 'work_image.jpg');
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
  
  const ratingHtml = gameRating > 0 ? createRatingHtml(gameId, gameRating, false) : '';

  gameDiv.innerHTML = `
    <div class="game-container">
      ${errorBadge}
      <img src="${workImagePath}" alt="${gameName}" class="game-thumbnail" onclick="window.showGameInfo('${gameId}')" 
           onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}';" />
      <div class="game-actions">
        <button onclick="window.launchGame('${gameId}')" data-game-id="${gameId}" class="play-button ${buttonClass}">
          ${buttonText}
        </button>
      </div>
    </div>
    <div class="category-label">${gameCategoryLabel}</div>
    ${customTagsHtml}
    <div class="rating-container">
      ${totalPlayTime > 0 ? `<div class="total-time">⏳ ${playTimeText}</div>` : ''}
      ${ratingHtml}
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

export function createRatingHtml(gameId, gameRating, interactive = true) {
  let ratingHtml = `<div class="rating ${interactive ? 'interactive-rating' : ''}" data-game-id="${gameId}">`;
  for (let i = 1; i <= 5; i++) {
    const color = i <= gameRating ? '#f1c40f' : '#444';
    const cursor = interactive ? 'pointer' : 'default';
    ratingHtml += `<span class="star" data-value="${i}" style="cursor: ${cursor}; color: ${color}; font-size: 1.2rem;">★</span>`;
  }
  ratingHtml += '</div>';
  return ratingHtml;
}

/**
 * Attache les gestionnaires d'événements pour les notes (pour le panneau latéral).
 */
export function attachRatingEventListeners(cache, container = document) {
  container.querySelectorAll('.interactive-rating .star').forEach(star => {
    star.addEventListener('click', async function() {
      const parent = this.parentNode;
      const gameId = parent.getAttribute('data-game-id');
      const rating = parseInt(this.getAttribute('data-value'));
      
      if (cache[gameId]) {
        cache[gameId].rating = rating;
        await saveCache(cache);
        
        const stars = parent.querySelectorAll('.star');
        stars.forEach((s, index) => {
          s.style.color = index < rating ? '#f1c40f' : '#444';
        });

        // Rafraîchir l'interface pour mettre à jour les étoiles sur les cartes
        refreshInterface();
      }
    });
  });
}
