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
  // Créer un nouveau cache si erreur
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
      fs.unlink(outputPath);  // Supprimer le fichier en cas d'erreur
      reject(err);
    });
  });
}

// === TELECHARGER TOUTES LES IMAGES D'UN JEU ===
async function downloadGameImages(gameId, metadata) {
  const gameDir = path.join(__dirname, 'img_cache', gameId);

  // Créez un dossier pour ce jeu s'il n'existe pas
  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  try {
    // Télécharger l'image principale
    const workImageUrl = `https:${metadata.work_image}`;
    const workImagePath = path.join(gameDir, 'work_image.jpg');
    console.log(`Téléchargement de l'image principale pour ${gameId}...`);
    await downloadImage(workImageUrl, workImagePath);
    console.log(`Image principale téléchargée pour ${gameId}`);

    // Télécharger les images d'échantillon
    for (let i = 0; i < metadata.sample_images.length; i++) {
      const sampleImageUrl = `https:${metadata.sample_images[i]}`;
      const sampleImagePath = path.join(gameDir, `sample_${i + 1}.jpg`);
      console.log(`Téléchargement de l'image d'échantillon ${i + 1} pour ${gameId}...`);
      await downloadImage(sampleImageUrl, sampleImagePath);
      console.log(`Image d'échantillon ${i + 1} téléchargée pour ${gameId}`);
    }
  } catch (error) {
    console.error(`Erreur lors du téléchargement des images pour ${gameId}:`, error);
  }
}

// === SCAN DES JEUX ET MISE À JOUR AUTOMATIQUE DU CACHE ===
function scanGames() {
  console.log('function scanGames');
  const list = document.getElementById('games-list');
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

    // Afficher tous les jeux
    gameFolders.forEach(folder => {
      const gameId = folder;
      const gameDiv = document.createElement('div');
      gameDiv.className = 'game';
      
      // Ajouter le nom du jeu depuis le cache si disponible
      const gameName = cache[gameId] ? cache[gameId].work_name : gameId;
      const gameCircle = cache[gameId] ? cache[gameId].circle : 'Inconnu';
      const gameGenres = cache[gameId] ? cache[gameId].genre.join(', ') : '';
      const gameRating = cache[gameId] && cache[gameId].rating ? cache[gameId].rating : 0;
      
      // Ajouter l'image principale si les métadonnées sont disponibles dans le cache
      let gameImageHtml = '';
      if (cache[gameId] && cache[gameId].work_image) {
        const workImagePath = `img_cache/${gameId}/work_image.jpg`;
        gameImageHtml = `<img src="${workImagePath}" alt="${gameName}" class="game-thumbnail" data-game-id="${gameId}" style="max-width: 100%; height: auto; margin-bottom: 10px; cursor: pointer;" />`;
      }

      // Générer les étoiles
      let ratingHtml = '<div class="rating" data-game-id="' + gameId + '">';
      for (let i = 1; i <= 5; i++) {
        ratingHtml += `<span class="star" data-value="${i}" style="cursor: pointer; color: ${i <= gameRating ? 'gold' : 'gray'};">★</span>`;
      }
      ratingHtml += '</div>';

      gameDiv.innerHTML = `
        ${gameImageHtml}  <!-- L'image principale -->
        <h3>${gameName}</h3>
        <p><strong>Circle:</strong> ${gameCircle}</p>
        <p><strong>Genres:</strong> ${gameGenres}</p>
        ${ratingHtml}
        <div style="display: flex; gap: 10px;">
          <button onclick="window.launchGame('${folder}')" style="flex: 3; background-color: green; color: white; padding: 10px; border: none; display: flex; align-items: center; justify-content: center; gap: 5px;">
            <span>▶</span> Lancer le jeu
          </button>
          <button onclick="window.showGameInfo('${gameId}')" style="flex: 1; background-color: red; color: white; padding: 10px; border: none; display: flex; align-items: center; justify-content: center;">
            ➕
          </button>
        </div>
      `;
      list.appendChild(gameDiv);
      
      // Vérifier si le jeu n'est pas dans le cache pour récupérer ses infos
      if (!cache[gameId]) {
        console.log(`Jeu non-caché trouvé: ${gameId}, récupération des métadonnées...`);
        fetchGameMetadata(gameId);  // Récupérer les métadonnées
      }
    });

    // Ajouter les écouteurs d'événements pour la notation
    document.querySelectorAll('.rating .star').forEach(star => {
      star.addEventListener('click', function() {
        const gameId = this.parentNode.getAttribute('data-game-id');
        const rating = parseInt(this.getAttribute('data-value'));
        cache[gameId].rating = rating;
        fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
        scanGames(); // Mettre à jour l'affichage
      });
    });


  } catch (error) {
    console.error('Erreur lors du scan des jeux:', error);
    list.innerHTML = '<p>Erreur lors du scan des jeux.</p>';
  }
}


// === LANCEMENT DU JEU ===
function launchGame(folder) {
  console.log('function launchGame')
  let executablePath = '';

  if (platform === 'win32') {
    executablePath = path.join(gamesFolderPath, folder, 'game.exe');
  } else if (platform === 'darwin') {
    executablePath = path.join(gamesFolderPath, folder, 'game.app');
  }

  console.log('Lancement du jeu :', executablePath);

  exec(`"${executablePath}"`, (error) => {
    if (error) {
      console.error('Erreur de lancement:', error.message);
      alert('Impossible de lancer le jeu.');
    } else {
      console.log('Jeu lancé !');
    }
  });
}



// === RECUPERATION DES METADONNEES DU JEU ===
function fetchGameMetadata(gameId) {
  console.log('function fetchGameMetadata')
  const pythonScriptPath = path.join(__dirname, 'fetch_dlsite.py');
  
  console.log(`Exécution: python "${pythonScriptPath}" "${gameId}"`);

  // Appeler le script Python avec l'ID du jeu en argument
  exec(`python "${pythonScriptPath}" "${gameId}"`, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Erreur d'exécution: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Erreur Python: ${stderr}`);
      return;
    }

    console.log('Sortie brute du script Python:', stdout);

    // On récupère les données retournées sous forme de JSON
    try {
      const metadata = JSON.parse(stdout);
      console.log('Données du jeu parsées:', metadata);
      
      // Mettre à jour le cache avec les nouvelles données
      cache[gameId] = metadata;
      
      // Vérifiez si le cache a été mis à jour correctement
      console.log('Cache actuel:', cache);
      
      // Écrire dans le fichier cache
      console.log('Mise à jour du cache pour:', gameId);
      fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
      console.log('Cache écrit dans:', cacheFilePath);

      // Télécharger les images et mettre à jour l'UI
      await downloadGameImages(gameId, metadata);
      
      // Mettre à jour l'affichage des jeux pour refléter les nouvelles données
      scanGames();
    } catch (e) {
      console.error("Erreur lors du parsing des données:", e);
      console.error("Contenu reçu:", stdout);
    }
  });
}

// === AFFICHAGE DES INFOS DU JEU DANS L'UI ===
function showGameInfo(gameId) {
  console.log("function showGameInfo", gameId);

  const gameInfoDiv = document.getElementById("game-info");
  if (!gameInfoDiv) {
    console.error("Erreur: 'game-info' introuvable.");
    return;
  }

  // Vérification de l'existence des données dans le cache
  const metadata = cache[gameId];
  if (!metadata) {
    console.error(`Aucune donnée trouvée pour ${gameId} dans le cache.`);
    gameInfoDiv.innerHTML = `<p>Informations non disponibles.</p>`;
    return;
  }

  // Chemin de l'image
  const imagePath = metadata.work_image ? `img_cache/${gameId}/work_image.jpg` : 'placeholder.jpg';

  // Utilisation des données avec valeurs par défaut si nécessaire
  const workName = metadata.work_name || "Nom non disponible";
  const ageCategory = metadata.age_category || "Non spécifié";
  const circle = metadata.circle || "Non spécifié";
  const description = metadata.description || "Pas de description disponible.";

  // Construction du contenu HTML
  gameInfoDiv.innerHTML = `
    <div class="game-info-content">
      <button id="close-game-info">✖</button>
      <img src="${imagePath}" alt="${workName}" />
      <h3>${workName}</h3>
      <p><strong>Age Category:</strong> ${ageCategory}</p>
      <p><strong>Circle:</strong> ${circle}</p>
      <p>${description}</p>
    </div>
  `;

  // Gestion du bouton de fermeture
  document.getElementById("close-game-info").onclick = () => {
    console.log("Fermeture de la fiche...");
    gameInfoDiv.classList.remove("show");
  };

  // Affichage de la div d'informations
  gameInfoDiv.classList.add("show");
}




// Exposer les fonctions au HTML
window.launchGame = launchGame;
window.showGameInfo = showGameInfo;
window.scanGames = scanGames;

// Lancer le scan des jeux et charger les données au démarrage
scanGames();