/**
 * Gère l'affichage des informations détaillées d'un jeu.
 */

import { attachGameInfoEventListeners } from './eventListeners.js';
import { updateCacheEntry, loadCache } from './cacheManager.js';
import { refreshInterface } from './uiManager.js';
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
      <h3>${metadata.work_name || "Nom non disponible"}</h3>
      <h4>par ${creator}</h4>
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
    </div>
  `;

  gameDetails.innerHTML = `${carouselHtml}${detailsHtml}`;
  gameInfoDiv.classList.add("show");

  attachGameInfoEventListeners(gameInfoDiv, gameId);

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
