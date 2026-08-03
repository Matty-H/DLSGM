import { app, ipcMain, dialog, shell, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { spawn } from 'child_process';
import Store from './store';
import { fetchGameMetadata } from './dlsite-fetcher';
import type { AppSettings, GameCache, GameMetadata, LaunchGameResult } from '../shared/ipc-types';

const IMAGE_DOWNLOAD_TIMEOUT_MS = 15000;

// Initialisation des stores (NeDB, avec migration ponctuelle depuis l'ancien
// format JSON monobloc si celui-ci existe encore)
const settingsStore = new Store('settings.db', {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US'
}, 'settings.json');

const cacheStore = new Store('cache.db', {}, 'cache.json');

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // --- Infos App ---
  ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

  // --- Gestion des Paramètres ---
  ipcMain.handle('get-settings', () => {
    return settingsStore.getAll();
  });

  ipcMain.handle('save-settings', async (event: IpcMainInvokeEvent, newSettings: AppSettings) => {
    await settingsStore.setAll(newSettings as unknown as Record<string, unknown>);
    return true;
  });

  ipcMain.on('update-language', (event, lang: string) => {
    // Pas de réponse attendue par l'appelant (ipcRenderer.send) : on capture
    // l'erreur ici pour éviter un rejet de promesse non géré dans le main process.
    settingsStore.set('language', lang).catch(error => {
      console.error('Erreur lors de la mise à jour de la langue:', error);
    });
  });

  // --- Gestion du Cache ---
  ipcMain.handle('get-cache', () => {
    return cacheStore.getAll();
  });

  ipcMain.handle('save-cache', async (event: IpcMainInvokeEvent, newCache: GameCache) => {
    await cacheStore.setAll(newCache);
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

  ipcMain.handle('open-image-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp', 'jpeg'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // --- Opérations Système ---
  ipcMain.handle('list-game-folders', async (event: IpcMainInvokeEvent, folderPath: string) => {
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

  ipcMain.handle('open-path', async (event: IpcMainInvokeEvent, targetPath: string) => {
    if (fs.existsSync(targetPath)) {
      shell.openPath(targetPath);
      return true;
    }
    return false;
  });

  ipcMain.handle('open-external', async (event: IpcMainInvokeEvent, url: string) => {
    shell.openExternal(url);
    return true;
  });

  // --- Lancement de Jeu (avec correction Windows) ---
  ipcMain.handle('launch-game', async (event: IpcMainInvokeEvent, gameId: string): Promise<LaunchGameResult> => {
    const settings = await settingsStore.getAll() as unknown as AppSettings;
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
        const startTime = Date.now();
        // Sur Mac, 'open -W' attend que l'application se ferme
        const gameProcess = spawn('open', ['-W', executablePath]);

        return new Promise((resolve) => {
          gameProcess.on('exit', () => {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            resolve({ success: true, duration });
          });
          gameProcess.on('error', (err) => {
            resolve({ success: false, error: err.message });
          });
        });
      }
    } else if (platform === 'win32') {
      // Recherche récursive d'un .exe
      const findExe = (dir: string, depth = 0): string | null => {
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

      executablePath = findExe(gamePath) ?? '';
      if (executablePath) {
        const startTime = Date.now();
        const gameProcess = spawn(executablePath, [], {
          cwd: gamePath,
          detached: false,
          stdio: 'ignore'
        });

        return new Promise((resolve) => {
          gameProcess.on('exit', (code) => {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            resolve({ success: true, duration });
          });

          gameProcess.on('error', (err) => {
            console.error(`Erreur lors du lancement de l'exécutable: ${err.message}`);
            resolve({ success: false, error: err.message });
          });
        });
      }
    }

    throw new Error('Aucun exécutable trouvé pour ce jeu.');
  });

  // --- Récupération des métadonnées DLsite ---
  ipcMain.handle('fetch-game-metadata', async (event: IpcMainInvokeEvent, gameId: string, locale: string) => {
    return fetchGameMetadata(gameId, locale);
  });

  // --- Utilitaires de fichiers ---
  ipcMain.handle('path-join', (event: IpcMainInvokeEvent, args: string[]) => path.join(...args));
  ipcMain.handle('fs-exists', (event: IpcMainInvokeEvent, targetPath: string) => fs.existsSync(targetPath));
  ipcMain.handle('fs-mkdir', (event: IpcMainInvokeEvent, targetPath: string) => fs.mkdirSync(targetPath, { recursive: true }));
  ipcMain.handle('fs-readdir', (event: IpcMainInvokeEvent, targetPath: string) => fs.readdirSync(targetPath));
  ipcMain.handle('fs-rm', (event: IpcMainInvokeEvent, targetPath: string) => fs.rmSync(targetPath, { recursive: true, force: true }));
  ipcMain.handle('fs-copy', (event: IpcMainInvokeEvent, src: string, dest: string) => {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    return true;
  });

  // --- Téléchargement d'images ---
  const download = (url: string, outputPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      const request = https.get(url, { timeout: IMAGE_DOWNLOAD_TIMEOUT_MS }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          file.close();
          fs.unlink(outputPath, () => reject(new Error(`HTTP ${response.statusCode} pour ${url}`)));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('timeout', () => {
        request.destroy(new Error(`Timeout de téléchargement (${IMAGE_DOWNLOAD_TIMEOUT_MS}ms) pour ${url}`));
      });

      request.on('error', (err) => {
        file.close();
        fs.unlink(outputPath, () => reject(err));
      });
    });
  };

  // Ne télécharge que les fichiers absents : économise la bande passante et
  // permet de ne réessayer que les images manquantes sans tout retélécharger.
  const downloadIfMissing = async (url: string, outputPath: string): Promise<boolean> => {
    if (fs.existsSync(outputPath)) return true;
    try {
      await download(url, outputPath);
      return true;
    } catch (error) {
      console.error(`Erreur téléchargement image (${outputPath}):`, (error as Error).message);
      return false;
    }
  };

  // Retourne true seulement si toutes les images attendues sont présentes sur
  // le disque à la fin de l'appel (déjà là ou nouvellement téléchargées), ce
  // qui permet à l'appelant de savoir s'il doit retenter plus tard.
  ipcMain.handle('download-game-images', async (event: IpcMainInvokeEvent, gameId: string, metadata: GameMetadata, destBaseDir: string) => {
    const gameDir = path.join(destBaseDir, gameId);
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    let allSucceeded = true;

    if (metadata.work_image) {
      const url = metadata.work_image.startsWith('http') ? metadata.work_image : `https:${metadata.work_image}`;
      const ok = await downloadIfMissing(url, path.join(gameDir, 'work_image.jpg'));
      allSucceeded = allSucceeded && ok;
    }

    if (metadata.sample_images && Array.isArray(metadata.sample_images)) {
      for (let i = 0; i < metadata.sample_images.length; i++) {
        const url = metadata.sample_images[i].startsWith('http') ? metadata.sample_images[i] : `https:${metadata.sample_images[i]}`;
        const ok = await downloadIfMissing(url, path.join(gameDir, `sample_${i + 1}.jpg`));
        allSucceeded = allSucceeded && ok;
      }
    }

    return allSucceeded;
  });
}
