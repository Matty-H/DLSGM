const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec, spawn } = require('child_process');
const Store = require('./store');

// Initialisation des stores
const settingsStore = new Store('settings.json', {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US'
});

const cacheStore = new Store('cache.json', {});

function setupIpcHandlers(mainWindow) {
  // --- Infos App ---
  ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

  // --- Gestion des Paramètres ---
  ipcMain.handle('get-settings', () => {
    return settingsStore.getAll();
  });

  ipcMain.handle('save-settings', (event, newSettings) => {
    settingsStore.setAll(newSettings);
    return true;
  });

  ipcMain.on('update-language', (event, lang) => {
    settingsStore.set('language', lang);
  });

  // --- Gestion du Cache ---
  ipcMain.handle('get-cache', () => {
    return cacheStore.getAll();
  });

  ipcMain.handle('save-cache', (event, newCache) => {
    cacheStore.setAll(newCache);
    return true;
  });

  // --- Sélecteur de Dossier ---
  ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // --- Opérations Système ---
  ipcMain.handle('list-game-folders', async (event, folderPath) => {
    if (!folderPath || !fs.existsSync(folderPath)) return [];

    try {
      const files = fs.readdirSync(folderPath);
      // Filtre pour les IDs de jeux DLSite typiques (ex: RJ123456)
      return files.filter(file => /^[A-Z]{2}\d{6,9}$/.test(file));
    } catch (error) {
      console.error('Erreur lors de la lecture du dossier de jeux:', error);
      return [];
    }
  });

  ipcMain.handle('open-path', async (event, targetPath) => {
    if (fs.existsSync(targetPath)) {
      shell.openPath(targetPath);
      return true;
    }
    return false;
  });

  ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url);
    return true;
  });

  // --- Lancement de Jeu (avec correction Windows) ---
  ipcMain.handle('launch-game', async (event, gameId) => {
    const settings = settingsStore.getAll();
    const gamesDirPath = settings.destinationFolder;
    if (!gamesDirPath) throw new Error('Dossier de jeux non configuré');

    const gamePath = path.join(gamesDirPath, gameId);
    if (!fs.existsSync(gamePath)) throw new Error('Dossier du jeu introuvable');

    const platform = process.platform;
    let executablePath = '';

    if (platform === 'darwin') {
      const files = fs.readdirSync(gamePath);
      const appDirName = files.find(file => file.endsWith('.app'));
      if (appDirName) {
        executablePath = path.join(gamePath, appDirName);
        // Sur Mac, on peut utiliser 'open' pour les .app
        spawn('open', [executablePath]);
        return { success: true, startTime: Date.now() };
      }
    } else if (platform === 'win32') {
      // Recherche récursive d'un .exe
      const findExe = (dir, depth = 0) => {
        if (depth > 3) return null; // Limite la profondeur
        const files = fs.readdirSync(dir, { withFileTypes: true });

        // D'abord chercher dans le dossier actuel
        const exes = files
          .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.exe') && !f.name.toLowerCase().includes('unins') && !f.name.toLowerCase().includes('unitycrashhandler'))
          .map(f => path.join(dir, f.name));

        if (exes.length > 0) {
          // Tri par taille pour trouver l'exécutable principal (souvent le plus gros)
          return exes.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
        }

        // Sinon chercher dans les sous-dossiers
        for (const f of files) {
          if (f.isDirectory()) {
            const found = findExe(path.join(dir, f.name), depth + 1);
            if (found) return found;
          }
        }
        return null;
      };

      executablePath = findExe(gamePath);
      if (executablePath) {
        const gameProcess = spawn(executablePath, [], {
          cwd: gamePath,
          detached: true,
          stdio: 'ignore'
        });
        gameProcess.unref();
        return { success: true, startTime: Date.now() };
      }
    }

    throw new Error('Aucun exécutable trouvé pour ce jeu.');
  });

  // --- Exécution Scripts Python ---
  ipcMain.handle('run-python-script', async (event, scriptName, args) => {
    // Chemin vers le script python dans la nouvelle structure
    const pythonScriptPath = path.join(__dirname, '..', 'python', scriptName);

    return new Promise((resolve, reject) => {
      const options = {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      };

      const cmd = `python "${pythonScriptPath}" ${args.map(a => `"${a}"`).join(' ')}`;
      exec(cmd, options, (error, stdout, stderr) => {
        if (error) {
          console.error(`Erreur exécution Python (${scriptName}):`, error.message);
          reject(error.message);
          return;
        }
        resolve(stdout);
      });
    });
  });

  // --- Utilitaires de fichiers ---
  ipcMain.handle('path-join', (event, ...args) => path.join(...args));
  ipcMain.handle('fs-exists', (event, path) => fs.existsSync(path));
  ipcMain.handle('fs-mkdir', (event, path) => fs.mkdirSync(path, { recursive: true }));
  ipcMain.handle('fs-readdir', (event, path) => fs.readdirSync(path));
  ipcMain.handle('fs-rm', (event, path) => fs.rmSync(path, { recursive: true, force: true }));

  // --- Téléchargement d'images ---
  ipcMain.handle('download-game-images', async (event, gameId, metadata, destBaseDir) => {
    const gameDir = path.join(destBaseDir, gameId);
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    const download = (url, outputPath) => {
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
    };

    try {
      const results = [];
      if (metadata.work_image) {
        const url = metadata.work_image.startsWith('http') ? metadata.work_image : `https:${metadata.work_image}`;
        await download(url, path.join(gameDir, 'work_image.jpg'));
      }

      if (metadata.sample_images && Array.isArray(metadata.sample_images)) {
        for (let i = 0; i < metadata.sample_images.length; i++) {
          const url = metadata.sample_images[i].startsWith('http') ? metadata.sample_images[i] : `https:${metadata.sample_images[i]}`;
          await download(url, path.join(gameDir, `sample_${i + 1}.jpg`));
        }
      }
      return true;
    } catch (error) {
      console.error(`Erreur téléchargement images (${gameId}):`, error);
      return false;
    }
  });
}

module.exports = { setupIpcHandlers };
