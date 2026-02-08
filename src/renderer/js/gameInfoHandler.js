/**
 * Gère l'affichage des informations détaillées d'un jeu.
 */

import { attachGameInfoEventListeners } from './eventListeners.js';
import { updateCacheEntry, loadCache } from './cacheManager.js';
import { refreshInterface, createRatingHtml, attachRatingEventListeners } from './uiManager.js';
import { categoryMap } from './metadataManager.js';
import { PLACEHOLDER_IMAGE } from './constants.js';

/**
 * Affiche les informations détaillées d'un jeu spécifique.
 */
export async function showGameInfo(gameId) {
  const cache = await loadCache();
  const gameInfoDiv = document.querySelector('.game-info');
  const gameDetails = document.querySelector('.game-details');
  
  const metadata = cache[gameId];
  if (!metadata) {
    gameDetails.innerHTML = `<p>Informations non disponibles pour ${gameId}.</p>`;
    return;
  }

  if (metadata.fetchFailed) {
    gameDetails.innerHTML = `
      <div class="header-info">
        <button class="close-game-info">✖</button>
        <h3>${gameId}</h3>
        <p class="error-text">⚠️ Échec de la récupération des données.</p>
        <p><strong>Erreur :</strong> ${metadata.error || 'Inconnue'}</p>
        <button class="retry-fetch-btn">Réessayer</button>
      <button class="manual-edit-btn">Modifier manuellement</button>
      </div>
      <div class="action-buttons">
        <button class="open-folder-btn">Ouvrir le dossier</button>
      </div>
    `;
    gameInfoDiv.classList.add("show");
    attachGameInfoEventListeners(gameInfoDiv, gameId);
    
    document.querySelector('.retry-fetch-btn').addEventListener('click', async () => {
      delete cache[gameId];
      await window.electronAPI.saveCache(cache);
      import('./dataFetcher.js').then(m => m.fetchGameMetadata(gameId));
      gameInfoDiv.classList.remove("show");
    });

    document.querySelector('.manual-edit-btn').addEventListener('click', () => {
      showManualEditForm(gameId);
    });
    return;
  }
  
  const userDataPath = await window.electronAPI.getUserDataPath();
  const getImgUrl = async (name) => {
    const path = await window.electronAPI.pathJoin(userDataPath, 'img_cache', gameId, name);
    return `atom:///${path.replace(/\\/g, '/')}`;
  };

  const imagePath = await getImgUrl('work_image.jpg');
  const sampleImages = metadata.sample_images || [];
  const categoryLabel = metadata.category ? (categoryMap[metadata.category] || "Inconnu") : "Inconnu";
  
  // Génération du carrousel d'images
  let carouselHtml = `
    <div class="carousel-container">
      <button class="close-game-info">✖</button>
      <div class="carousel">
        <button class="prev-btn">❮</button>
        <div class="carousel-images">
          <img src="${imagePath}" class="carousel-img active" onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}';" />
          ${await Promise.all(sampleImages.map(async (_img, i) => {
            const src = await getImgUrl(`sample_${i + 1}.jpg`);
            return `<img src="${src}" class="carousel-img" onerror="this.onerror=null; this.style.display='none';" />`;
          })).then(results => results.join(''))}
        </div>
        <button class="next-btn">❯</button>
      </div>
    </div>
    <button class="side-panel-play-btn" onclick="window.launchGame('${gameId}')" data-game-id="${gameId}">
      ▶ JOUER
    </button>
    <div class="category-label">${categoryLabel}</div>
  `;

  const creator = metadata.circle || metadata.author || "Créateur non disponible";

  const customTags = metadata.customTags || [];
  let customTagsHtml = `
    <div class="custom-tags-section">
      <div class="custom-tags-list">
        ${customTags.map(tag => `
          <span class="custom-tag">
            ${tag} <button class="remove-tag-btn" data-tag="${tag}">x</button>
          </span>
        `).join('')}
      </div>
      <div class="custom-tag-input-container">
        <input type="text" class="new-custom-tag-input" placeholder="Ajouter un tag..." />
        <button class="add-custom-tag-btn">+</button>
      </div>
    </div>
  `;

  let detailsHtml = `
    <div class="header-info">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="flex: 1;">
          <h3>${metadata.work_name || "Nom non disponible"}</h3>
          <h4>par ${creator}</h4>
        </div>
        <div class="side-panel-rating">
          ${createRatingHtml(gameId, metadata.rating || 0, true)}
        </div>
      </div>
      ${customTagsHtml}
    </div>
  `;

  const formatDate = (dateString) => {
    return dateString ? dateString.split("T")[0] : "Inconnue";
  };

  const fields = [
    { label: "Cercle", value: metadata.circle },
    { label: "Marque", value: metadata.brand },
    { label: "Éditeur", value: metadata.publisher },
    { label: "Date de sortie", value: formatDate(metadata.release_date) },
    { label: "Taille du fichier", value: metadata.file_size },
    { label: "Langue", value: metadata.language },
    { label: "Série", value: metadata.series },
    { label: "Nombre de pages", value: metadata.page_count },
    { label: "Auteur", value: metadata.author },
    { label: "Scénariste", value: metadata.writer },
    { label: "Scénario", value: metadata.scenario },
    { label: "Illustration", value: metadata.illustration },
    { label: "Doublage", value: metadata.voice_actor },
    { label: "Musique", value: metadata.music },
    { label: "Événements", value: metadata.event?.join(', ') }
  ];

  fields.forEach(field => {
    if (field.value && field.value !== "N/A") {
      detailsHtml += `<p><strong>${field.label}:</strong> ${field.value}</p>`;
    }
  });

  if (metadata.genre && metadata.genre.length > 0) {
    detailsHtml += `
      <p><strong>Genres:</strong> ${metadata.genre.map(genre => `
        <span class="genre-tag" data-genre="${genre}">${genre}</span>
      `).join(', ')}</p>
    `;
  }
  
  if (metadata.description) {
    detailsHtml += `<div class="description">${metadata.description}</div>`;
  }

  detailsHtml += `
    <div class="action-buttons">
      <a href="https://www.dlsite.com/maniax/work/=/product_id/${gameId}.html" target="_blank" class="dlsite-link">
        Voir sur DLsite
      </a>
      <button class="open-folder-btn">
        Ouvrir le dossier
      </button>
      <button class="manual-edit-btn">
        Modifier
      </button>
    </div>
  `;

  gameDetails.innerHTML = `${carouselHtml}${detailsHtml}`;
  gameInfoDiv.classList.add("show");
  
  attachGameInfoEventListeners(gameInfoDiv, gameId);
  attachRatingEventListeners(cache, gameDetails);

  // Gestion du bouton de modification manuelle
  document.querySelector('.manual-edit-btn').addEventListener('click', () => {
    showManualEditForm(gameId);
  });

  // Gestion de l'ajout de tags
  document.querySelector('.add-custom-tag-btn').addEventListener('click', async () => {
    const input = document.querySelector('.new-custom-tag-input');
    const newTag = input.value.trim();
    if (newTag && !customTags.includes(newTag)) {
      customTags.push(newTag);
      await updateCacheEntry(cache, gameId, { customTags });
      showGameInfo(gameId);
      refreshInterface();
    }
    input.value = '';
  });

  // Gestion de la suppression de tags
  document.querySelectorAll('.remove-tag-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const tagToRemove = button.getAttribute('data-tag');
      const index = customTags.indexOf(tagToRemove);
      if (index > -1) {
        customTags.splice(index, 1);
        await updateCacheEntry(cache, gameId, { customTags });
        showGameInfo(gameId);
        refreshInterface();
      }
    });
  });
}

/**
 * Convertit une date ISO en format DDMMYYYY pour l'affichage dans le formulaire.
 */
function isoToDDMMYYYY(isoString) {
  if (!isoString || isoString === "N/A") return "";
  const datePart = isoString.split("T")[0]; // YYYY-MM-DD
  const parts = datePart.split("-");
  if (parts.length !== 3) return isoString;
  return `${parts[2]}${parts[1]}${parts[0]}`;
}

/**
 * Convertit une chaîne DDMMYYYY en format ISO pour le stockage.
 */
function ddmmToISO(ddmmyyyy) {
  if (!ddmmyyyy) return "N/A";
  const clean = ddmmyyyy.replace(/\D/g, '');
  if (clean.length !== 8) return ddmmyyyy;
  const day = clean.substring(0, 2);
  const month = clean.substring(2, 4);
  const year = clean.substring(4, 8);
  return `${year}-${month}-${day}T00:00:00`;
}

/**
 * Affiche le formulaire de modification manuelle des métadonnées.
 */
export async function showManualEditForm(gameId) {
  const cache = await loadCache();
  const gameData = cache[gameId] || { work_name: gameId };
  const gameDetails = document.querySelector('.game-details');

  const genres = Array.isArray(gameData.genre) ? gameData.genre.join(', ') : (gameData.genre || '');

  gameDetails.innerHTML = `
    <div class="header-info">
      <button class="close-edit">✖</button>
      <h3>Modifier ${gameId}</h3>
    </div>
    <div class="edit-form">
      <div class="form-group">
        <label>Nom du jeu :</label>
        <input type="text" id="edit-name" value="${gameData.work_name || ''}">
      </div>
      <div class="form-group">
        <label>Cercle / Auteur :</label>
        <input type="text" id="edit-creator" value="${gameData.circle || gameData.author || ''}">
      </div>
      <div class="form-group">
        <label>Date de sortie (DDMMYYYY) :</label>
        <input type="text" id="edit-release-date" value="${isoToDDMMYYYY(gameData.release_date)}">
      </div>
      <div class="form-group">
        <label>Catégorie :</label>
        <select id="edit-category">
          ${Object.entries(categoryMap).map(([code, name]) => `
            <option value="${code}" ${gameData.category === code ? 'selected' : ''}>${name}</option>
          `).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Scénariste :</label>
        <input type="text" id="edit-writer" value="${gameData.writer || ''}">
      </div>
      <div class="form-group">
        <label>Scénario :</label>
        <input type="text" id="edit-scenario" value="${gameData.scenario || ''}">
      </div>
      <div class="form-group">
        <label>Illustration :</label>
        <input type="text" id="edit-illustration" value="${gameData.illustration || ''}">
      </div>
      <div class="form-group">
        <label>Genres (séparés par des virgules) :</label>
        <input type="text" id="edit-genres" value="${genres}">
      </div>
      <div class="form-group">
        <label>Résumé :</label>
        <textarea id="edit-description">${gameData.description || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Image de couverture :</label>
        <div class="image-selection">
          <button id="select-image-btn">Choisir une image</button>
          <span id="selected-image-path">Par défaut</span>
        </div>
      </div>
      <div class="form-actions">
        <button class="save-manual-btn">Enregistrer</button>
        <button class="cancel-edit-btn">Annuler</button>
      </div>
    </div>
  `;

  document.querySelector('.close-edit').addEventListener('click', () => showGameInfo(gameId));
  document.querySelector('.cancel-edit-btn').addEventListener('click', () => showGameInfo(gameId));

  let manualImagePath = null;

  document.querySelector('#select-image-btn').addEventListener('click', async () => {
    const filePath = await window.electronAPI.openImageDialog();
    if (filePath) {
      manualImagePath = filePath;
      document.querySelector('#selected-image-path').textContent = 'Image sélectionnée';
    }
  });

  document.querySelector('.save-manual-btn').addEventListener('click', async () => {
    const genreInput = document.querySelector('#edit-genres').value;
    const genreArray = genreInput.split(',').map(s => s.trim()).filter(s => s !== '');

    const updatedData = {
      ...gameData,
      work_name: document.querySelector('#edit-name').value,
      circle: document.querySelector('#edit-creator').value,
      author: document.querySelector('#edit-creator').value, // On garde les deux synchro
      release_date: ddmmToISO(document.querySelector('#edit-release-date').value),
      category: document.querySelector('#edit-category').value,
      writer: document.querySelector('#edit-writer').value,
      scenario: document.querySelector('#edit-scenario').value,
      illustration: document.querySelector('#edit-illustration').value,
      genre: genreArray,
      description: document.querySelector('#edit-description').value,
      fetchFailed: false,
      error: null
    };

    if (manualImagePath) {
      const userDataPath = await window.electronAPI.getUserDataPath();
      const destPath = await window.electronAPI.pathJoin(userDataPath, 'img_cache', gameId, 'work_image.jpg');
      await window.electronAPI.fsCopy(manualImagePath, destPath);
      updatedData.work_image = 'manual';
    }

    cache[gameId] = updatedData;
    await window.electronAPI.saveCache(cache);
    
    showGameInfo(gameId);
    refreshInterface();
  });
}
