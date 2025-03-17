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
      alert(`Le jeu s'est fermé après ${durationInSeconds} secondes.`);
    });
  }
}