const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, spawn } = require('child_process');
const diskusage = require('diskusage');
import { loadCache, updateCacheEntry } from './cacheManager.js';
import { setGameRunning, refreshInterface } from './uiManager.js';

// === CONFIGURATION PATHS ===
const homeDir = os.homedir();
const platform = os.platform();
export const cacheFilePath = path.join(__dirname, 'data_base', 'cache.json');
export const settingsPath = path.join(__dirname, 'data_base', 'settings.json');

// === PLATFORM SPECIFIC UTILS ===
const platformUtils = {
  isSupported: () => ['win32', 'darwin'].includes(platform),
  getDesktopPath: () => platform === 'win32' || platform === 'darwin' ? path.join(homeDir, 'Desktop') : null,
  openFolder: (folderPath) => {
    if (!fs.existsSync(folderPath)) {
      throw new Error('Dossier introuvable');
    }
    
    const commands = {
      win32: `explorer "${folderPath}"`,
      darwin: `open "${folderPath}"`
    };
    
    if (commands[platform]) {
      exec(commands[platform]);
    } else {
      throw new Error('Ouverture de dossier non supportée sur cet OS');
    }
  }
};

// === SETTINGS MANAGEMENT ===
export function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);
      console.log('settings chargé:', Object.keys(settings).length, 'entrées');
      return settings;
    } else {
      console.log('Aucun settings trouvé, création du settings...');
      const defaultSettings = {};
      fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
  } catch (error) {
    console.error('Erreur lors du chargement du settings:', error);
    const defaultSettings = {};
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
}

export function getGamesFolderPath() {
  const settings = loadSettings();
  return settings.destinationFolder || null;
}

// === GAME FUNCTIONS ===
export function openGameFolder(folder) {
  try {
    if (!platformUtils.isSupported()) {
      throw new Error('OS non supporté pour l\'instant');
    }
    
    const gamesFolderPath = getGamesFolderPath();
    if (!gamesFolderPath) {
      throw new Error('Dossier de jeux non configuré');
    }
    
    const folderPath = path.join(gamesFolderPath, folder);
    platformUtils.openFolder(folderPath);
  } catch (error) {
    alert(error.message);
    console.error('Erreur lors de l\'ouverture du dossier:', error);
  }
}

export function launchGame(folder) {
  console.log('Lancement du jeu...');
  try {
    if (platform !== 'darwin') {
      throw new Error('Lancement de jeu supporté uniquement sur macOS pour l\'instant');
    }
    
    const gamesFolderPath = getGamesFolderPath();
    if (!gamesFolderPath) {
      throw new Error('Dossier de jeux non configuré');
    }
    
    const gameFolderPath = path.join(gamesFolderPath, folder);
    
    // Trouver le fichier .app
    const files = fs.readdirSync(gameFolderPath);
    const appFolderName = files.find(file => file.endsWith('.app'));
    if (!appFolderName) {
      throw new Error('Aucun fichier .app trouvé dans ce dossier');
    }
    console.log(`App trouvée : ${appFolderName}`);
    
    // Trouver le binaire exécutable
    const macOSFolderPath = path.join(gameFolderPath, appFolderName, 'Contents', 'MacOS');
    const macOSFiles = fs.readdirSync(macOSFolderPath);
    const binaryName = macOSFiles[0];
    if (!binaryName) {
      throw new Error('Aucun binaire trouvé dans Contents/MacOS/');
    }
    console.log(`Binaire trouvé : ${binaryName}`);
    
    const executablePath = path.join(macOSFolderPath, binaryName);
    
    // Lancer le jeu et suivre son exécution
    return runGameProcess(folder, executablePath);
  } catch (error) {
    alert(error.message);
    console.error('Erreur lors du lancement du jeu:', error);
    return null;
  }
}

function runGameProcess(gameId, executablePath) {
  // Marquer le jeu comme en cours d'exécution
  setGameRunning(gameId, true);
  
  // Lancer le binaire et suivre le temps de jeu
  const startTime = Date.now();
  const gameProcess = spawn(executablePath);
  
  gameProcess.on('error', (error) => {
    console.error('Erreur de lancement:', error.message);
    alert('Impossible de lancer le jeu.');
    setGameRunning(gameId, false);
  });
  
  gameProcess.on('close', (code) => {
    const endTime = Date.now();
    const durationInSeconds = Math.round((endTime - startTime) / 1000);
    console.log(`Le jeu s'est fermé après ${durationInSeconds} secondes.`);
    
    setGameRunning(gameId, false);
    updateGameTime(gameId, durationInSeconds);
  });
  
  return gameProcess;
}

// === GAME STATS MANAGEMENT ===
export function updateGameTime(gameId, sessionTimeInSeconds) {
  try {
    const cache = loadCache();
    const gameEntry = cache[gameId] || {};
    
    // Mettre à jour le temps total de jeu
    const currentTotalTime = gameEntry.totalPlayTime || 0;
    const newTotalTime = currentTotalTime + sessionTimeInSeconds;
    
    updateCacheEntry(cache, gameId, {
      totalPlayTime: newTotalTime,
      lastPlayed: new Date().toISOString()
    });
    
    console.log(`Temps de jeu mis à jour pour ${gameId}: ${newTotalTime} secondes au total`);
    
    // Rafraîchir l'UI pour afficher les nouvelles informations
    refreshInterface();
  } catch (error) {
    console.error('Erreur lors de la mise à jour du temps de jeu:', error);
  }
}

// === UI REFRESH MANAGEMENT ===
let refreshInterval = null;

export function startAutoRefresh(intervalInMinutes = 1) {
  // Annuler l'intervalle précédent s'il existe
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  // N'active pas le refresh si l'intervalle est 0
  if (intervalInMinutes <= 0) {
    console.log('Auto-refresh désactivé (intervalle = 0).');
    return;
  }
  
  const intervalInMs = intervalInMinutes * 60 * 1000;
  console.log(`Auto-refresh activé toutes les ${intervalInMinutes} minute(s).`);
  
  refreshInterval = setInterval(() => {
    console.log('Rafraîchissement automatique de la liste des jeux...');
    refreshInterface();
  }, intervalInMs);
}

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

// // === CALCUL DE LA TAILLE DU DOSSIER avec diskusage ===
// async function getFolderSize(folderName) {
//   const folderPath = path.join(gamesFolderPath, folderName);
//   if (!fs.existsSync(folderPath)) {
//     console.warn('Dossier introuvable:', folderPath);
//     return 0;
//   }
  
//   try {
//     // Obtenir l'utilisation du disque pour le dossier spécifié
//     const usage = await diskusage.check(folderPath);
//     console.log(`Taille du dossier selon diskusage: ${formatBytes(usage.total - usage.free)}`);
//     return usage.total - usage.free;
//   } catch (err) {
//     console.error('Erreur lors du calcul de la taille:', err);
//     return 0;
//   }
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
// export async function calculateSizeDifference(gameId, metadata) {
//   const realSize = await getFolderSize(gameId);
//   const declaredSize = parseFileSize(metadata);
//   console.log(`Taille réelle : ${formatBytes(realSize)}`);
//   console.log(`Taille déclarée : ${formatBytes(declaredSize)}`);
  
//   if (declaredSize > 0) {
//     const diff = Math.abs(realSize - declaredSize);
//     const percentDiff = (diff / declaredSize) * 100;
//     if (percentDiff > 10) {
//       console.warn(`Attention ! La taille réelle diffère de plus de 10% de la taille déclarée.`);
//       // Tu peux afficher une alerte ou ajouter une info dans ton HTML :
//       gameDetails.innerHTML += `
//       <p style="color: red;"><strong>Attention:</strong> La taille réelle (${(realSize / (1024 * 1024)).toFixed(2)} MB) diffère de la taille annoncée.</p>
//       `;
//     }
//   }
// }