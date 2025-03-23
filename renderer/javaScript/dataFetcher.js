const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');

import { globalCache } from '../renderer.js';
import { scanGames } from './gameScanner.js';
import { cacheFilePath, getGamesFolderPath } from './osHandler.js';
import { saveCache } from './cacheManager.js';

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

// === RECUPERATION DES METADONNEES DU JEU ===
export function fetchGameMetadata(gameId) {
  const pythonScriptPath = path.join(__dirname, 'pythonScript', 'fetch_dlsite.py');
  
  // Option 1: Utiliser des options d'environnement pour forcer l'encodage UTF-8
  const options = {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  };
  
  exec(`python "${pythonScriptPath}" "${gameId}"`, options, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Erreur d'exécution: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Erreur Python: ${stderr}`);
      return;
    }

    try {
      // Option 2: S'assurer que stdout est traité comme UTF-8
      const metadata = JSON.parse(stdout);
      globalCache[gameId] = metadata;
      fs.writeFileSync(cacheFilePath, JSON.stringify(globalCache, null, 2));
      await downloadGameImages(gameId, metadata);
      scanGames();
    } catch (e) {
      console.error("Erreur lors du parsing des données:", e);
      console.error("Données reçues:", stdout); // Pour déboguer
    }
  });
}
// Fonction de purge centralisée
// Fonction de purge centralisée avec nettoyage img_cache
export function purgeObsoleteGamesFromCache() {
  console.log('--- DÉBUT DE LA PURGE DES DONNÉES ---');

  // Vérifie si le dossier SCAN existe
  if (!fs.existsSync(getGamesFolderPath())) {
    console.error('Le dossier SCAN n\'existe pas, aucune purge effectuée.');
    return;
  }

  // Liste des dossiers de jeux dans SCAN
  const files = fs.readdirSync(getGamesFolderPath());
  const gameFolders = files.filter(file => /^[A-Z]{2}\d{6,9}$/.test(file));

  // Set pour vérifier rapidement les jeux présents
  const gameIdsToKeep = new Set(gameFolders);
  const cachedGameIds = Object.keys(globalCache);

  // === PURGE DU CACHE ===
  const purgedCacheEntries = [];
  cachedGameIds.forEach(gameId => {
    if (!gameIdsToKeep.has(gameId)) {
      purgedCacheEntries.push(gameId);
      delete globalCache[gameId];
    }
  });

  if (purgedCacheEntries.length > 0) {
    console.log(`Purge de ${purgedCacheEntries.length} entrées obsolètes dans le cache:`, purgedCacheEntries);
    saveCache(globalCache);
  } else {
    console.log('Aucune entrée obsolète trouvée dans le cache.');
  }

  // === NETTOYAGE DES DOSSIERS IMG_CACHE ===
  const imgCacheDir = path.join(__dirname, 'img_cache');

  if (!fs.existsSync(imgCacheDir)) {
    console.warn(`Le dossier img_cache n'existe pas à l'emplacement : ${imgCacheDir}`);
    console.log('--- FIN DE LA PURGE DES DONNÉES ---');
    return;
  }

  const imgCacheFolders = fs.readdirSync(imgCacheDir);
  const purgedImgFolders = [];

  imgCacheFolders.forEach(folderName => {
    const folderPath = path.join(imgCacheDir, folderName);

    // Si le dossier d'images n'a pas de correspondance dans SCAN ni dans le cache
    if (!gameIdsToKeep.has(folderName) && !globalCache[folderName]) {
      purgedImgFolders.push(folderName);

      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`Dossier image supprimé : ${folderName}`);
    }
  });

  if (purgedImgFolders.length > 0) {
    console.log(`Purge de ${purgedImgFolders.length} dossiers images orphelins:`, purgedImgFolders);
  } else {
    console.log('Aucun dossier image à purger dans img_cache.');
  }

  console.log('--- FIN DE LA PURGE DES DONNÉES ---');
}

// === RESET ET RE-DOWNLOAD DES IMAGES ===
export async function resetAndRedownloadImages() {
  const imgCacheDir = path.join(__dirname, 'img_cache');

  console.log('--- DÉBUT DU RESET DES IMAGES ---');

  // 1. Vérifier si img_cache existe
  if (!fs.existsSync(imgCacheDir)) {
    console.warn(`Le dossier img_cache n'existe pas à l'emplacement : ${imgCacheDir}`);
    console.log('Création du dossier img_cache...');
    fs.mkdirSync(imgCacheDir, { recursive: true });
  }

  // 2. Lire tous les dossiers dans img_cache
  const imgCacheFolders = fs.readdirSync(imgCacheDir);

  // 3. Supprimer chaque dossier de jeu dans img_cache
  for (const folderName of imgCacheFolders) {
    const folderPath = path.join(imgCacheDir, folderName);
    try {
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`Dossier supprimé : ${folderName}`);
    } catch (error) {
      console.error(`Erreur en supprimant ${folderName} :`, error);
    }
  }

  console.log('Tous les dossiers images ont été supprimés.');

  // 4. Re-télécharger les images pour chaque jeu dans le cache
  const gameIds = Object.keys(globalCache);

  if (gameIds.length === 0) {
    console.log('Aucun jeu dans le cache. Rien à re-télécharger.');
    console.log('--- FIN DU RESET DES IMAGES ---');
    return;
  }

  console.log(`Re-téléchargement des images pour ${gameIds.length} jeux...`);

  for (const gameId of gameIds) {
    const metadata = globalCache[gameId];
    if (!metadata) {
      console.warn(`Pas de metadata pour ${gameId}, saut...`);
      continue;
    }

    try {
      await downloadGameImages(gameId, metadata);
      console.log(`Images re-téléchargées pour ${gameId}`);
    } catch (error) {
      console.error(`Erreur lors du téléchargement des images pour ${gameId} :`, error);
    }
  }

  console.log('--- FIN DU RESET DES IMAGES ---');
}
