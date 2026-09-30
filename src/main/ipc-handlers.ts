import { app, ipcMain, dialog, shell, BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { spawn } from 'child_process';
import Store from './store';
import { fetchWork } from './dlsite-fetcher';
import { GenreTranslations, KNOWN_GENRE_TRANSLATIONS, pairsFromAliasGroups } from './genre-translations';
import { applyDlsiteProxy, dlsiteFetch } from './dlsite-net';
import { detectEngine, findSaveLocations, readPatches, applyUserPatch, installAutoTranslator, uninstallLastPatch, type SaveSource } from './game-tools';
import { boxFileRoot, boxNameFor, deleteGameBox, ensureGameBox, findSandboxieDir, sandboxedCommand, sandboxedPathFor } from './sandboxie';
import { createSaveBackup, deleteSaveBackup, listSaveBackups, restoreSaveBackup } from './save-backups';
import { ARCHIVE_EXTENSIONS, importArchive, removeStaleImports } from './archive-import';
import { Wishlist } from './wishlist';
import { describeWorkspace, workspaceRoot } from './workspace';
import { snapshotDatabase } from './db-backup';
import { DEFAULT_LAN_PORT, LanShare } from './lan-share';
import type { AppSettings, ArchiveImportResult, GameImagesPlan, GameMetadata, GameToolsInfo, LanSendRequest, LaunchGameResult, PlaySession, SandboxieStatus } from '../shared/ipc-types';

// Durée totale d'un téléchargement d'image (un proxy peut être lent).
const IMAGE_DOWNLOAD_TIMEOUT_MS = 60000;

// Taille maximale d'une image ajoutée à la main (glisser-déposer / parcourir).
const MAX_MANUAL_IMAGE_BYTES = 30 * 1024 * 1024;

// Marqueur (à la place d'une URL DLsite) d'une image fournie par
// l'utilisateur : rien à télécharger, et à préserver lors d'un reset du
// cache d'images puisqu'elle n'existe nulle part ailleurs.
const MANUAL_IMAGE = 'manual';

// Start.exe qui se termine en erreur aussi vite n'a pas lancé le jeu (service
// Sandboxie arrêté, exécutable refusé...) — heuristique : un vrai jeu qui
// quitte en erreur dans ce délai compte aussi comme un échec de lancement.
const SANDBOX_LAUNCH_FAILURE_WINDOW_S = 5;

// Sessions gardées dans l'historique d'un jeu (les plus anciennes sortent).
const MAX_PLAY_SESSIONS = 2000;

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
  genreAliasGroups: [],
  sandboxLaunch: false,
  startFullscreen: false,
  lanSharePort: DEFAULT_LAN_PORT,
  dlsiteProxy: '',
  collections: [],
  autoBackupSaves: true,
  closeToTray: false,
  workspaceFolder: ''
}, 'settings.json');

const cacheStore = new Store('cache.db', {}, 'cache.json');

// Liste de souhaits : store séparé, jamais mêlé au cache des jeux.
const wishlistStore = new Store('wishlist.db', {});

// Dictionnaire des tags JP → EN.
const genreTranslations = new GenreTranslations(new Store('translations.db', {}));

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

/** Paramètres persistés (lus par main.ts au démarrage, ex: plein écran). */
export async function getSettings(): Promise<AppSettings> {
  return await settingsStore.getAll() as unknown as AppSettings;
}

/**
 * Vérifie qu'une donnée reçue du renderer est bien une image (signature
 * JPEG, PNG, GIF ou WebP) de taille raisonnable, avant de l'écrire sur disque.
 */
function assertImageBytes(data: unknown): asserts data is Uint8Array {
  if (!(data instanceof Uint8Array)) throw new Error('Image invalide.');
  if (data.byteLength === 0 || data.byteLength > MAX_MANUAL_IMAGE_BYTES) {
    throw new Error(`Image vide ou trop lourde (max ${MAX_MANUAL_IMAGE_BYTES / 1024 / 1024} Mo).`);
  }
  const b = data;
  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isGif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  const isWebp = b.byteLength > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isGif && !isWebp) {
    throw new Error('Format d\'image non pris en charge (JPEG, PNG, GIF ou WebP).');
  }
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

  // Sinon chercher dans les sous-dossiers (hors métadonnées DLSGM et mods :
  // BepInEx/XUnity embarquent leurs propres .exe utilitaires)
  for (const f of files) {
    if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'BepInEx') {
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

type TrackedLaunchResult = LaunchGameResult & { code?: string; exitCode?: number | null };

/** Lance un processus et résout à sa fermeture avec la durée de la session. */
function runAndTrack(command: string, args: string[], cwd: string | undefined): Promise<TrackedLaunchResult> {
  const startTime = Date.now();
  const gameProcess = spawn(command, args, { cwd, detached: false, stdio: 'ignore' });

  return new Promise((resolve) => {
    gameProcess.on('exit', (exitCode) => {
      resolve({ success: true, duration: Math.floor((Date.now() - startTime) / 1000), exitCode });
    });
    gameProcess.on('error', (err: NodeJS.ErrnoException) => {
      console.error(`Erreur lors du lancement de l'exécutable: ${err.message}`);
      resolve({ success: false, error: err.message, code: err.code });
    });
  });
}

/**
 * Lance l'exécutable d'un jeu — dans sa sandbox Sandboxie si l'option est
 * active et que le jeu n'en est pas exclu — et résout à sa fermeture.
 */
async function startGameProcess(gameId: string, gamePath: string, executablePath: string): Promise<TrackedLaunchResult> {
  const settings = await settingsStore.getAll() as unknown as AppSettings;
  const entry = await cacheStore.get(gameId) as GameMetadata | undefined;

  if (process.platform === 'win32' && settings.sandboxLaunch && !entry?.sandboxDisabled) {
    // Jamais de repli hors sandbox : l'utilisateur a demandé l'isolation.
    const sandboxieDir = await findSandboxieDir();
    if (!sandboxieDir) {
      throw new Error('Sandboxie-Plus est introuvable. Installe-le, désactive le lancement en sandbox dans les paramètres, ou exclus ce jeu de la sandbox.');
    }
    const box = await ensureGameBox(sandboxieDir, gameId, gamePath);
    const { command, args } = sandboxedCommand(sandboxieDir, box, executablePath);
    const result = await runAndTrack(command, args, path.dirname(executablePath));
    if (result.success && result.exitCode !== 0 && (result.duration ?? 0) < SANDBOX_LAUNCH_FAILURE_WINDOW_S) {
      return { success: false, error: `Sandboxie n'a pas pu lancer le jeu (code ${result.exitCode}). Si le jeu refuse de tourner en sandbox, exclus-le depuis sa fiche.` };
    }
    return result;
  }

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
 * Rassemble les infos "outils" d'un jeu. Le dossier d'installation est celui
 * de l'exécutable (le jeu peut être rangé dans un sous-dossier de RJxxxxxx).
 */
async function getGameToolsInfo(gameId: string): Promise<Omit<GameToolsInfo, 'saveLocations'> & {
  gamePath: string;
  installRootAbs: string;
  saveLocations: SaveSource[];
}> {
  const gamePath = await getGameDir(gameId);
  if (!fs.existsSync(gamePath)) throw new Error('Dossier du jeu introuvable');
  const exePath = await resolveExecutable(gameId, gamePath);
  const installRootAbs = exePath ? path.dirname(exePath) : gamePath;
  const engine = detectEngine(installRootAbs, exePath);
  const saveLocations = findSaveLocations(installRootAbs, exePath, engine);
  return {
    gamePath,
    installRootAbs,
    engine,
    installRoot: path.relative(gamePath, installRootAbs),
    saveLocations: [...saveLocations, ...await sandboxedSaveLocations(gameId, gamePath, saveLocations)],
    patches: readPatches(gamePath),
    sandbox: await getGameSandboxInfo(gameId)
  };
}

async function getGameSandboxInfo(gameId: string): Promise<GameToolsInfo['sandbox']> {
  const settings = await settingsStore.getAll() as unknown as AppSettings;
  return {
    globallyEnabled: Boolean(settings.sandboxLaunch),
    available: (await findSandboxieDir()) !== null,
    boxName: boxNameFor(gameId)
  };
}

/**
 * Jeu lancé dans Sandboxie : ce qu'il écrit hors de son dossier (AppData...)
 * atterrit dans sa sandbox. Ses emplacements de sauvegarde y sont ajoutés
 * (libellé suffixé "(sandbox)"), sinon la copie des sauvegardes ne verrait
 * que les dossiers réels, vides ou périmés.
 */
async function sandboxedSaveLocations(gameId: string, gamePath: string, locations: SaveSource[]): Promise<SaveSource[]> {
  const outside = locations.filter(l => !isInside(gamePath, l.path));
  if (outside.length === 0 || process.platform !== 'win32') return [];
  const settings = await getSettings();
  const entry = await cacheStore.get(gameId) as GameMetadata | undefined;
  if (!settings.sandboxLaunch || entry?.sandboxDisabled) return [];
  const sandboxieDir = await findSandboxieDir();
  const fileRoot = sandboxieDir ? await boxFileRoot(sandboxieDir, gameId) : null;
  if (!fileRoot) return [];

  const result: SaveSource[] = [];
  for (const location of outside) {
    const sandboxed = sandboxedPathFor(fileRoot, app.getPath('home'), location.path);
    if (!sandboxed) continue;
    let exists = false;
    try {
      exists = fs.statSync(sandboxed).isDirectory();
    } catch {
      // pas encore créé dans la sandbox
    }
    result.push({ ...location, label: `${location.label} (sandbox)`, path: sandboxed, exists });
  }
  return result;
}

// Jeux en cours d'exécution (lancements suivis) : on ne vide pas la sandbox
// d'un jeu qui tourne encore.
const runningGames = new Set<string>();

function publicToolsInfo({ gamePath: _g, installRootAbs: _r, saveLocations, ...info }: Awaited<ReturnType<typeof getGameToolsInfo>>): GameToolsInfo {
  return { ...info, saveLocations: saveLocations.map(({ fileFilter: _f, ...location }) => location) };
}

// Une seule opération de patch à la fois par jeu (double clic, etc.).
const patchingGames = new Set<string>();
async function withPatchLock<T>(gameId: string, work: () => Promise<T>): Promise<T> {
  if (patchingGames.has(gameId)) throw new Error('Une opération de patch est déjà en cours pour ce jeu.');
  patchingGames.add(gameId);
  try {
    return await work();
  } finally {
    patchingGames.delete(gameId);
  }
}

/**
 * Ajoute la durée d'une session au temps de jeu. Fait côté main, à la fin du
 * processus : le temps est enregistré même si le renderer a été rechargé
 * pendant la partie.
 */
async function recordPlaySession(gameId: string, durationSeconds: number): Promise<void> {
  const end = new Date();
  await cacheStore.update(gameId, current => {
    const sessions = Array.isArray(current.playSessions) ? current.playSessions as PlaySession[] : [];
    return {
      totalPlayTime: ((current.totalPlayTime as number) || 0) + durationSeconds,
      lastPlayed: end.toISOString(),
      // Lancement non suivi (durée 0) : rien à historiser.
      ...(durationSeconds > 0 && {
        playSessions: [
          ...sessions,
          { start: new Date(end.getTime() - durationSeconds * 1000).toISOString(), duration: durationSeconds }
        ].slice(-MAX_PLAY_SESSIONS)
      })
    };
  });
}

// Une seule opération de copie/restauration de sauvegardes à la fois par jeu.
const backingUpGames = new Set<string>();
async function withBackupLock<T>(gameId: string, work: () => Promise<T>): Promise<T> {
  if (backingUpGames.has(gameId)) throw new Error('Une copie ou restauration des sauvegardes est déjà en cours pour ce jeu.');
  backingUpGames.add(gameId);
  try {
    return await work();
  } finally {
    backingUpGames.delete(gameId);
  }
}

// Échange de jeux en réseau local. Créé par setupIpcHandlers (il a besoin
// de la fenêtre pour notifier le renderer), fermé à l'arrêt par main.ts.
let lanShare: LanShare | null = null;

/** Ferme la réception réseau local (le port) avant de quitter. */
export async function shutdownLanShare(): Promise<void> {
  lanShare?.cancelSend();
  await lanShare?.stopReceiver();
}

/**
 * Enregistre les handlers IPC. À n'appeler qu'une fois : sur macOS la fenêtre
 * peut être recréée (événement `activate`), d'où `getWindow` plutôt qu'une
 * référence figée — un second `ipcMain.handle` sur le même canal lève une erreur.
 */
export function setupIpcHandlers(getWindow: () => BrowserWindow | null, onSettingsSaved?: (settings: AppSettings) => void): void {
  const showOpenDialog = (options: OpenDialogOptions) => {
    const window = getWindow();
    return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
  };

  // --- Infos App ---
  ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

  // --- Échange de jeux en réseau local ---
  const share = new LanShare({
    getDestinationFolder: async () => (await getSettings()).destinationFolder,
    getImgCacheDir,
    getCacheEntry: async gameId => await cacheStore.get(gameId) as GameMetadata | undefined,
    insertCacheEntry: (gameId, entry) => cacheStore.insert(gameId, entry),
    emitProgress: progress => getWindow()?.webContents.send('lan-transfer-progress', progress),
    emitReceiverStatus: status => getWindow()?.webContents.send('lan-receiver-status', status)
  });
  lanShare = share;

  ipcMain.handle('get-lan-receiver-status', () => share.status());
  ipcMain.handle('start-lan-receiver', (event: IpcMainInvokeEvent, port: number) => share.startReceiver(port));
  ipcMain.handle('stop-lan-receiver', () => share.stopReceiver());
  ipcMain.handle('discover-lan-peers', () => share.discoverPeers());
  ipcMain.handle('send-games-over-lan', (event: IpcMainInvokeEvent, request: LanSendRequest) => share.sendGames(request, getGameDir));
  ipcMain.handle('cancel-lan-send', () => share.cancelSend());

  // --- Gestion des Paramètres ---
  ipcMain.handle('get-settings', () => {
    return settingsStore.getAll();
  });

  ipcMain.handle('save-settings', async (event: IpcMainInvokeEvent, newSettings: AppSettings) => {
    await settingsStore.setAll(newSettings as unknown as Record<string, unknown>);
    await applyDlsiteProxy(newSettings.dlsiteProxy);
    onSettingsSaved?.(newSettings);
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

    let result: TrackedLaunchResult;
    runningGames.add(gameId);
    try {
      result = await startGameProcess(gameId, gamePath, executablePath);
    } finally {
      runningGames.delete(gameId);
    }

    const { code: _code, exitCode: _exitCode, ...launchResult } = result;
    if (launchResult.success) {
      await recordPlaySession(gameId, launchResult.duration || 0);
      // Copie des sauvegardes à la fermeture du jeu. Pas pour un lancement
      // non suivi : le jeu tourne encore, ses sauvegardes n'ont pas bougé.
      // Un échec ne doit pas faire échouer le lancement (déjà terminé).
      if (!launchResult.untracked && (await getSettings()).autoBackupSaves !== false) {
        try {
          await withBackupLock(gameId, async () => createSaveBackup(gameId, (await getGameToolsInfo(gameId)).saveLocations, 'auto'));
        } catch (error) {
          console.error(`Copie automatique des sauvegardes de ${gameId} impossible:`, error);
        }
      }
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

  // --- Outils par jeu (moteur, sauvegardes, patchs) ---
  ipcMain.handle('get-game-tools-info', async (event: IpcMainInvokeEvent, gameId: string) => {
    return publicToolsInfo(await getGameToolsInfo(gameId));
  });

  ipcMain.handle('open-save-location', async (event: IpcMainInvokeEvent, gameId: string, index: number) => {
    const { saveLocations } = await getGameToolsInfo(gameId);
    const location = saveLocations[index];
    if (!location || !fs.existsSync(location.path)) return false;
    return (await shell.openPath(location.path)) === '';
  });

  ipcMain.handle('install-auto-translator', async (event: IpcMainInvokeEvent, gameId: string, targetLanguage: string) => {
    return withPatchLock(gameId, async () => {
      const info = await getGameToolsInfo(gameId);
      await installAutoTranslator(info.gamePath, info.installRootAbs, info.engine, targetLanguage);
      return publicToolsInfo(await getGameToolsInfo(gameId));
    });
  });

  ipcMain.handle('apply-user-patch', async (event: IpcMainInvokeEvent, gameId: string, source: 'zip' | 'folder') => {
    return withPatchLock(gameId, async () => {
      const info = await getGameToolsInfo(gameId);
      const result = await showOpenDialog(source === 'zip'
        ? { title: `Patch pour ${gameId}`, properties: ['openFile'], filters: [{ name: 'Archive zip', extensions: ['zip'] }] }
        : { title: `Patch pour ${gameId}`, properties: ['openDirectory'] });
      if (result.canceled || result.filePaths.length === 0) return null;

      const sourcePath = result.filePaths[0];
      if (isInside(info.gamePath, sourcePath)) throw new Error('Le patch ne peut pas se trouver dans le dossier du jeu lui-même.');
      await applyUserPatch(info.gamePath, info.installRootAbs, sourcePath);
      return publicToolsInfo(await getGameToolsInfo(gameId));
    });
  });

  ipcMain.handle('uninstall-last-patch', async (event: IpcMainInvokeEvent, gameId: string) => {
    return withPatchLock(gameId, async () => {
      const gamePath = await getGameDir(gameId);
      uninstallLastPatch(gamePath);
      return publicToolsInfo(await getGameToolsInfo(gameId));
    });
  });

  // --- Import d'archives ---
  let importing = false;
  ipcMain.handle('import-game-archives', async (): Promise<ArchiveImportResult[]> => {
    if (importing) throw new Error('Un import est déjà en cours.');
    importing = true;
    try {
      const { destinationFolder } = await getSettings();
      if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new Error('Dossier de jeux non configuré ou introuvable.');
      const result = await showOpenDialog({
        title: 'Importer des jeux depuis leur archive',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Archives (.zip, .rar, .7z, .part1.exe)', extensions: ARCHIVE_EXTENSIONS }]
      });
      if (result.canceled) return [];
      await removeStaleImports(destinationFolder);

      const results: ArchiveImportResult[] = [];
      for (const [i, file] of result.filePaths.entries()) {
        getWindow()?.webContents.send('archive-import-progress', { file: path.basename(file), index: i + 1, total: result.filePaths.length });
        try {
          const { gameId } = await importArchive(file, destinationFolder);
          results.push({ file: path.basename(file), gameId });
        } catch (error) {
          results.push({ file: path.basename(file), error: error instanceof Error ? error.message : String(error) });
        }
      }
      return results;
    } finally {
      importing = false;
    }
  });

  // --- Copie de la base (avant une mise à jour groupée) ---
  ipcMain.handle('snapshot-cache', async () => {
    // Écritures en attente appliquées avant la copie.
    await cacheStore.getAll();
    return snapshotDatabase(app.getPath('userData'), 'cache.db');
  });

  // --- Dossier de travaux (data mining...) ---

  const gameWorkspaceDir = async (gameId: string) => {
    assertGameId(gameId);
    return path.join(workspaceRoot((await getSettings()).workspaceFolder, app.getPath('documents')), gameId);
  };

  ipcMain.handle('get-workspace-root', async () => workspaceRoot((await getSettings()).workspaceFolder, app.getPath('documents')));

  ipcMain.handle('get-game-workspace', async (event: IpcMainInvokeEvent, gameId: string) => describeWorkspace(await gameWorkspaceDir(gameId)));

  ipcMain.handle('open-game-workspace', async (event: IpcMainInvokeEvent, gameId: string) => {
    const dir = await gameWorkspaceDir(gameId);
    await fs.promises.mkdir(dir, { recursive: true });
    const error = await shell.openPath(dir);
    if (error) throw new Error(`Impossible d'ouvrir le dossier de travaux : ${error}`);
    return describeWorkspace(dir);
  });

  // --- Copies des sauvegardes ---


  ipcMain.handle('list-save-backups', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    return listSaveBackups(gameId);
  });

  ipcMain.handle('create-save-backup', async (event: IpcMainInvokeEvent, gameId: string) => {
    return withBackupLock(gameId, async () => createSaveBackup(gameId, (await getGameToolsInfo(gameId)).saveLocations, 'manual'));
  });

  ipcMain.handle('restore-save-backup', async (event: IpcMainInvokeEvent, gameId: string, backupId: string) => {
    assertGameId(gameId);
    if (runningGames.has(gameId)) throw new Error("Le jeu est en cours d'exécution : ferme-le avant de restaurer ses sauvegardes.");
    return withBackupLock(gameId, async () => restoreSaveBackup(gameId, backupId, (await getGameToolsInfo(gameId)).saveLocations));
  });

  ipcMain.handle('delete-save-backup', async (event: IpcMainInvokeEvent, gameId: string, backupId: string) => {
    assertGameId(gameId);
    return withBackupLock(gameId, () => deleteSaveBackup(gameId, backupId));
  });

  // --- Sandbox Sandboxie-Plus ---

  ipcMain.handle('get-sandboxie-status', async (): Promise<SandboxieStatus> => {
    const installDir = await findSandboxieDir();
    return { available: installDir !== null, installDir };
  });

  ipcMain.handle('clear-game-sandbox', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    if (runningGames.has(gameId)) throw new Error("Le jeu est en cours d'exécution : ferme-le avant de vider sa sandbox.");
    const sandboxieDir = await findSandboxieDir();
    if (!sandboxieDir) throw new Error('Sandboxie-Plus est introuvable.');
    await deleteGameBox(sandboxieDir, gameId);
    return publicToolsInfo(await getGameToolsInfo(gameId));
  });

  // --- Récupération des métadonnées DLsite (japonais + traductions) ---
  ipcMain.handle('fetch-game-metadata', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    const { metadata, genreTranslations: learned } = await fetchWork(gameId);
    await genreTranslations.learn(learned);
    return metadata;
  });

  // --- Dictionnaire des tags ---
  // Amorçage idempotent (n'écrase rien) : paires connues + anciens "genres liés".
  getSettings()
    .then(settings => genreTranslations.seed({ ...KNOWN_GENRE_TRANSLATIONS, ...pairsFromAliasGroups(settings.genreAliasGroups) }))
    .catch(error => console.error('Amorçage du dictionnaire des tags impossible:', error));

  ipcMain.handle('get-genre-translations', () => genreTranslations.all());
  ipcMain.handle('set-genre-translation', async (event: IpcMainInvokeEvent, japanese: string, english: string | null) => {
    if (typeof japanese !== 'string' || !japanese || japanese.length > 200) throw new Error('Genre invalide.');
    if (english !== null && (typeof english !== 'string' || english.length > 200)) throw new Error('Traduction invalide.');
    await genreTranslations.setManual(japanese, english);
    return genreTranslations.all();
  });

  // --- Cache d'images ---
  // Canaux dédiés, à la place des anciens fs-rm / fs-copy / fs-mkdir
  // génériques qui acceptaient n'importe quel chemin venant du renderer.
  // Les images ajoutées à la main (work_image / sample_images === 'manual')
  // sont conservées : elles ne sont téléchargeables nulle part, les supprimer
  // les perdrait définitivement.
  ipcMain.handle('reset-image-cache', async () => {
    const imgCacheDir = getImgCacheDir();
    const cache = await cacheStore.getAll() as Record<string, Partial<GameMetadata> | undefined>;
    fs.mkdirSync(imgCacheDir, { recursive: true });

    for (const entry of fs.readdirSync(imgCacheDir, { withFileTypes: true })) {
      // `_wishlist` (couvertures de la liste de souhaits) : pas un jeu.
      if (entry.name.startsWith('_')) continue;
      const entryPath = path.join(imgCacheDir, entry.name);
      const metadata = entry.isDirectory() ? cache[entry.name] : undefined;
      const keep = new Set<string>();
      if (metadata?.work_image === MANUAL_IMAGE) keep.add('work_image.jpg');
      (metadata?.sample_images ?? []).forEach((src, i) => {
        if (src === MANUAL_IMAGE) keep.add(`sample_${i + 1}.jpg`);
      });

      if (keep.size === 0) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        continue;
      }
      for (const file of fs.readdirSync(entryPath)) {
        if (!keep.has(file)) fs.rmSync(path.join(entryPath, file), { recursive: true, force: true });
      }
    }
  });

  // Applique en une fois les modifications d'images de l'édition manuelle :
  // couverture conservée / remplacée / supprimée, et nouvelle liste
  // d'échantillons, chacun étant soit un échantillon existant (renuméroté à
  // sa nouvelle position), soit une image fournie en octets par le renderer
  // (jamais un chemin : le renderer n'a pas à désigner de fichier du disque).
  // Tout est validé avant de toucher au disque ; les échantillons passent par
  // des fichiers `.staged` pour que les renumérotations ne s'écrasent pas.
  ipcMain.handle('apply-game-images', async (event: IpcMainInvokeEvent, gameId: string, plan: GameImagesPlan) => {
    assertGameId(gameId);
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.samples)) throw new Error('Plan d\'images invalide.');

    // Chaque image existante (0 = couverture, n = sample_n.jpg) sert au plus
    // une fois : sinon deux renommages se disputeraient le même fichier.
    const used = new Set<number>();
    const checkSource = (source: unknown, allowCover: boolean) => {
      if (!source || typeof source !== 'object') throw new Error('Plan d\'images invalide.');
      if ('keep' in source) {
        const keep = (source as { keep: unknown }).keep;
        if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < (allowCover ? 0 : 1) || used.has(keep)) {
          throw new Error('Plan d\'images invalide.');
        }
        used.add(keep);
      } else {
        assertImageBytes((source as { data: unknown }).data);
      }
    };
    if (plan.cover === 'keep') used.add(0);
    else if (plan.cover !== 'remove') checkSource(plan.cover, false);
    for (const sample of plan.samples) checkSource(sample, true);

    const gameImgDir = path.join(getImgCacheDir(), gameId);
    fs.mkdirSync(gameImgDir, { recursive: true });
    const isSample = (file: string) => /^sample_\d+\.jpg$/.test(file);
    const isStaged = (file: string) => /^sample_\d+\.jpg\.staged$/.test(file);
    const coverPath = path.join(gameImgDir, 'work_image.jpg');
    const coverStaged = `${coverPath}.staged`;
    const existingPath = (keep: number) => path.join(gameImgDir, keep === 0 ? 'work_image.jpg' : `sample_${keep}.jpg`);

    // Restes d'une exécution interrompue.
    for (const file of fs.readdirSync(gameImgDir)) {
      if (isStaged(file)) fs.rmSync(path.join(gameImgDir, file), { force: true });
    }
    fs.rmSync(coverStaged, { force: true });

    // Tout passe d'abord par des fichiers `.staged` : les sources étant
    // toutes distinctes, l'ordre des renommages n'a pas d'importance et
    // aucune image n'en écrase une autre avant d'avoir été déplacée.
    // Image existante jamais téléchargée : elle le sera plus tard, à sa
    // nouvelle place (son URL la suit dans la fiche).
    plan.samples.forEach((sample, i) => {
      const staged = path.join(gameImgDir, `sample_${i + 1}.jpg.staged`);
      if ('keep' in sample) {
        if (fs.existsSync(existingPath(sample.keep))) fs.renameSync(existingPath(sample.keep), staged);
      } else {
        fs.writeFileSync(staged, sample.data);
      }
    });
    if (plan.cover !== 'keep' && plan.cover !== 'remove') {
      if ('keep' in plan.cover) {
        if (fs.existsSync(existingPath(plan.cover.keep))) fs.renameSync(existingPath(plan.cover.keep), coverStaged);
      } else {
        fs.writeFileSync(coverStaged, plan.cover.data);
      }
    }

    for (const file of fs.readdirSync(gameImgDir)) {
      if (isSample(file)) fs.rmSync(path.join(gameImgDir, file), { force: true });
    }
    for (const file of fs.readdirSync(gameImgDir)) {
      if (isStaged(file)) fs.renameSync(path.join(gameImgDir, file), path.join(gameImgDir, file.slice(0, -'.staged'.length)));
    }

    if (plan.cover !== 'keep') {
      // Couverture supprimée ou remplacée : l'ancienne ne doit pas rester
      // sous ce nom (sauf si elle vient d'être déplacée parmi les échantillons).
      if (fs.existsSync(coverStaged)) fs.renameSync(coverStaged, coverPath);
      else fs.rmSync(coverPath, { force: true });
    }
    return true;
  });

  // --- Plein écran ---
  ipcMain.handle('toggle-fullscreen', () => {
    const window = getWindow();
    if (!window) return false;
    window.setFullScreen(!window.isFullScreen());
    return window.isFullScreen();
  });

  ipcMain.handle('is-fullscreen', () => getWindow()?.isFullScreen() ?? false);

  // --- Téléchargement d'images ---
  // Par la pile réseau de Chromium (proxy DLsite / système, voir
  // dlsite-net.ts). Écrit dans un fichier `.part`, renommé seulement une
  // fois complet : un crash ou une coupure en plein téléchargement ne laisse
  // jamais une image tronquée sous le nom final, que `downloadIfMissing`
  // prendrait ensuite pour valide et ne retenterait plus jamais.
  const download = async (url: string, outputPath: string): Promise<void> => {
    const partPath = `${outputPath}.part`;
    try {
      const response = await dlsiteFetch(url, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) });
      if (response.status !== 200 || !response.body) {
        throw new Error(`HTTP ${response.status} pour ${url}`);
      }
      await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), fs.createWriteStream(partPath));
      await fs.promises.rename(partPath, outputPath);
    } catch (error) {
      await fs.promises.rm(partPath, { force: true }).catch(() => undefined);
      throw error;
    }
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
  //
  // `overwrite` (fetch DLsite forcé) : retélécharge même les images présentes.
  // Chaque fichier n'est remplacé qu'une fois le nouveau complet (`.part`
  // renommé par-dessus), donc un échec garde l'ancienne image ; les
  // échantillons en trop ne sont supprimés que si tout a réussi.
  ipcMain.handle('download-game-images', async (event: IpcMainInvokeEvent, gameId: string, metadata: GameMetadata, options?: { overwrite?: boolean }) => {
    assertGameId(gameId);
    const overwrite = options?.overwrite === true;
    const fetchImage = async (url: string, outputPath: string): Promise<boolean> => {
      if (!overwrite) return downloadIfMissing(url, outputPath);
      try {
        await download(url, outputPath);
        return true;
      } catch (error) {
        console.error(`Erreur téléchargement image (${outputPath}):`, (error as Error).message);
        return false;
      }
    };
    const gameDir = path.join(getImgCacheDir(), gameId);
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    let allSucceeded = true;

    // 'manual' = jaquette choisie par l'utilisateur (apply-game-images) : rien
    // à télécharger, et la retenter à chaque scan échouerait indéfiniment.
    if (metadata.work_image && metadata.work_image !== MANUAL_IMAGE) {
      const url = metadata.work_image.startsWith('http') ? metadata.work_image : `https:${metadata.work_image}`;
      const ok = await fetchImage(url, path.join(gameDir, 'work_image.jpg'));
      allSucceeded = allSucceeded && ok;
    }

    if (metadata.sample_images && Array.isArray(metadata.sample_images)) {
      for (let i = 0; i < metadata.sample_images.length; i++) {
        // Échantillon ajouté à la main : rien à télécharger.
        if (metadata.sample_images[i] === MANUAL_IMAGE) continue;
        const url = metadata.sample_images[i].startsWith('http') ? metadata.sample_images[i] : `https:${metadata.sample_images[i]}`;
        const ok = await fetchImage(url, path.join(gameDir, `sample_${i + 1}.jpg`));
        allSucceeded = allSucceeded && ok;
      }
    }

    if (overwrite && allSucceeded) {
      const count = metadata.sample_images?.length ?? 0;
      for (const file of fs.readdirSync(gameDir)) {
        const match = /^sample_(\d+)\.jpg$/.exec(file);
        if (match && Number(match[1]) > count) fs.rmSync(path.join(gameDir, file), { force: true });
      }
    }

    return allSucceeded;
  });

  // --- Liste de souhaits ---
  const wishlist = new Wishlist({
    store: wishlistStore,
    getDestinationFolder: async () => (await getSettings()).destinationFolder,
    fetchMetadata: async gameId => (await fetchWork(gameId, { translations: false })).metadata,

    downloadImage: download,
    coverDir: () => path.join(getImgCacheDir(), '_wishlist')
  });

  ipcMain.handle('get-wishlist', () => wishlist.list());
  ipcMain.handle('add-to-wishlist', (event: IpcMainInvokeEvent, text: string) => {
    if (typeof text !== 'string' || text.length > 20000) throw new Error('Saisie invalide.');
    return wishlist.add(text);
  });
  ipcMain.handle('remove-from-wishlist', (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    return wishlist.remove(gameId);
  });
  ipcMain.handle('refresh-wishlist-item', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    if (!(await wishlistStore.get(gameId))) throw new Error(`${gameId} n'est pas dans la liste de souhaits.`);
    return wishlist.refresh(gameId);
  });
}

