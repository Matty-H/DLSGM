const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, spawn } = require('child_process');
const diskusage = require('diskusage');
import { loadCache, updateCacheEntry } from './cacheManager.js';
import { loadSettings } from './settings.js';
import { setGameRunning, refreshInterface } from './uiManager.js';
import { detectGameEngine } from './engineDetector.js';

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


export function getGamesFolderPath() {
  const settings = loadSettings();
  return settings.destinationFolder || null;
}

// === GAME FUNCTIONS ===
export async function openGameFolder(gameId) {
  try {
    // Check if the user is trying to open a game folder on an unsupported OS.
    if (!platformUtils.isSupported()) {
      throw new Error('Unsupported OS');
    }

    // Get the path to the folder where all the games are stored.
    const gamesDirPath = getGamesFolderPath();
    // If the user hasn't configured the game directory, throw an error.
    if (!gamesDirPath) {
      throw new Error('Game directory not configured');
    }

    // Construct the path to the folder of the game that the user wants to open.
    const targetFolderPath = path.join(gamesDirPath, gameId);

    // Open the folder using the platform-specific function.
    platformUtils.openFolder(targetFolderPath);

    // Detect the game engine that the game is using.
    const engineInfo = await detectGameEngine(gameId, gamesDirPath);

    // Log the detected engine type to the console.
    console.log(`Engine detected for ${gameId}:`, engineInfo.engineType);
  } catch (error) {
    // If there's an error, alert the user and log the error to the console.
    alert(error.message);
    console.error('Error opening game folder:', error);
  }
}


export function launchGame(gameId) {
  try {
    // For now, we only support launching games on macOS.
    // TODO: Implement support for launching games on Windows.
    if (platform !== 'darwin') {
      throw new Error('Game launch is only supported on macOS for now');
    }
    
    // Try to get the path to the games directory.
    // If it's not configured, we can't launch the game.
    const gamesDirPath = getGamesFolderPath();
    if (!gamesDirPath) {
      throw new Error('Games directory not configured');
    }
    
    // Get the path to the directory containing the game we want to launch.
    const gameDirPath = path.join(gamesDirPath, gameId);
    
    // Find the .app file in the game directory.
    // macOS apps are packaged as .app directories, so this is the entry point to the app.
    const files = fs.readdirSync(gameDirPath);
    const appDirName = files.find(file => file.endsWith('.app'));
    if (!appDirName) {
      throw new Error('No .app file found in the directory');
    }
    
    // Find the executable binary inside the .app directory.
    // On macOS, the binary is stored in Contents/MacOS/.
    const macOSDirPath = path.join(gameDirPath, appDirName, 'Contents', 'MacOS');
    const macOSFiles = fs.readdirSync(macOSDirPath);
    const binaryName = macOSFiles[0];
    if (!binaryName) {
      throw new Error('No executable binary found in Contents/MacOS/');
    }
    
    // Get the full path to the executable binary.
    const executablePath = path.join(macOSDirPath, binaryName);
    
    // Launch the game and track its execution.
    // We use spawn() to launch the game, and set up some event listeners to track the game's execution.
    // We also set the game as "running" in the UI, so that the user knows that the game is currently running.
    return runGameProcess(gameId, executablePath);
  } catch (error) {
    // If there's an error, alert the user and log the error to the console.
    alert(error.message);
    console.error('Error launching game:', error);
    return null;
  }
}

function launchGameProcess(gameId, executablePath) {
  // Lorsqu'un utilisateur clique sur le bouton "Lancer" pour un jeu,
  // nous devons lancer le jeu et le suivre pour enregistrer le temps passé.
  // Nous utilisons spawn() pour lancer le jeu en tant que processus externe,
  // et nous utilisons des gestionnaires d'événement pour suivre l'exécution du jeu.
  // Nous mettons également à jour l'état du jeu dans l'interface utilisateur,
  // pour que l'utilisateur sache que le jeu est actuellement en cours d'exécution.

  // Indiquez que le jeu est en cours d'exécution
  setGameRunning(gameId, true);

  // Lancer le jeu et enregistrer le temps de jeu
  const startTime = Date.now();
  const gameProcess = spawn(executablePath);

  // Si le lancement du jeu échoue, affichez un message d'erreur
  gameProcess.on('error', (error) => {
    console.error(`Failed to launch game: ${error.message}`);
    alert('Impossible de lancer le jeu.');
    setGameRunning(gameId, false);
  });

  // Lorsque le jeu se termine, mettez à jour le temps total de jeu
  gameProcess.on('close', (code) => {
    const endTime = Date.now();
    const playTimeInSeconds = Math.round((endTime - startTime) / 1000);

    setGameRunning(gameId, false);
    updateGameTime(gameId, playTimeInSeconds);
  });

  // Retournez le processus du jeu, au cas où nous devions le stopper manuellement
  return gameProcess;
}

// === GAME STATS MANAGEMENT ===
// This function is called whenever a game is launched or closed.
// It updates the total play time for the game in the cache.
export function updateGameTime(gameId, sessionTimeInSeconds) {
  // Load the cache from the file system
  const cache = loadCache();

  // Get the entry for this game in the cache,
  // or create a new one if it doesn't exist
  const gameEntry = cache[gameId] || {};

  // Update the total play time
  // Get the current total play time for this game
  const currentTotalTime = gameEntry.totalPlayTime || 0;

  // Calculate the new total play time by adding the time spent in this session
  const newTotalTime = currentTotalTime + sessionTimeInSeconds;

  // Update the entry in the cache with the new total play time
  updateCacheEntry(cache, gameId, {
    // Set the total play time to the new value
    totalPlayTime: newTotalTime,

    // Set the last played time to the current timestamp
    lastPlayed: new Date().toISOString()
  });

  // Refresh the UI to show the updated information
  refreshInterface();
}

// === UI REFRESH MANAGEMENT ===
let refreshInterval = null;

export function startAutoRefresh(intervalInMinutes = 1) {
  // Check if there's an existing refresh interval and clear it to avoid multiple intervals running
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // If the interval is set to 0 or negative, disable the auto-refresh functionality
  if (intervalInMinutes <= 0) {
    return;
  }

  // Convert the interval from minutes to milliseconds for the setInterval function
  const intervalInMilliseconds = intervalInMinutes * 60 * 1000;

  // Set up a new interval that will call the refreshInterface function at the specified interval
  refreshInterval = setInterval(
    () => refreshInterface(),
    intervalInMilliseconds
  );
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