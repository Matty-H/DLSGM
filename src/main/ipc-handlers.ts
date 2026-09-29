import { app, ipcMain, dialog, shell, BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { spawn } from 'child_process';
import Store from './store';
import { fetchGameMetadata } from './dlsite-fetcher';
import type { AppSettings, GameMetadata, LaunchGameResult } from '../shared/ipc-types';

const IMAGE_DOWNLOAD_TIMEOUT_MS = 15000;

// Format des IDs DLsite (ex: RJ123456, RJ01234567). Chaque jeu doit vivre
// dans un dossier portant exactement cet ID, à la racine du dossier de jeux.
const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;

// Initialisation des stores (NeDB, avec migration ponctuelle depuis l'ancien
// format JSON monobloc si celui-ci existe encore)
const settingsStore = new Store('settings.db', {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US',
  blurAdultContent: true,
  genreAliasGroups: []
}, 'settings.json');

const cacheStore = new Store('cache.db', {}, 'cache.json');

/**
 * Rejette tout ID qui n'est pas un ID DLsite : les ID reçus du renderer
 * servent à construire des chemins, un ID du type `..\..` ne doit jamais
 * atteindre `path.join`.
 */
function assertGameId(gameId: unknown): asserts gameId is string {
  if (typeof gameId !== 'string' || !GAME_ID_REGEX.test(gameId)) {
    throw new Error(`ID de jeu invalide : ${String(gameId)}`);
  }
}

/** Vrai si `child` est `parent` lui-même ou un chemin situé dessous. */
export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function getImgCacheDir(): string {
  return path.join(app.getPath('userData'), 'img_cache');
}

async function getGameDir(gameId: string): Promise<string> {
  assertGameId(gameId);
  const settings = await settingsStore.getAll() as unknown as AppSettings;
  if (!settings.destinationFolder) throw new Error('Dossier de jeux non configuré');
  return path.join(settings.destinationFolder, gameId);
}

/**
 * Recherche heuristique de l'exécutable d'un jeu Windows : le plus gros .exe
 * du premier niveau de dossier qui en contient (hors désinstalleurs, crash
 * handlers et redistribuables).
 */
function findExe(dir: string, depth = 0): string | null {
  if (depth > 3) return null; // Limite la profondeur
  const files = fs.readdirSync(dir, { withFileTypes: true });

  const ignored = ['unins', 'unitycrashhandler', 'vcredist', 'vc_redist', 'dxsetup', 'dxwebsetup'];
  const exes = files
    .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.exe') && !ignored.some(word => f.name.toLowerCase().includes(word)))
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
}

function findMacApp(gamePath: string): string | null {
  const appDirName = fs.readdirSync(gamePath).find(file => file.endsWith('.app'));
  return appDirName ? path.join(gamePath, appDirName) : null;
}

/**
 * Exécutable à lancer : celui choisi par l'utilisateur (mémorisé dans le
 * cache, relatif au dossier du jeu) s'il existe toujours, sinon détection
 * automatique.
 */
async function resolveExecutable(gameId: string, gamePath: string): Promise<string | null> {
  const entry = await cacheStore.get(gameId) as GameMetadata | undefined;
  if (entry?.executablePath) {
    const chosen = path.resolve(gamePath, entry.executablePath);
    if (isInside(gamePath, chosen) && fs.existsSync(chosen)) return chosen;
    console.warn(`Exécutable mémorisé introuvable pour ${gameId} (${entry.executablePath}), détection automatique.`);
  }
  if (process.platform === 'darwin') return findMacApp(gamePath);
  if (process.platform === 'win32') return findExe(gamePath);
  return null;
}

type TrackedLaunchResult = LaunchGameResult & { code?: string };

/** Lance un processus et résout à sa fermeture avec la durée de la session. */
function runAndTrack(command: string, args: string[], cwd: string | undefined): Promise<TrackedLaunchResult> {
  const startTime = Date.now();
  const gameProcess = spawn(command, args, { cwd, detached: false, stdio: 'ignore' });

  return new Promise((resolve) => {
    gameProcess.on('exit', () => {
      resolve({ success: true, duration: Math.floor((Date.now() - startTime) / 1000) });
    });
    gameProcess.on('error', (err: NodeJS.ErrnoException) => {
      console.error(`Erreur lors du lancement de l'exécutable: ${err.message}`);
      resolve({ success: false, error: err.message, code: err.code });
    });
  });
}

/** Lance l'exécutable d'un jeu et résout à sa fermeture. */
async function startGameProcess(executablePath: string): Promise<TrackedLaunchResult> {
  if (process.platform === 'darwin') {
    // Sur Mac, 'open -W' attend que l'application se ferme
    return runAndTrack('open', ['-W', executablePath], undefined);
  }

  // cwd = dossier de l'exécutable (et non la racine du jeu) : beaucoup de
  // jeux résolvent leurs fichiers relativement au répertoire courant.
  const result = await runAndTrack(executablePath, [], path.dirname(executablePath));

  // Exécutable exigeant les droits admin : CreateProcess refuse
  // (ERROR_ELEVATION_REQUIRED, remonté en EACCES par Node). On repasse
  // par le shell, qui affiche l'invite UAC — mais le processus n'est
  // alors plus suivi, donc pas de temps de jeu comptabilisé.
  if (!result.success && result.code === 'EACCES' && process.platform === 'win32') {
    const shellError = await shell.openPath(executablePath);
    return shellError === '' ? { success: true, duration: 0, untracked: true } : { success: false, error: shellError };
  }
  return result;
}

/**
 * Ajoute la durée d'une session au temps de jeu. Fait côté main, à la fin du
 * processus : le temps est enregistré même si le renderer a été rechargé
 * pendant la partie.
 */
async function recordPlaySession(gameId: string, durationSeconds: number): Promise<void> {
  await cacheStore.update(gameId, current => ({
    totalPlayTime: ((current.totalPlayTime as number) || 0) + durationSeconds,
    lastPlayed: new Date().toISOString()
  }));
}

/**
 * Enregistre les handlers IPC. À n'appeler qu'une fois : sur macOS la fenêtre
 * peut être recréée (événement `activate`), d'où `getWindow` plutôt qu'une
 * référence figée — un second `ipcMain.handle` sur le même canal lève une erreur.
 */
export function setupIpcHandlers(getWindow: () => BrowserWindow | null): void {
  const showOpenDialog = (options: OpenDialogOptions) => {
    const window = getWindow();
    return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
  };

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

  // Écritures par entrée uniquement, fusionnées ici. L'ancien `save-cache`
  // (cache complet envoyé par le renderer) supprimait toute entrée absente
  // de la copie, éventuellement périmée, du renderer : perte de données dès
  // que deux écritures se croisaient (scan parallèle, note posée pendant un
  // scan...).
  ipcMain.handle('update-cache-entry', async (event: IpcMainInvokeEvent, gameId: string, patch: Record<string, unknown>) => {
    assertGameId(gameId);
    return cacheStore.update(gameId, patch);
  });

  ipcMain.handle('replace-cache-entry', async (event: IpcMainInvokeEvent, gameId: string, data: GameMetadata) => {
    assertGameId(gameId);
    await cacheStore.set(gameId, data);
    return true;
  });

  ipcMain.handle('delete-cache-entry', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    return cacheStore.delete(gameId);
  });

  // --- Sélecteur de Dossier ---
  ipcMain.handle('open-folder-dialog', async () => {
    const result = await showOpenDialog({
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('open-image-dialog', async () => {
    const result = await showOpenDialog({
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
  // Renvoie null (et non []) si le dossier n'existe pas, pour que l'appelant
  // distingue "dossier introuvable" de "dossier vide".
  ipcMain.handle('list-game-folders', async (event: IpcMainInvokeEvent, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) return null;

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      // Seuls les dossiers nommés d'après un ID DLSite (ex: RJ123456) sont des jeux
      return entries.filter(entry => entry.isDirectory() && GAME_ID_REGEX.test(entry.name)).map(entry => entry.name);
    } catch (error) {
      console.error('Erreur lors de la lecture du dossier de jeux:', error);
      return [];
    }
  });

  // Canal dédié plutôt qu'un `open-path` générique : shell.openPath sur un
  // chemin arbitraire exécuterait n'importe quel .exe fourni par le renderer.
  ipcMain.handle('open-game-folder', async (event: IpcMainInvokeEvent, gameId: string) => {
    const gamePath = await getGameDir(gameId);
    if (!fs.existsSync(gamePath)) return false;
    const error = await shell.openPath(gamePath);
    return error === '';
  });

  ipcMain.handle('open-external', async (event: IpcMainInvokeEvent, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  // --- Lancement de Jeu ---
  ipcMain.handle('launch-game', async (event: IpcMainInvokeEvent, gameId: string): Promise<LaunchGameResult> => {
    const gamePath = await getGameDir(gameId);
    if (!fs.existsSync(gamePath)) throw new Error('Dossier du jeu introuvable');

    const executablePath = await resolveExecutable(gameId, gamePath);
    if (!executablePath) throw new Error('Aucun exécutable trouvé pour ce jeu.');

    const { code: _code, ...launchResult } = await startGameProcess(executablePath);
    if (launchResult.success) {
      await recordPlaySession(gameId, launchResult.duration || 0);
    }
    return launchResult;
  });

  ipcMain.handle('choose-game-executable', async (event: IpcMainInvokeEvent, gameId: string) => {
    const gamePath = await getGameDir(gameId);
    if (!fs.existsSync(gamePath)) throw new Error('Dossier du jeu introuvable');

    const result = await showOpenDialog({
      title: `Exécutable de ${gameId}`,
      defaultPath: gamePath,
      properties: ['openFile'],
      filters: process.platform === 'darwin'
        ? [{ name: 'Applications', extensions: ['app'] }]
        : [{ name: 'Exécutables', extensions: ['exe'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const chosen = result.filePaths[0];
    if (!isInside(gamePath, chosen)) {
      throw new Error(`L'exécutable doit se trouver dans le dossier du jeu (${gamePath}).`);
    }

    const relativePath = path.relative(gamePath, chosen);
    const saved = await cacheStore.update(gameId, { executablePath: relativePath });
    if (!saved) throw new Error(`Aucune fiche en cache pour ${gameId}.`);
    return relativePath;
  });

  // --- Récupération des métadonnées DLsite ---
  ipcMain.handle('fetch-game-metadata', async (event: IpcMainInvokeEvent, gameId: string, locale: string) => {
    assertGameId(gameId);
    return fetchGameMetadata(gameId, locale);
  });

  // --- Cache d'images ---
  // Canaux dédiés, à la place des anciens fs-rm / fs-copy / fs-mkdir
  // génériques qui acceptaient n'importe quel chemin venant du renderer.
  ipcMain.handle('reset-image-cache', async () => {
    const imgCacheDir = getImgCacheDir();
    fs.rmSync(imgCacheDir, { recursive: true, force: true });
    fs.mkdirSync(imgCacheDir, { recursive: true });
  });

  ipcMain.handle('set-custom-cover', async (event: IpcMainInvokeEvent, gameId: string, sourceImagePath: string) => {
    assertGameId(gameId);
    if (!/\.(jpe?g|png|gif|webp)$/i.test(sourceImagePath) || !fs.existsSync(sourceImagePath)) {
      throw new Error('Image invalide ou introuvable.');
    }
    const gameImgDir = path.join(getImgCacheDir(), gameId);
    fs.mkdirSync(gameImgDir, { recursive: true });
    fs.copyFileSync(sourceImagePath, path.join(gameImgDir, 'work_image.jpg'));
    return true;
  });

  // --- Téléchargement d'images ---
  // Écrit dans un fichier `.part`, renommé seulement une fois complet : un
  // crash ou une coupure en plein téléchargement ne laisse jamais une image
  // tronquée sous le nom final, que `downloadIfMissing` prendrait ensuite
  // pour valide et ne retenterait plus jamais.
  const download = (url: string, outputPath: string): Promise<void> => {
    const partPath = `${outputPath}.part`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const file = fs.createWriteStream(partPath);

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        file.close(() => fs.unlink(partPath, () => reject(err)));
      };

      file.on('error', fail);

      const request = https.get(url, { timeout: IMAGE_DOWNLOAD_TIMEOUT_MS }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          fail(new Error(`HTTP ${response.statusCode} pour ${url}`));
          return;
        }
        response.on('error', fail);
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            if (settled) return;
            settled = true;
            fs.rename(partPath, outputPath, (err) => {
              if (err) {
                fs.unlink(partPath, () => reject(err));
              } else {
                resolve();
              }
            });
          });
        });
      });

      request.on('timeout', () => {
        request.destroy(new Error(`Timeout de téléchargement (${IMAGE_DOWNLOAD_TIMEOUT_MS}ms) pour ${url}`));
      });

      request.on('error', fail);
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
  ipcMain.handle('download-game-images', async (event: IpcMainInvokeEvent, gameId: string, metadata: GameMetadata) => {
    assertGameId(gameId);
    const gameDir = path.join(getImgCacheDir(), gameId);
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    let allSucceeded = true;

    // 'manual' = jaquette choisie par l'utilisateur (set-custom-cover) : rien
    // à télécharger, et la retenter à chaque scan échouerait indéfiniment.
    if (metadata.work_image && metadata.work_image !== 'manual') {
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
