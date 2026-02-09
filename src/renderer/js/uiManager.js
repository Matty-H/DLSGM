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
export let displayedGameIds = [];

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
        case 'release_date_asc':
          const rdA_asc = a.data.release_date && a.data.release_date !== "N/A" ? new Date(a.data.release_date) : new Date(0);
          const rdB_asc = b.data.release_date && b.data.release_date !== "N/A" ? new Date(b.data.release_date) : new Date(0);
          return rdA_asc - rdB_asc;
        case 'release_date_desc':
          const rdA_desc = a.data.release_date && a.data.release_date !== "N/A" ? new Date(a.data.release_date) : new Date(0);
          const rdB_desc = b.data.release_date && b.data.release_date !== "N/A" ? new Date(b.data.release_date) : new Date(0);
          return rdB_desc - rdA_desc;
        default:
          return 0;
      }
    });

    displayedGameIds = filteredGames.map(g => g.id);

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
  
  // Déterminer la classe de couleur de catégorie
  let categoryClass = 'cat-other';
  const gameCats = ['RPG', 'ADV', 'PZL', 'STG', 'SLN', 'TBL', 'TYP', 'ACN', 'QIZ', 'ETC'];
  const mangaCats = ['MNG', 'SCM', 'WBT'];
  const voiceCats = ['SOU', 'VCM'];
  const videoCats = ['MOV'];
  const musicCats = ['MUS', 'AMT'];
  const imageCats = ['ICG', 'IMT'];
  const novelCats = ['NRE', 'DNV'];
  const toolCats = ['TOL'];

  if (gameCats.includes(gameCategory)) categoryClass = 'cat-game';
  else if (mangaCats.includes(gameCategory)) categoryClass = 'cat-manga';
  else if (voiceCats.includes(gameCategory)) categoryClass = 'cat-voice';
  else if (videoCats.includes(gameCategory)) categoryClass = 'cat-video';
  else if (musicCats.includes(gameCategory)) categoryClass = 'cat-music';
  else if (imageCats.includes(gameCategory)) categoryClass = 'cat-image';
  else if (novelCats.includes(gameCategory)) categoryClass = 'cat-novel';
  else if (toolCats.includes(gameCategory)) categoryClass = 'cat-tool';

  const gameRating = gameData.rating || 0;
  const totalPlayTime = gameData.totalPlayTime || 0;
  
  const playTimeText = formatPlayTime(totalPlayTime);
  
  const imgPath = await window.electronAPI.pathJoin(userDataPath, 'img_cache', gameId, 'work_image.jpg');
  const workImagePath = `atom:///${imgPath.replace(/\\/g, '/')}`;
  
  const isThisGameRunning = runningGames.has(gameId);
  const buttonText = isThisGameRunning ? '⏳' : '▶';
  const buttonClass = (isAnyGameRunning && !isThisGameRunning) ? 'disabled' : '';

  const errorBadge = gameData.fetchFailed 
    ? `<div class="error-badge" title="${gameData.error || 'Erreur inconnue'}">⚠️ Erreur</div>` 
    : '';
  
  const ratingHtml = gameRating > 0 ? createRatingHtml(gameId, gameRating, false) : '';

  gameDiv.setAttribute('data-game-id', gameId);
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
    <div class="game-meta-row">
      <div class="category-badge ${categoryClass}">${gameCategoryLabel}</div>
      ${totalPlayTime > 0 ? `<div class="compact-time">⏳ ${playTimeText}</div>` : '<div></div>'}
      ${ratingHtml ? `<div class="compact-rating">${gameRating}★</div>` : '<div></div>'}
    </div>
  `;
  
  return gameDiv;
 }

/**
 * Met à jour l'état de tous les boutons de lancement.
 */
export function updateAllGameButtons() {
  const allButtons = document.querySelectorAll('.game-actions button');
  const sidePanelBtn = document.querySelector('.side-panel-play-btn');
  
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

  if (sidePanelBtn) {
    const gameId = sidePanelBtn.getAttribute('data-game-id');
    const isThisGameRunning = runningGames.has(gameId);

    if (isAnyGameRunning) {
      if (!isThisGameRunning) {
        sidePanelBtn.disabled = true;
        sidePanelBtn.classList.add('disabled');
        sidePanelBtn.innerHTML = '▶ JOUER';
      } else {
        sidePanelBtn.innerHTML = '⏳ EN COURS...';
      }
    } else {
      sidePanelBtn.disabled = false;
      sidePanelBtn.classList.remove('disabled');
      sidePanelBtn.innerHTML = '▶ JOUER';
    }
  }
}

export function createRatingHtml(gameId, gameRating, interactive = true) {
  if (!interactive && gameRating > 0) {
    return `<div class="rating" data-game-id="${gameId}"></div>`; // Placeholder pour la logique compacte si besoin, mais on utilise compact-rating directement dans createGameElement
  }
  
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
