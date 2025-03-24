import { attachGameInfoEventListeners } from './eventListeners.js';
import { updateCacheEntry } from './cacheManager.js';
import { refreshInterface } from './uiManager.js';

// Affiche les informations détaillées d'un jeu
export function showGameInfo(gameId, globalCache) {
  console.log("function showGameInfo", gameId);
  
  const gameInfoDiv = document.querySelector('.game-info');
  const gameDetails = document.querySelector('.game-details');
  
  const metadata = globalCache[gameId];
  if (!metadata) {
    gameDetails.innerHTML = `<p>Informations non disponibles.</p>`;
    return;
  }
  
  const imagePath = metadata.work_image ? `img_cache/${gameId}/work_image.jpg` : 'placeholder.jpg';
  const sampleImages = metadata.sample_images || [];
  const categoryLabel = metadata.category ? (window.categoryMap[metadata.category] || "Unknown") : "Unknown";
  
  let carouselHtml = `
    <div class="carousel-container">
      <button class="close-game-info">✖</button>
      <div class="carousel">
        <button class="prev-btn">❮</button>
        <div class="carousel-images">
          <img src="${imagePath}" class="carousel-img active" />
          ${sampleImages.map((_img, i) => `<img src="img_cache/${gameId}/sample_${i + 1}.jpg" class="carousel-img" />`).join('')}
        </div>
        <button class="next-btn">❯</button>
      </div>
    </div>
    <div class="category-label">${categoryLabel}</div>
  `;

  // Determine the creator (circle or author)
  const creator = metadata.circle || metadata.author || "Créateur non disponible";

  // Custom tags section moved up
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
        <input type="text" class="new-custom-tag-input" placeholder="Add custom tag" />
        <button class="add-custom-tag-btn">+</button>
      </div>
    </div>
  `;

  let detailsHtml = `
    <div class="header-info">
      <h3>${metadata.work_name || "Nom non disponible"}</h3>
      <h4>by ${creator}</h4>
      ${customTagsHtml}
    </div>
  `;

  const formatDate = (dateString) => {
    return dateString ? dateString.split("T")[0] : "Inconnue"; // Supprime `T00:00:00`
  };

  const fields = [
    { label: "Circle", value: metadata.circle },
    { label: "Brand", value: metadata.brand },
    { label: "Publisher", value: metadata.publisher },
    { label: "Release Date", value: formatDate(metadata.release_date) },
    { label: "File Size", value: metadata.file_size },
    { label: "Language", value: metadata.language },
    { label: "Series", value: metadata.series },
    { label: "Page Count", value: metadata.page_count },
    { label: "Author", value: metadata.author },
    { label: "Writer", value: metadata.writer },
    { label: "Scenario", value: metadata.scenario },
    { label: "Illustration", value: metadata.illustration },
    { label: "Voice Actor", value: metadata.voice_actor },
    { label: "Music", value: metadata.music },
    { label: "Events", value: metadata.event?.join(', ') }
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
    detailsHtml += `<p>${metadata.description}</p>`;
  }

  detailsHtml += `
    <div class="action-buttons">
    <a href="https://www.dlsite.com/maniax/work/=/product_id/${gameId}.html" target="_blank" class="dlsite-link">
      Voir sur DLsite
    </a>
    <a href="#" class="open-folder-btn">
      Ouvrir le dossier
    </a>
  </div>
  `;

  gameDetails.innerHTML = `${carouselHtml}${detailsHtml}`;
  gameInfoDiv.classList.add("show");
  
  attachGameInfoEventListeners(gameInfoDiv, gameId);

  // Ajout d'un nouveau tag custom
  document.querySelector('.add-custom-tag-btn').addEventListener('click', () => {
    const input = document.querySelector('.new-custom-tag-input');
    const newTag = input.value.trim();
    if (newTag && !customTags.includes(newTag)) {
      customTags.push(newTag);
      metadata.customTags = customTags; // Met à jour le metadata local
      
      // Mise à jour du cache et sauvegarde
      updateCacheEntry(globalCache, gameId, { customTags });
      showGameInfo(gameId, globalCache); // Recharge l'affichage
      refreshInterface();
    }
    input.value = '';
  });

  // Suppression d'un tag existant
  document.querySelectorAll('.remove-tag-btn').forEach(button => {
    button.addEventListener('click', () => {
      const tagToRemove = button.getAttribute('data-tag');
      const index = customTags.indexOf(tagToRemove);
      if (index > -1) {
        customTags.splice(index, 1);
        metadata.customTags = customTags; // Mets à jour le globalCache
        showGameInfo(gameId, globalCache); // Recharge l'affichage
      }
    });
  });
}

  // Ajoutez cette ligne pour exécuter le calcul de taille
//   calculateSizeDifference(gameId, metadata.file_size).then(result => {
//     // Optionnel : afficher le résultat ou faire quelque chose avec
//     console.log("Différence de taille calculée");
// });

