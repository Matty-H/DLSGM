const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { spawn } = require('child_process');

import { loadCache, updateCacheEntry } from './cacheManager.js';

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

// === OUVERTURE DU DOSSIER DU JEU ===
export function openGameFolder(folder) {
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
export function launchGame(folder) {
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
      //alert(`Le jeu s'est fermé après ${durationInSeconds} secondes.`);
      
      // Mettre à jour le temps de jeu
      updateGameTime(folder, durationInSeconds);
    });
  }
}

// === MISE à JOUR DU TEMPS DE JEU ===
// Fonction mise à jour pour mettre à jour le temps de jeu et rafraîchir l'UI
export function updateGameTime(gameId, sessionTimeInSeconds) {
  try {
    // Charger le cache actuel
    const cache = loadCache();
    
    // Récupérer l'entrée existante ou créer une nouvelle
    const gameEntry = cache[gameId] || {};
    
    // Mettre à jour le temps total de jeu
    const currentTotalTime = gameEntry.totalPlayTime || 0;
    const newTotalTime = currentTotalTime + sessionTimeInSeconds;
    
    // Mettre à jour l'entrée dans le cache avec le nouveau temps total
    updateCacheEntry(cache, gameId, {
      totalPlayTime: newTotalTime,
      lastPlayed: new Date().toISOString()
    });
    
    console.log(`Temps de jeu mis à jour pour ${gameId}: ${newTotalTime} secondes au total`);
    
    // Rafraîchir l'UI pour afficher les nouvelles informations
    filterGames();
  } catch (error) {
    console.error('Erreur lors de la mise à jour du temps de jeu:', error);
  }
}

// // === CALCUL DE LA TAILLE DU DOSSIER ===
// function getFolderSize(folderName) {
//   const folderPath = path.join(gamesFolderPath, folderName);

//   if (!fs.existsSync(folderPath)) {
//     console.warn('Dossier introuvable:', folderPath);
//     return 0;
//   }

//   let totalSize = 0;

//   function calculateSize(directory) {
//     const files = fs.readdirSync(directory);

//     files.forEach(file => {
//       const filePath = path.join(directory, file);
//       const stats = fs.lstatSync(filePath);

//       if (stats.isSymbolicLink()) {
//         console.log(`SymLink ignoré : ${filePath}`);
//         return;
//       }

//       if (stats.isFile()) {
//         console.log(`Fichier: ${filePath} - Taille: ${formatBytes(stats.size)}`);
//         totalSize += stats.size;
//       } else if (stats.isDirectory()) {
//         calculateSize(filePath); // récursif
//       }
//     });
//   }

//   calculateSize(folderPath);
//   return totalSize;
// }

// // === CONVERSION DE LA TAILLE DU DOSSIER ===
// function parseFileSize(fileSizeStr) {
//   if (!fileSizeStr) return 0;

//   const units = {
//     'B': 1,
//     'KB': 1024,
//     'MB': 1024 * 1024,
//     'GB': 1024 * 1024 * 1024
//   };

//   const regex = /([\d.]+)\s*(B|KB|MB|GB)/i;
//   const match = fileSizeStr.match(regex);

//   if (!match) return 0;

//   const size = parseFloat(match[1]);
//   const unit = match[2].toUpperCase();

//   return size * (units[unit] || 1);
// }

// // === CALCUL LA DIFFERENCE DE TAILLE ===
// export function calculateSizeDifference (gameId, metadata) {
// const realSize = getFolderSize(gameId);
// const declaredSize = parseFileSize(metadata);

// console.log(`Taille réelle : ${formatBytes(realSize)}`);
// console.log(`Taille déclarée : ${formatBytes(declaredSize)}`);

// if (declaredSize > 0) {
//   const diff = Math.abs(realSize - declaredSize);
//   const percentDiff = (diff / declaredSize) * 100;

//   if (percentDiff > 10) {
//     console.warn(`Attention ! La taille réelle diffère de plus de 10% de la taille déclarée.`);
//     // Tu peux afficher une alerte ou ajouter une info dans ton HTML :
//     gameDetails.innerHTML += `
//       <p style="color: red;"><strong>Attention:</strong> La taille réelle (${(realSize / (1024 * 1024)).toFixed(2)} MB) diffère de la taille annoncée.</p>
//     `;
//   }
// }
// }

// // === FORMATTER LA TAILLE EN TEXTE LISIBLE ===
// function formatBytes(bytes, decimals = 2) {
//   if (bytes === 0) return '0 Bytes';
//   const k = 1024;
//   const dm = decimals;
//   const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

//   const i = Math.floor(Math.log(bytes) / Math.log(k));

//   const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
//   return `${size} ${sizes[i]}`;
// }

// const realSize = getFolderSize('ton_dossier');
// console.log(`Taille réelle : ${formatBytes(realSize)}`);

