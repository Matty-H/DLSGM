import {fetchGameMetadata} from './scripts/dataFetcher.js';
import {
  loadCache, 
  updateCategoryDropdown, 
  updateGenreDropdown, 
  filterGames, 
  categoryMap, 
  selectedGenres, 
  updateSelectedGenres
} from './scripts/cacheSorting.js';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { spawn } = require('child_process');



// === DETECTION OS & CHEMIN DU DOSSIER ===
const platform = os.platform();
const homeDir = os.homedir();

let desktopPath = '';

if (platform === 'win32' || platform === 'darwin') {
  desktopPath = path.join(homeDir, 'Desktop');
} else {
  alert('OS non supporté pour l\'instant.');
}

export const gamesFolderPath = path.join(desktopPath, 'SCAN');
export const cacheFilePath = path.join(__dirname, 'cache.json');

console.log('Scanning folder:', gamesFolderPath);

let cache = {};
export const globalCache = loadCache(cache)

// === OUVERTURE DU DOSSIER DU JEU ===
function openGameFolder(folder) {
  console.log('function openGameFolder', folder);
  let folderPath = path.join(gamesFolderPath, folder);
  
  if (fs.existsSync(folderPath)) {
    if (platform === 'win32') {
      exec(`explorer "${folderPath}"`);
    } else if (platform === 'darwin') {
      exec(`open "${folderPath}"`);
    } else {
      alert('Ouverture de dossier non supportée sur cet OS.');
    }
  } else {
    alert('Dossier du jeu introuvable.');
  }
}

// === LANCEMENT DU JEU ===
function launchGame(folder) {
  console.log('Lancement du jeu...');
  
  if (platform === 'darwin') {
    // Chemin complet du dossier du jeu
    const gameFolderPath = path.join(gamesFolderPath, folder);

    // Étape 1 : Trouver le fichier .app dans le dossier du jeu
    const files = fs.readdirSync(gameFolderPath);
    const appFolderName = files.find(file => file.endsWith('.app'));

    if (!appFolderName) {
      alert('Aucun fichier .app trouvé dans ce dossier !');
      return;
    }

    console.log(`App trouvée : ${appFolderName}`);

    // Étape 2 : Accéder au dossier Contents/MacOS/
    const macOSFolderPath = path.join(gameFolderPath, appFolderName, 'Contents', 'MacOS');

    // Étape 3 : Trouver le binaire à l'intérieur de MacOS/
    const macOSFiles = fs.readdirSync(macOSFolderPath);
    const binaryName = macOSFiles[0]; // on prend le premier fichier trouvé

    if (!binaryName) {
      alert('Aucun binaire trouvé dans Contents/MacOS/');
      return;
    }

    console.log(`Binaire trouvé : ${binaryName}`);

    const executablePath = path.join(macOSFolderPath, binaryName);

    // Lancer le binaire
    const startTime = Date.now();

    const gameProcess = spawn(executablePath);

    gameProcess.on('error', (error) => {
      console.error('Erreur de lancement:', error.message);
      alert('Impossible de lancer le jeu.');
    });

    gameProcess.on('close', (code) => {
      const endTime = Date.now();
      const durationInSeconds = Math.round((endTime - startTime) / 1000);

      console.log(`Le jeu s'est fermé après ${durationInSeconds} secondes.`);
      alert(`Le jeu s'est fermé après ${durationInSeconds} secondes.`);
    });
  }
}


// === AFFICHAGE DES INFOS DU JEU ===
function showGameInfo(gameId) {
  console.log("function showGameInfo", gameId);
  
  const gameInfoDiv = document.getElementById("game-info");
  const gameDetails = document.getElementById("game-details");
  
  const metadata = globalCache[gameId];
  if (!metadata) {
    gameDetails.innerHTML = `<p>Informations non disponibles.</p>`;
    return;
  }
  
  const imagePath = metadata.work_image ? `img_cache/${gameId}/work_image.jpg` : 'placeholder.jpg';
  const sampleImages = metadata.sample_images || [];
  const categoryLabel = categoryMap[metadata.category] || "Unknown";
  
  let carouselHtml = `
    <div class="carousel-container">
      <button id="close-game-info">✖</button>
      <div class="carousel">
        <button id="prev-btn">❮</button>
        <div class="carousel-images">
          <img src="${imagePath}" class="carousel-img active" />
          ${sampleImages.map((img, i) => `<img src="img_cache/${gameId}/sample_${i + 1}.jpg" class="carousel-img" />`).join('')}
        </div>
        <button id="next-btn">❯</button>
      </div>
    </div>
    <div class="category-label">${categoryLabel}</div>
  `;

  let detailsHtml = `<h3>${metadata.work_name || "Nom non disponible"}</h3>`;

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
    { label: "Platform", value: metadata.platform },
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
        <span class="genre-tag" data-genre="${genre}" style="cursor:pointer; color:blue; text-decoration:underline;">${genre}</span>
      `).join(', ')}</p>
    `;
  }
  

  if (metadata.description) {
    detailsHtml += `<p>${metadata.description}</p>`;
  }

  // Ajout du lien DLsite à la toute fin
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
  
  // Ajouter les événements sur les genres
  document.querySelectorAll('.genre-tag').forEach(tag => {
    tag.addEventListener('click', function() {
      const selectedGenre = this.getAttribute('data-genre');
      console.log("Filtrage par genre:", selectedGenre); // Pour débogage
      
      // Utiliser updateSelectedGenres au lieu d'assigner directement
      updateSelectedGenres([selectedGenre]);
      
      // Mettre à jour visuellement le sélecteur de genre aussi
      const genreSelect = document.getElementById('genre-filter');
      Array.from(genreSelect.options).forEach(option => {
        option.selected = option.value === selectedGenre;
      });
      
      // Fermer la boîte d'information si nécessaire
      gameInfoDiv.classList.remove("show");
      
      // Mettre à jour la liste
      filterGames();
    });
  });
  
  // Gestion du carrousel
  const images = document.querySelectorAll(".carousel-img");
  let currentIndex = 0;

  function updateCarousel(index) {
    images.forEach((img, i) => img.classList.toggle("active", i === index));
  }

  document.getElementById("prev-btn").addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    updateCarousel(currentIndex);
  });

  document.getElementById("next-btn").addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    updateCarousel(currentIndex);
  });

  // Bouton de fermeture
  document.getElementById("close-game-info").addEventListener("click", () => {
    gameInfoDiv.classList.remove("show");
  });

  // Bouton d'ouverture du dossier
  document.getElementById("open-folder-btn").addEventListener("click", () => {
    openGameFolder(gameId);
  });
}


// === MODIFICATION DE LA FONCTION scanGames EXISTANTE ===
export function scanGames() {
  console.log('function scanGames');
  try {
    if (!fs.existsSync(gamesFolderPath)) {
      console.error('Le dossier SCAN n\'existe pas');
      document.getElementById('games-list').innerHTML = '<p>Dossier SCAN introuvable. Veuillez créer le dossier SCAN sur votre bureau.</p>';
      return;
    }

    const files = fs.readdirSync(gamesFolderPath);
    const gameFolders = files.filter(file => /^RJ\d{6,9}$/.test(file));

    if (gameFolders.length === 0) {
      document.getElementById('games-list').innerHTML = '<p>Aucun jeu trouvé dans SCAN.</p>';
      return;
    }

    // Vérifier et récupérer les métadonnées pour les jeux non-cachés
    gameFolders.forEach(folder => {
      const gameId = folder;
      // Vérifier si le jeu n'est pas dans le cache pour récupérer ses infos
      if (!globalCache[gameId]) {
        console.log(`Jeu non-caché trouvé: ${gameId}, récupération des métadonnées...`);
        fetchGameMetadata(gameId);  // Récupérer les métadonnées
      }
    });

    // Mettre à jour le menu déroulant des catégories
    updateCategoryDropdown();
    updateGenreDropdown();
    
    // Filtrer et afficher les jeux
    filterGames();
  } catch (error) {
    console.error('Erreur lors du scan des jeux:', error);
    document.getElementById('games-list').innerHTML = '<p>Erreur lors du scan des jeux.</p>';
  }
}

// === INITIALISATION DES ÉCOUTEURS D'ÉVÉNEMENTS ===
function initEventListeners() {
  // Existing category filter event listener
  document.getElementById('category-filter').addEventListener('change', filterGames);
  
  // Add genre filter event listener (using multi-select)
  document.getElementById('genre-filter').addEventListener('change', function() {
    const selectedOptions = Array.from(this.selectedOptions);
    const newGenres = selectedOptions.map(opt => opt.value);
    updateSelectedGenres(newGenres);
    filterGames();
  });
  
  // Existing search input event listener
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterGames, 300);
  });

  document.getElementById('reset-filters').addEventListener('click', function() {
    // Réinitialiser les sélections
    document.getElementById('category-filter').value = 'all';
    
    // Réinitialiser multi-select de genres
    const genreSelect = document.getElementById('genre-filter');
    Array.from(genreSelect.options).forEach(option => {
      option.selected = false;
    });
    
    // Vider la barre de recherche
    document.getElementById('search-input').value = '';
    
    // Réinitialiser les variables de filtrage
    updateSelectedGenres([]);
    
    // Rafraîchir l'affichage
    filterGames();
  });
}

// === MODIFICATIONS POUR L'INITIALISATION ===
window.launchGame = launchGame;
window.showGameInfo = showGameInfo;
window.scanGames = scanGames;
window.filterGames = filterGames;

// Fonction d'initialisation à exécuter au chargement de la page
window.addEventListener('DOMContentLoaded', function() {
  // Lancer le scan des jeux et charger les données au démarrage
  scanGames();
  
  // Initialiser les écouteurs d'événements pour le filtrage
  initEventListeners();
});