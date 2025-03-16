const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { exec } = require('child_process');
const categoryMap = {
  "ACN": "Action",
  "ADV": "Adventure",
  "QIZ": "Quiz",
  "ICG": "CG/Illustrations",
  "DNV": "Digital Novel",
  "SCM": "Gekiga",
  "IMT": "Illustration Materials",
  "MNG": "Manga",
  "ET3": "Miscellaneous",
  "ETC": "Miscellaneous Game",
  "MUS": "Music",
  "AMT": "Music Materials",
  "NRE": "Novel",
  "PZL": "Puzzle",
  "RPG": "Role Playing",
  "STG": "Shooting",
  "SLN": "Simulation",
  "TBL": "Table",
  "TOL": "Tools/Accessories",
  "TYP": "Typing",
  "MOV": "Video",
  "SOU": "Voice/ASMR",
  "VCM": "Voiced Comic",
  "WBT": "Webtoon"
};


// === DETECTION OS & CHEMIN DU DOSSIER ===
const platform = os.platform();
const homeDir = os.homedir();

let desktopPath = '';

if (platform === 'win32' || platform === 'darwin') {
  desktopPath = path.join(homeDir, 'Desktop');
} else {
  alert('OS non supporté pour l\'instant.');
}

const gamesFolderPath = path.join(desktopPath, 'SCAN');
const cacheFilePath = path.join(__dirname, 'cache.json');

console.log('Scanning folder:', gamesFolderPath);

// === CHARGEMENT DU CACHE ===
let cache = {};

try {
  if (fs.existsSync(cacheFilePath)) {
    const cacheData = fs.readFileSync(cacheFilePath, 'utf8');
    cache = JSON.parse(cacheData);
    console.log('Cache chargé:', cache);
  } else {
    console.log('Aucun cache trouvé, création du cache...');
    fs.writeFileSync(cacheFilePath, JSON.stringify({}, null, 2));
  }
} catch (error) {
  console.error('Erreur lors du chargement du cache:', error);
  fs.writeFileSync(cacheFilePath, JSON.stringify({}, null, 2));
}

// === TELECHARGER UNE IMAGE ===
function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => reject(err));
    });
  });
}

// === TELECHARGER TOUTES LES IMAGES D'UN JEU ===
async function downloadGameImages(gameId, metadata) {
  const gameDir = path.join(__dirname, 'img_cache', gameId);

  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  try {
    const workImageUrl = `https:${metadata.work_image}`;
    const workImagePath = path.join(gameDir, 'work_image.jpg');
    console.log(`Téléchargement de l'image principale pour ${gameId}...`);
    await downloadImage(workImageUrl, workImagePath);

    for (let i = 0; i < metadata.sample_images.length; i++) {
      const sampleImageUrl = `https:${metadata.sample_images[i]}`;
      const sampleImagePath = path.join(gameDir, `sample_${i + 1}.jpg`);
      console.log(`Téléchargement de l'image d'échantillon ${i + 1} pour ${gameId}...`);
      await downloadImage(sampleImageUrl, sampleImagePath);
    }
  } catch (error) {
    console.error(`Erreur lors du téléchargement des images pour ${gameId}:`, error);
  }
}



// === LANCEMENT DU JEU ===
function launchGame(folder) {
  console.log('function launchGame');
  let executablePath = '';

  if (platform === 'win32') {
    executablePath = path.join(gamesFolderPath, folder, 'game.exe');
  } else if (platform === 'darwin') {
    executablePath = path.join(gamesFolderPath, folder, 'game.app');
  }

  exec(`"${executablePath}"`, (error) => {
    if (error) {
      console.error('Erreur de lancement:', error.message);
      alert('Impossible de lancer le jeu.');
    }
  });
}

// === RECUPERATION DES METADONNEES DU JEU ===
function fetchGameMetadata(gameId) {
  console.log('function fetchGameMetadata');
  const pythonScriptPath = path.join(__dirname, 'fetch_dlsite.py');

  exec(`python "${pythonScriptPath}" "${gameId}"`, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Erreur d'exécution: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Erreur Python: ${stderr}`);
      return;
    }

    try {
      const metadata = JSON.parse(stdout);
      cache[gameId] = metadata;
      fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
      await downloadGameImages(gameId, metadata);
      scanGames();
    } catch (e) {
      console.error("Erreur lors du parsing des données:", e);
    }
  });
}

// === AFFICHAGE DES INFOS DU JEU ===
function showGameInfo(gameId) {
  console.log("function showGameInfo", gameId);

  const gameInfoDiv = document.getElementById("game-info");
  const gameDetails = document.getElementById("game-details");

  const metadata = cache[gameId];
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
    //{ label: "Age Category", value: metadata.age_category },
    { label: "Circle", value: metadata.circle },
    { label: "Brand", value: metadata.brand },
    { label: "Publisher", value: metadata.publisher },
    //{ label: "Label", value: metadata.label },
    //{ label: "Announce Date", value: formatDate(metadata.announce_date) },
    { label: "Release Date", value: formatDate(metadata.release_date) },
    //{ label: "Register Date", value: formatDate(metadata.regist_date) },
    //{ label: "Modified Date", value: formatDate(metadata.modified_date) },
    //{ label: "File Format", value: metadata.file_format },
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
    detailsHtml += `<p><strong>Genres:</strong> ${metadata.genre.join(', ')}</p>`;
  }

  if (metadata.description) {
    detailsHtml += `<p>${metadata.description}</p>`;
  }

  // Ajout du lien DLsite à la toute fin
  detailsHtml += `
    <a href="https://www.dlsite.com/maniax/work/=/product_id/${gameId}.html" target="_blank" class="dlsite-link">
      Voir sur DLsite
    </a>
  `;

  gameDetails.innerHTML = `${carouselHtml}${detailsHtml}`;
  gameInfoDiv.classList.add("show");

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
}


// === COLLECTE DES CATÉGORIES PRÉSENTES DANS LE CACHE ===
function collectAllCategories() {
  const uniqueCategoryCodes = new Set();
  
  // Parcourir tous les jeux dans le cache et collecter les codes de catégorie utilisés
  Object.values(cache).forEach(game => {
    if (game.category) {
      uniqueCategoryCodes.add(game.category);
    }
  });
  
  // Convertir en tableau d'objets avec code et nom
  const categories = Array.from(uniqueCategoryCodes).map(code => ({
    code,
    name: categoryMap[code] || code // Utiliser le nom du mapping ou le code si pas de mapping
  }));
  
  // Trier par nom de catégorie
  categories.sort((a, b) => a.name.localeCompare(b.name));
  
  return categories;
}

// === MISE À JOUR DU MENU DÉROULANT ===
function updateCategoryDropdown() {
  const categories = collectAllCategories();
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

// === FILTRAGE DES JEUX ===
function filterGames() {
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
    const gameFolders = files.filter(file => /^RJ\d{6,9}$/.test(file));

    if (gameFolders.length === 0) {
      list.innerHTML = '<p>Aucun jeu trouvé dans SCAN.</p>';
      return;
    }

    // Filtrer et afficher les jeux
    gameFolders.forEach(folder => {
      const gameId = folder;
      
      // Vérifier si le jeu correspond aux critères de filtrage
      if (cache[gameId]) {
        const gameName = cache[gameId].work_name || gameId;
        const gameCategory = cache[gameId].category;
        
        // Filtrer par catégorie si une catégorie spécifique est sélectionnée
        if (selectedCategoryCode !== 'all' && gameCategory !== selectedCategoryCode) {
          return; // Ignorer ce jeu
        }
        
        // Filtrer par terme de recherche si présent
        if (searchTerm && !gameName.toLowerCase().includes(searchTerm)) {
          return; // Ignorer ce jeu
        }
        
        // Le jeu correspond aux critères, l'ajouter à l'affichage
        const gameDiv = document.createElement('div');
        gameDiv.className = 'game';
        
        // Récupération des données du jeu depuis le cache
        const gameCircle = cache[gameId] ? cache[gameId].circle : 'Inconnu';
        const gameCategoryLabel = categoryMap[gameCategory] || "Inconnu";
        const gameRating = cache[gameId] && cache[gameId].rating ? cache[gameId].rating : 0;
        
        // Ajouter l'image principale si disponible
        let gameImageHtml = '';
        if (cache[gameId] && cache[gameId].work_image) {
          const workImagePath = `img_cache/${gameId}/work_image.jpg`;
          gameImageHtml = `<img src="${workImagePath}" alt="${gameName}" class="game-thumbnail" onclick="window.showGameInfo('${gameId}')" />`;
        }

        // Générer les étoiles
        let ratingHtml = '<div class="rating" data-game-id="' + gameId + '">';
        for (let i = 1; i <= 5; i++) {
          ratingHtml += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${i <= gameRating ? 'gold' : 'gray'};">★</span>`;
        }
        ratingHtml += '</div>';

        gameDiv.innerHTML = `
          ${gameImageHtml}
          <div class="category-label">${gameCategoryLabel}</div>
            <div class="game_title">
              <h3>${gameName}</h3>
              <p>${gameCircle}</p>
            </div>
            ${ratingHtml}
            <div class="game-actions">
              <button onclick="window.launchGame('${folder}')">
                ▶ Lancer le jeu
              </button>
          </div>
        `;
        
        list.appendChild(gameDiv);
      }
    });

    // Ajouter les écouteurs d'événements pour la notation
    document.querySelectorAll('.rating .star').forEach(star => {
      star.addEventListener('click', function() {
        const gameId = this.parentNode.getAttribute('data-game-id');
        const rating = parseInt(this.getAttribute('data-value'));
        cache[gameId].rating = rating;
        fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
        filterGames(); // Mettre à jour l'affichage au lieu de scanGames
      });
    });

    // Afficher un message si aucun jeu ne correspond aux critères
    if (list.children.length === 0) {
      list.innerHTML = '<p>Aucun jeu ne correspond aux critères de recherche.</p>';
    }
  } catch (error) {
    console.error('Erreur lors du filtrage des jeux:', error);
    list.innerHTML = '<p>Erreur lors du filtrage des jeux.</p>';
  }
}

// === MODIFICATION DE LA FONCTION scanGames EXISTANTE ===
function scanGames() {
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
      if (!cache[gameId]) {
        console.log(`Jeu non-caché trouvé: ${gameId}, récupération des métadonnées...`);
        fetchGameMetadata(gameId);  // Récupérer les métadonnées
      }
    });

    // Mettre à jour le menu déroulant des catégories
    updateCategoryDropdown();
    
    // Filtrer et afficher les jeux
    filterGames();
  } catch (error) {
    console.error('Erreur lors du scan des jeux:', error);
    document.getElementById('games-list').innerHTML = '<p>Erreur lors du scan des jeux.</p>';
  }
}

// === INITIALISATION DES ÉCOUTEURS D'ÉVÉNEMENTS ===
function initEventListeners() {
  // Écouteur pour le changement de catégorie
  document.getElementById('category-filter').addEventListener('change', filterGames);
  
  // Écouteur pour la recherche par texte (avec délai)
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterGames, 300); // Attendre 300ms après la saisie
  });
}

// === MODIFICATIONS POUR L'INITIALISATION ===
// Exposer les fonctions au HTML
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


window.launchGame = launchGame;
window.showGameInfo = showGameInfo;
window.scanGames = scanGames;

scanGames();
