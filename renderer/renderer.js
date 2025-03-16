const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { exec } = require('child_process');

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

// === SCAN DES JEUX ===
function scanGames() {
  console.log('function scanGames');
  const list = document.getElementById('games-list');
  list.innerHTML = '';

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

  gameFolders.forEach(folder => {
    const gameId = folder;
    const gameDiv = document.createElement('div');
    gameDiv.className = 'game';

    const gameName = cache[gameId] ? cache[gameId].work_name : gameId;
    const gameCircle = cache[gameId] ? cache[gameId].circle : 'Inconnu';
    const gameRating = cache[gameId] && cache[gameId].rating ? cache[gameId].rating : 0;

    let gameImageHtml = '';
    if (cache[gameId] && cache[gameId].work_image) {
      const workImagePath = `img_cache/${gameId}/work_image.jpg`;
      gameImageHtml = `<img src="${workImagePath}" alt="${gameName}" class="game-thumbnail" data-game-id="${gameId}" />`;
    }

    let ratingHtml = '<div class="rating" data-game-id="' + gameId + '">';
    for (let i = 1; i <= 5; i++) {
      ratingHtml += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${i <= gameRating ? 'gold' : 'gray'};">★</span>`;
    }
    ratingHtml += '</div>';

    gameDiv.innerHTML = `
      ${gameImageHtml}
      <h3>${gameName}</h3>
      <p><strong>Circle:</strong> ${gameCircle}</p>
      ${ratingHtml}
      <div class="game-actions">
        <button onclick="window.launchGame('${folder}')">
          ▶ Lancer le jeu
        </button>
        <button onclick="window.showGameInfo('${gameId}')">
          ➕
        </button>
      </div>
    `;
    list.appendChild(gameDiv);

    if (!cache[gameId]) {
      console.log(`Jeu non-caché trouvé: ${gameId}, récupération des métadonnées...`);
      fetchGameMetadata(gameId);
    }
  });

  document.querySelectorAll('.rating .star').forEach(star => {
    star.addEventListener('click', function() {
      const gameId = this.parentNode.getAttribute('data-game-id');
      const rating = parseInt(this.getAttribute('data-value'));
      cache[gameId].rating = rating;
      fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
      scanGames();
    });
  });
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

  const workName = metadata.work_name || "Nom non disponible";
  const ageCategory = metadata.age_category || "Non spécifié";
  const circle = metadata.circle || "Non spécifié";
  const genres = metadata.genre ? metadata.genre.join(', ') : "Non spécifié";
  const description = metadata.description || "Pas de description disponible.";

  gameDetails.innerHTML = `
    <img src="${imagePath}" alt="${workName}" />
    <h3>${workName}</h3>
    <p><strong>Age Category:</strong> ${ageCategory}</p>
    <p><strong>Circle:</strong> ${circle}</p>
    <p><strong>Genres:</strong> ${genres}</p>
    <p>${description}</p>
  `;

  gameInfoDiv.classList.add("show");

  const closeBtn = document.getElementById("close-game-info");
  closeBtn.onclick = () => {
    gameInfoDiv.classList.remove("show");
  };
}

window.launchGame = launchGame;
window.showGameInfo = showGameInfo;
window.scanGames = scanGames;

scanGames();
