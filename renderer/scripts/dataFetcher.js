const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');

import { globalCache } from '../renderer.js';
import { scanGames } from './gameScanner.js';
import { cacheFilePath, gamesFolderPath } from './osHandler.js';
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
  const pythonScriptPath = path.join(__dirname, 'fetch_dlsite.py');
  // console.log('function fetchGameMetadata');

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
      globalCache[gameId] = metadata;
      fs.writeFileSync(cacheFilePath, JSON.stringify(globalCache, null, 2));
      await downloadGameImages(gameId, metadata);
      scanGames();
    } catch (e) {
      console.error("Erreur lors du parsing des données:", e);
    }
  });
}

// Fonction de purge centralisée
// Fonction de purge centralisée avec nettoyage img_cache
export function purgeObsoleteGamesFromCache() {
  console.log('--- DÉBUT DE LA PURGE DES DONNÉES ---');

  // Vérifie si le dossier SCAN existe
  if (!fs.existsSync(gamesFolderPath)) {
    console.error('Le dossier SCAN n\'existe pas, aucune purge effectuée.');
    return;
  }

  // Liste des dossiers de jeux dans SCAN
  const files = fs.readdirSync(gamesFolderPath);
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