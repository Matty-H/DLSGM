const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');

import { globalCache } from '../renderer.js';
import { scanGames } from './gameScanner.js';
import { cacheFilePath } from './osHandler.js';

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
