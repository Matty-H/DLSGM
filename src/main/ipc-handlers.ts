import { app, clipboard, ipcMain, dialog, globalShortcut, net, Notification, safeStorage, screen, shell, session, BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, OpenDialogOptions, type Rectangle } from 'electron';

import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { execFile, spawn } from 'child_process';
import Store from './store';
import { fetchWork } from './dlsite-fetcher';
import { GenreTranslations, KNOWN_GENRE_TRANSLATIONS } from './genre-translations';
import { applyDlsiteProxy, dlsiteFetch, protectProxySettings, testDlsiteConnection } from './dlsite-net';
import { detectEngine, findRpgMakerWebRoot, findSaveLocations, readPeArch, readPatches, applyUserPatch, installAutoTranslator, uninstallLastPatch, type SaveSource } from './game-tools';
import { boxFileRoot, boxNameFor, deleteGameBox, ensureGameBox, findSandboxieDir, sandboxedCommand, sandboxedPathFor } from './sandboxie';
import { createSaveBackup, deleteSaveBackup, listSaveBackups, restoreSaveBackup } from './save-backups';
import { ARCHIVE_EXTENSIONS, ArchivePasswordError, archiveVolumes, importArchive, removeStaleImports } from './archive-import';
import { findMisnamedFolders, renameMisnamedFolders } from './folder-rename';
import { detectPlatforms } from './game-platforms';
import { LibraryMoveError, moveLibrary, planLibraryMove } from './library-move';
import { DEFAULT_SUPER_PANIC, SuperPanic, sanitizeSuperPanicSettings } from './super-panic';
import { guardExecutablePaths, PickedPaths } from './trusted-paths';
import { isTrustedSender } from './ipc-guard';
import { readInstallInfo } from './release-names';
import { TextractorSession, findTextractorCli } from './textractor';
import { extractRpgMakerAssets } from './rpgmaker-assets';
import { findLeProc, leInstalled, runWithLocaleEmulator } from './locale-emulator';
import { elevatedStartCommand, parseLaunchArguments } from './launch-args';
import { DiskUsageScanner, diskInfo } from './disk-usage';
import { DEFAULT_SCREENSHOT, ScreenCapturer, captureFileName, isCaptureName, listCaptures, sanitizeScreenshotSettings } from './screenshots';
import { DEFAULT_OCR, OcrReader, groupOcrLines, sanitizeOcrSettings } from './ocr';
import { OcrViewWindow } from './ocr-view';
import { translateTexts } from './translator';
import { DictionaryStore } from './dictionary-store';
import { Wishlist } from './wishlist';
import { describeWorkspace, workspaceRoot } from './workspace';
import { snapshotDatabase } from './db-backup';
import { checkIp } from './ip-check';
import { Pia } from './pia';
import { DEFAULT_LAN_PORT, LanShare } from './lan-share';
import { AutoClicker, DEFAULT_AUTO_CLICKER, sanitizeClickerSettings } from './auto-clicker';
import { GameOverlay, OVERLAY_HOTKEY } from './overlay';
import { GameWindowTracker } from './game-window';
import { ClickerHud, MACRO_HUD_OFFSET_X, TRIGGER_HUD_EXPANDED, TRIGGER_HUD_OFFSET_X } from './clicker-hud';
import { DEFAULT_MACRO_RECORDER, MAX_MACROS_PER_GAME, MacroRecorder, acceleratorVks, sanitizeMacroSettings, sanitizeMacros } from './macro-recorder';
import { TriggerZonesWindow } from './trigger-zones';
import { checkForUpdates, getAppUpdateInfo } from './updater';
import { setMainLanguage, systemLanguages, tm } from './i18n';
import { DEFAULT_PIXEL_TRIGGER, PixelTriggerDetector, activeTriggers, sanitizePixelTriggerSettings, sanitizePixelTriggers, triggerVisibility } from './pixel-trigger';
import type { AppSettings, CaptureInfo, ScreenshotSettings, DiskUsageReport, GameDiskUsage, OcrTranslateSettings, OcrView, RpgMakerExtractResult, TextractorThread, TextractorView, FolderRenameResult, MisnamedFolder, GameMacro, GameMacros, MacroRecorderSettings, MacroRecorderStatus, MacroStep, AutoClickerSettings, AutoClickerStatus, PixelTrigger, PixelTriggerSettings, PixelTriggerStatus, ArchiveImportResult, OverlayState, TrashArchivesResult, GameImagesPlan, GameMetadata, GameToolsInfo, LanSendRequest, LaunchGameResult, PlaySession, SandboxieStatus } from '../shared/ipc-types';
import type { OsPlatform } from '../shared/platforms';
import { applyThemeIcon, applyThemeSetting, getActiveTheme, iconFromDataUrl, rerollTheme } from './theme';
import { DEFAULT_THEME, normalizeThemeSetting, sanitizeCustomThemes } from '../shared/themes';

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

// Stores NeDB (les anciens formats sont convertis par src/main/migrations
// avant leur ouverture)
const settingsStore = new Store('settings.db', {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US',
  blurAdultContent: true,
  sandboxLaunch: false,
  startFullscreen: false,
  lanSharePort: DEFAULT_LAN_PORT,
  dlsiteProxy: '',
  collections: [],
  homeShelves: {},
  hideCompleted: false,
  autoClicker: { enabled: false, hotkey: 'F6', intervalMs: 100, button: 'left', double: false, repeat: 0, position: null },
  pixelTrigger: { enabled: false, hotkey: 'F7' },
  overlayEnabled: true,
  autoBackupSaves: true,
  closeToTray: false,
  workspaceFolder: '',
  piaRetry: false,
  piaRegion: 'jp-tokyo',
  macroRecorder: { enabled: false, recordHotkey: 'F8', playHotkey: 'F9' },
  textractorPath: '',
  textractorOutput: 'both',
  rpgMakerExtractor: false,
  ocrTranslate: { enabled: false, hotkey: 'F10', source: 'ja', target: 'fr', engine: 'dictionary', localUrl: 'http://127.0.0.1:11434/v1', localModel: '' },
  localeEmulatorPath: '',
  screenshot: { enabled: true, hotkey: 'Ctrl+F8' },
  superPanic: DEFAULT_SUPER_PANIC,
  checkUpdatesOnStartup: true,
  uiLanguage: 'system',
  theme: DEFAULT_THEME,
  customThemes: [],
  // Valeurs par défaut écrites seulement dans un store vide : une installation
  // existante n'a pas cette clé et ne voit jamais l'assistant.
  onboardingPending: true
});

// VPN PIA pour refaire les fetchs à restriction régionale.
const pia = new Pia();

export function isVpnActive(): boolean {
  return pia.active;
}

/** Remet PIA dans son état d'avant si une session est ouverte (fermeture de l'app). */
export async function shutdownVpn(): Promise<void> {
  if (pia.active) await pia.restore();
}

const cacheStore = new Store('cache.db', {});
// Chemins choisis par l'utilisateur dans une boîte de dialogue : seuls acceptés pour les réglages qui lancent un programme.
const pickedPaths = new PickedPaths();

// Liste de souhaits : store séparé, jamais mêlé au cache des jeux.
const wishlistStore = new Store('wishlist.db', {});

// Mots de passe d'archives mémorisés (clé `passwords`), essayés à chaque import.
const archivePasswordStore = new Store('archive-passwords.db', { passwords: [] });

async function archivePasswords(): Promise<string[]> {
  const list = await archivePasswordStore.get('passwords');
  return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : [];
}

function validArchivePassword(password: unknown): password is string {
  return typeof password === 'string' && password.length > 0 && password.length <= 256;
}

/** Ajoute au gestionnaire (sans doublon) ; rend la liste à jour. */
async function addArchivePassword(password: string): Promise<string[]> {
  const known = await archivePasswords();
  if (known.includes(password)) return known;
  const next = [...known, password];
  await archivePasswordStore.set('passwords', next);
  return next;
}

// Dictionnaire des tags JP → EN.
const genreTranslations = new GenreTranslations(new Store('translations.db', {}));

/**
 * Rejette tout ID qui n'est pas un ID DLsite : les ID reçus du renderer
 * servent à construire des chemins, un ID du type `..\..` ne doit jamais
 * atteindre `path.join`.
 */
function assertGameId(gameId: unknown): asserts gameId is string {
  if (typeof gameId !== 'string' || !GAME_ID_REGEX.test(gameId)) {
    throw new Error(tm('ID de jeu invalide : {id}', { id: String(gameId) }));
  }
}

/** Vrai si `child` est `parent` lui-même ou un chemin situé dessous. */
export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Vérification des mises à jour au démarrage, si l'option est active (Paramètres › Mises à jour). */
export async function runStartupUpdateCheck(getWindow: () => BrowserWindow | null): Promise<void> {
  if ((await getSettings()).checkUpdatesOnStartup === false) return;
  await checkForUpdates({ manual: false, getWindow });
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
  if (!(data instanceof Uint8Array)) throw new Error(tm('Image invalide.'));
  if (data.byteLength === 0 || data.byteLength > MAX_MANUAL_IMAGE_BYTES) {
    throw new Error(tm('Image vide ou trop lourde (max {mb} Mo).', { mb: MAX_MANUAL_IMAGE_BYTES / 1024 / 1024 }));
  }
  const b = data;
  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isGif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  const isWebp = b.byteLength > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isGif && !isWebp) {
    throw new Error(tm("Format d'image non pris en charge (JPEG, PNG, GIF ou WebP)."));
  }
}

export function getImgCacheDir(): string {
  return path.join(app.getPath('userData'), 'img_cache');
}

async function getGameDir(gameId: string): Promise<string> {
  assertGameId(gameId);
  const settings = await settingsStore.getAll() as unknown as AppSettings;
  if (!settings.destinationFolder) throw new Error(tm('Dossier de jeux non configuré'));
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

/** Lance en administrateur (invite UAC) avec des arguments ; non suivi. */
function startElevated(executablePath: string, args: string[]): Promise<TrackedLaunchResult> {
  const encoded = Buffer.from(elevatedStartCommand(executablePath, path.dirname(executablePath), args), 'utf16le').toString('base64');
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }, error => {
      // Invite UAC refusée ou exécutable introuvable : Start-Process échoue.
      resolve(error ? { success: false, error: tm("Le jeu exige les droits administrateur et n'a pas pu être lancé.") } : { success: true, duration: 0, untracked: true });
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
  const sandboxed = process.platform === 'win32' && settings.sandboxLaunch && !entry?.sandboxDisabled;
  // Arguments saisis sur la page du jeu (`-dx11`...), passés dans tous les modes de lancement.
  const gameArgs = parseLaunchArguments(entry?.launchArguments);

  // Lancement en japonais demandé : jamais de repli sur un lancement normal.
  if (process.platform === 'win32' && entry?.localeEmulator) {
    if (sandboxed) {
      throw new Error(tm('« Lancer en japonais » et Sandboxie ne peuvent pas encore être combinés (les deux lancent le jeu) : exclus ce jeu de la sandbox, ou décoche « Lancer en japonais ».'));
    }
    const leProc = findLeProc(settings.localeEmulatorPath ?? '');
    if (!leProc) {
      throw new Error(tm('Locale Emulator introuvable (Paramètres › Lancement) : le jeu ne peut pas être lancé en japonais. Choisis son dossier, ou décoche « Lancer en japonais ».'));
    }
    if (readPeArch(executablePath) === 'x64') {
      throw new Error(tm("Locale Emulator ne gère que les jeux 32 bits, et celui-ci est en 64 bits : décoche « Lancer en japonais »."));
    }
    return runWithLocaleEmulator({ leProc, executablePath, args: gameArgs, gameDir: gamePath });
  }

  if (sandboxed) {
    // Jamais de repli hors sandbox : l'utilisateur a demandé l'isolation.
    const sandboxieDir = await findSandboxieDir();
    if (!sandboxieDir) {
      throw new Error(tm('Sandboxie-Plus est introuvable. Installe-le, désactive le lancement en sandbox dans les paramètres, ou exclus ce jeu de la sandbox.'));
    }
    const box = await ensureGameBox(sandboxieDir, gameId, gamePath);
    const { command, args } = sandboxedCommand(sandboxieDir, box, executablePath, gameArgs);
    const result = await runAndTrack(command, args, path.dirname(executablePath));
    if (result.success && result.exitCode !== 0 && (result.duration ?? 0) < SANDBOX_LAUNCH_FAILURE_WINDOW_S) {
      return { success: false, error: tm("Sandboxie n'a pas pu lancer le jeu (code {code}). Si le jeu refuse de tourner en sandbox, exclus-le depuis sa fiche.", { code: String(result.exitCode) }) };
    }
    return result;
  }

  if (process.platform === 'darwin') {
    // Sur Mac, 'open -W' attend que l'application se ferme
    return runAndTrack('open', ['-W', executablePath, ...(gameArgs.length > 0 ? ['--args', ...gameArgs] : [])], undefined);
  }

  // cwd = dossier de l'exécutable (et non la racine du jeu) : beaucoup de
  // jeux résolvent leurs fichiers relativement au répertoire courant.
  const result = await runAndTrack(executablePath, gameArgs, path.dirname(executablePath));

  // Exécutable exigeant les droits admin : CreateProcess refuse
  // (ERROR_ELEVATION_REQUIRED, remonté en EACCES par Node). On repasse
  // par le shell, qui affiche l'invite UAC — mais le processus n'est
  // alors plus suivi, donc pas de temps de jeu comptabilisé.
  if (!result.success && result.code === 'EACCES' && process.platform === 'win32') {
    // shell.openPath ne passe pas d'arguments : avec des arguments, Start-Process -Verb RunAs.
    if (gameArgs.length > 0) return startElevated(executablePath, gameArgs);
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
  if (!fs.existsSync(gamePath)) throw new Error(tm('Dossier du jeu introuvable'));
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
    sandbox: await getGameSandboxInfo(gameId),
    install: readInstallInfo(gamePath)
  };
}

async function getGameSandboxInfo(gameId: string): Promise<GameToolsInfo['sandbox']> {
  const settings = await settingsStore.getAll() as unknown as AppSettings;
  return {
    globallyEnabled: process.platform === 'win32' && Boolean(settings.sandboxLaunch),
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
  if (patchingGames.has(gameId)) throw new Error(tm('Une opération de patch est déjà en cours pour ce jeu.'));
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
  if (backingUpGames.has(gameId)) throw new Error(tm('Une copie ou restauration des sauvegardes est déjà en cours pour ce jeu.'));
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

// --- Overlay en jeu et auto-clicker ------------------------------------------
// Créés par setupIpcHandlers (il leur faut la fenêtre et le chargeur de page).
let autoClicker: AutoClicker | null = null;
let overlay: GameOverlay | null = null;
// Position de la fenêtre du jeu en cours : l'overlay se pose dessus.
let gameWindow: GameWindowTracker | null = null;
// Témoin en bas à gauche de la fenêtre du jeu pendant la partie (auto-clicker activé).
let clickerHud: ClickerHud | null = null;
// Mode panique (Alt+Espace, bascule) : le témoin se cache avec l'application.
let panicActive = false;

// Super bouton panique (raccourci global distinct d'Alt+Espace).
let superPanic: SuperPanic | null = null;
let superPanicHotkey: string | null = null;
let superPanicMinimizedApp = false;

/** Raccourci pris tant que l'option est active, partie en cours ou non. */
export async function applySuperPanicSettings(): Promise<void> {
  const config = sanitizeSuperPanicSettings((await getSettings()).superPanic);
  superPanic?.configure(config);
  const wanted = config.enabled && superPanic ? config.hotkey : null;
  if (superPanicHotkey && superPanicHotkey !== wanted) {
    globalShortcut.unregister(superPanicHotkey);
    superPanicHotkey = null;
  }
  if (!wanted || superPanicHotkey) return;
  // Jamais le raccourci d'un outil en jeu (enregistré pendant une partie).
  const tools = [clickerConfig.hotkey, ...(macroHotkeys ?? []), screenshotConfig.hotkey, ocrConfig.hotkey].map(k => k?.toLowerCase());
  if (tools.includes(wanted.toLowerCase())) return;
  try {
    // Raccourci global : rien d'attendu avant l'effet (voir AutoClicker.start).
    if (globalShortcut.register(wanted, () => superPanic?.toggle())) superPanicHotkey = wanted;
  } catch {
    // accélérateur invalide
  }
}
// Prévient la fenêtre principale d'un changement de paramètres fait ailleurs (témoin).
let notifySettingsChanged: (() => void) | null = null;
// Raccourci marche / arrêt de l'auto-clicker actuellement enregistré.
let clickerHotkey: string | null = null;
// Raccourcis déjà pris par DLSGM : refusés pour l'auto-clicker.
const RESERVED_HOTKEYS = ['Alt+Space', OVERLAY_HOTKEY];
// Réglages de l'auto-clicker gardés en mémoire : le raccourci agit sans
// relire la base (une lecture attend les écritures en cours).
let clickerConfig: AutoClickerSettings = DEFAULT_AUTO_CLICKER;
// Dossiers des jeux lancés depuis DLSGM en cours : l'auto-clicker n'est
// actif que pendant la partie, et ne clique que dans ces jeux…
const runningGameDirs = new Map<string, string>();
// … où il a été ajouté (case de l'overlay, `autoClickerEnabled` dans la fiche : opt-in par jeu).
const clickerEnabledGames = new Set<string>();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Détecteur de rythme (même modèle que l'auto-clicker) ---
let pixelTrigger: PixelTriggerDetector | null = null;
let triggerHud: ClickerHud | null = null;
// Contours des zones par-dessus le jeu, verts un instant à chaque action.
let triggerZones: TriggerZonesWindow | null = null;
let triggerHotkey: string | null = null;
// Réglages et zones gardés en mémoire : le raccourci agit sans relire la base.
let triggerConfig: PixelTriggerSettings = DEFAULT_PIXEL_TRIGGER;
// Zones des jeux lancés depuis DLSGM en cours (`pixelTriggers` de leur fiche)…
const runningGameTriggers = new Map<string, PixelTrigger[]>();
// … et ceux où le détecteur a été ajouté (case de l'overlay, `pixelTriggerEnabled` : opt-in par jeu).
const triggerEnabledGames = new Set<string>();

/** Zones utilisables des jeux en cours où le détecteur a été ajouté. */
function currentTriggers(): PixelTrigger[] {
  return [...runningGameTriggers].filter(([id]) => triggerEnabledGames.has(id)).flatMap(([, triggers]) => activeTriggers(triggers));
}

export async function applyPixelTriggerSettings(): Promise<void> {
  triggerConfig = sanitizePixelTriggerSettings((await getSettings()).pixelTrigger);
  refreshPixelTrigger();
}

/**
 * Comme l'auto-clicker : témoin et zones affichés seulement si le détecteur
 * est activé (Paramètres, Windows) et qu'un jeu lancé depuis DLSGM où il a
 * été ajouté (case de l'overlay) tourne. Armé (raccourci enregistré, worker
 * préchauffé, dossiers des jeux transmis) seulement avec au moins une zone
 * active : sinon le raccourci reste au jeu.
 */
function refreshPixelTrigger(): void {
  if (!pixelTrigger) return;
  const config = triggerConfig;
  const triggers = currentTriggers();
  const gameDirs = [...runningGameDirs]
    .filter(([id]) => triggerEnabledGames.has(id) && activeTriggers(runningGameTriggers.get(id) ?? []).length > 0)
    .map(([, dir]) => dir);
  const { shown, armed: active } = triggerVisibility({
    enabled: config.enabled,
    available: pixelTrigger.getStatus().available,
    runningGames: [...runningGameDirs.keys()].filter(id => triggerEnabledGames.has(id)).length,
    zones: triggers.length
  });
  pixelTrigger.setInGame(active, shown ? triggers.length : 0);

  if (triggerHotkey && (!active || triggerHotkey !== config.hotkey)) {
    globalShortcut.unregister(triggerHotkey);
    triggerHotkey = null;
  }
  if (!active) {
    pixelTrigger.dispose();
    pixelTrigger.setHotkeyActive(false);
  } else {
    // Refusé s'il est déjà pris par DLSGM (panique, overlay, auto-clicker).
    const taken = [...RESERVED_HOTKEYS, ...(clickerConfig.enabled ? [clickerConfig.hotkey] : [])];
    if (!triggerHotkey && !taken.some(key => key.toLowerCase() === config.hotkey.toLowerCase())) {
      try {
        // Rien d'asynchrone avant l'envoi de la commande (voir AutoClicker.start).
        const onHotkey = () => {
          togglePixelTriggerNow().catch(error => console.error('Détecteur de rythme :', error));
        };
        if (globalShortcut.register(config.hotkey, onHotkey)) triggerHotkey = config.hotkey;
      } catch {
        // accélérateur invalide : raccourci indiqué comme indisponible
      }
    }
    pixelTrigger.setHotkeyActive(triggerHotkey !== null);
    pixelTrigger.warmUp().catch(error => console.error('Préparation du détecteur de rythme impossible:', error));
    pixelTrigger.setGameDirs(gameDirs);
    pixelTrigger.restartIfRunning(triggers);
  }
  triggerHud?.setVisible(shown && !panicActive);
  if (shown && !panicActive) triggerZones?.show(triggers);
  else triggerZones?.hide();
  overlay?.send('overlay-state-changed');
  triggerHud?.send('overlay-state-changed');
}

/** Zones d'un jeu modifiées (page du jeu ou overlay) : appliquées tout de suite s'il tourne. */
function gameTriggersChanged(gameId: string, triggers: PixelTrigger[]): void {
  if (!runningGameTriggers.has(gameId)) return;
  runningGameTriggers.set(gameId, triggers);
  refreshPixelTrigger();
}

/** Marche / arrêt. Aucun await ne doit précéder `toggle` (raccourci global). */
async function togglePixelTriggerNow(): Promise<PixelTriggerStatus> {
  if (!pixelTrigger) throw new Error(tm('Détecteur de rythme indisponible.'));
  if (!pixelTrigger.getStatus().running) {
    if (!triggerConfig.enabled) throw new Error(tm('Le détecteur de rythme est désactivé (Paramètres › Outils en jeu).'));
    if (!pixelTrigger.getStatus().inGame) {
      throw new Error(tm("Le détecteur de rythme ne fonctionne que pendant un jeu lancé depuis DLSGM où il a été ajouté (case de l'overlay Maj+Tab), avec au moins une zone."));
    }
  }
  await pixelTrigger.toggle(currentTriggers());
  return pixelTrigger.getStatus();
}

// --- Enregistreur de macros (même modèle que l'auto-clicker) ---
let macroRecorder: MacroRecorder | null = null;
let macroHud: ClickerHud | null = null;
let macroConfig: MacroRecorderSettings = DEFAULT_MACRO_RECORDER;
// Raccourcis enregistrement / lecture actuellement pris.
let macroHotkeys: string[] = [];
// Jeux où l'enregistreur a été ajouté (case de l'overlay, `macroEnabled` : opt-in par jeu)…
const macroEnabledGames = new Set<string>();
// … et leurs macros, gardées en mémoire pendant la partie : le raccourci de
// lecture les envoie sans lire la base (voir AutoClicker.start).
const runningGameMacros = new Map<string, GameMacros>();
// Macros par jeu : base à part, jamais dans le cache des jeux ni en LAN.
const macroStore = new Store('macros.db', {});
let macroWrites: Promise<unknown> = Promise.resolve();

async function readGameMacros(gameId: string): Promise<GameMacros> {
  const raw = (await macroStore.get(gameId)) as Partial<GameMacros> | undefined;
  const macros = sanitizeMacros(raw?.macros);
  const activeId = typeof raw?.activeId === 'string' && macros.some(m => m.id === raw.activeId) ? raw.activeId : null;
  return { macros, activeId };
}

/** Lecture-modification-écriture des macros d'un jeu, une à la fois. */
function changeGameMacros(gameId: string, change: (current: GameMacros) => GameMacros): Promise<GameMacros> {
  const next = macroWrites.then(async () => {
    const updated = change(await readGameMacros(gameId));
    const clean: GameMacros = { macros: sanitizeMacros(updated.macros), activeId: updated.activeId };
    if (clean.activeId && !clean.macros.some(m => m.id === clean.activeId)) clean.activeId = null;
    await macroStore.set(gameId, clean);
    if (runningGameMacros.has(gameId)) runningGameMacros.set(gameId, clean);
    macroHud?.send('overlay-state-changed');
    overlay?.send('overlay-state-changed');
    return clean;
  });
  macroWrites = next.catch(() => undefined);
  return next;
}

/** Jeu des macros : le plus récemment lancé parmi ceux où l'enregistreur est ajouté. */
function macroGame(): string | null {
  const ids = [...runningGameDirs.keys()].filter(id => macroEnabledGames.has(id));
  return ids.length > 0 ? ids[ids.length - 1] : null;
}

function activeMacro(): GameMacro | null {
  const gameId = macroGame();
  const data = gameId ? runningGameMacros.get(gameId) : undefined;
  if (!data || data.macros.length === 0) return null;
  return data.macros.find(m => m.id === data.activeId) ?? data.macros[data.macros.length - 1];
}

export async function applyMacroSettings(): Promise<void> {
  macroConfig = sanitizeMacroSettings((await getSettings()).macroRecorder);
  refreshMacroRecorder();
}

/**
 * Comme l'auto-clicker : actif seulement si activé, sous Windows, avec un jeu
 * lancé depuis DLSGM où l'enregistreur a été ajouté. Actif : raccourcis pris
 * (sauf s'ils le sont déjà par DLSGM), worker préchauffé, témoin affiché.
 */
function refreshMacroRecorder(): void {
  if (!macroRecorder) return;
  const config = macroConfig;
  const gameDirs = [...runningGameDirs].filter(([id]) => macroEnabledGames.has(id)).map(([, dir]) => dir);
  const active = config.enabled && macroRecorder.getStatus().available && gameDirs.length > 0;
  macroRecorder.setInGame(active);

  for (const key of macroHotkeys) globalShortcut.unregister(key);
  macroHotkeys = [];
  if (!active) {
    macroRecorder.dispose();
    macroRecorder.setHotkeysActive(false);
  } else {
    const taken = [...RESERVED_HOTKEYS, ...(clickerHotkey ? [clickerHotkey] : []), ...(triggerHotkey ? [triggerHotkey] : [])];
    const hotkeys: [string, () => Promise<MacroRecorderStatus>][] = [
      [config.recordHotkey, toggleMacroRecordingNow],
      [config.playHotkey, toggleMacroPlaybackNow]
    ];
    for (const [key, action] of hotkeys) {
      if ([...taken, ...macroHotkeys].some(t => t.toLowerCase() === key.toLowerCase())) continue;
      try {
        // Rien d'asynchrone avant l'envoi de la commande (voir AutoClicker.start).
        const onHotkey = () => {
          action().catch(error => console.error('Macros :', error));
        };
        if (globalShortcut.register(key, onHotkey)) macroHotkeys.push(key);
      } catch {
        // accélérateur invalide : raccourci indiqué comme indisponible
      }
    }
    macroRecorder.setHotkeysActive(macroHotkeys.length === hotkeys.length);
    macroRecorder.warmUp().catch(error => console.error("Préparation de l'enregistreur de macros impossible:", error));
    macroRecorder.setGameDirs(gameDirs);
  }
  macroHud?.setVisible(active && !panicActive);
  macroHud?.send('overlay-state-changed');
}

/** Enregistrer / arrêter. Aucun await avant toggleRecord (raccourci global). */
async function toggleMacroRecordingNow(): Promise<MacroRecorderStatus> {
  if (!macroRecorder) throw new Error(tm('Enregistreur de macros indisponible.'));
  const status = macroRecorder.getStatus();
  if (!status.recording) {
    if (!macroConfig.enabled) throw new Error(tm("L'enregistreur de macros est désactivé (Paramètres › Outils en jeu)."));
    if (!status.inGame) throw new Error(tm("L'enregistreur ne fonctionne que pendant un jeu lancé depuis DLSGM, où il a été ajouté (case de l'overlay Maj+Tab)."));
  }
  const ignore = [macroConfig.recordHotkey, macroConfig.playHotkey].flatMap(acceleratorVks);
  await macroRecorder.toggleRecord(ignore);
  return macroRecorder.getStatus();
}

/** Lire / arrêter la macro active. Aucun await avant togglePlay. */
async function toggleMacroPlaybackNow(): Promise<MacroRecorderStatus> {
  if (!macroRecorder) throw new Error(tm('Enregistreur de macros indisponible.'));
  const status = macroRecorder.getStatus();
  if (!status.playing && !status.recording && !status.inGame) {
    throw new Error(tm("Les macros ne se jouent que pendant un jeu lancé depuis DLSGM, où l'enregistreur a été ajouté."));
  }
  await macroRecorder.togglePlay(activeMacro());
  return macroRecorder.getStatus();
}

/** Nouvel enregistrement : rangé dans les macros du jeu, et devient la macro active. */
function saveRecordedMacro(steps: MacroStep[], durationMs: number): void {
  const gameId = macroGame();
  if (!gameId) return;
  changeGameMacros(gameId, current => {
    const used = new Set(current.macros.map(m => m.name));
    let n = current.macros.length + 1;
    while (used.has(`Macro ${n}`)) n++;
    const macro: GameMacro = { id: crypto.randomUUID(), name: `Macro ${n}`, createdAt: new Date().toISOString(), loop: false, durationMs, steps };
    // Au-delà du maximum, la plus ancienne sort.
    return { macros: [...current.macros, macro].slice(-MAX_MACROS_PER_GAME), activeId: macro.id };
  }).catch(error => console.error('Macro non enregistrée :', error));
}

// --- Captures d'écran ---
let capturer: ScreenCapturer | null = null;
let screenshotConfig: ScreenshotSettings = DEFAULT_SCREENSHOT;
let screenshotHotkey: string | null = null;
// Racine des travaux gardée en mémoire : le raccourci capture sans lire la base.
let workspaceRootCache = '';
let notifyCapture: ((gameId: string) => void) | null = null;

/** `<travaux>/<ID>/captures`. */
function capturesDir(gameId: string): string {
  return path.join(workspaceRootCache, gameId, 'captures');
}

/** Capture servie par `atom://capture/<ID>/<fichier>` (null : refusée ou absente). */
export function captureFilePath(gameId: string, file: string): string | null {
  if (!GAME_ID_REGEX.test(gameId) || !isCaptureName(file) || !workspaceRootCache) return null;
  const full = path.join(capturesDir(gameId), file);
  return isInside(capturesDir(gameId), full) && fs.existsSync(full) ? full : null;
}

export async function applyScreenshotSettings(): Promise<void> {
  const settings = await getSettings();
  screenshotConfig = sanitizeScreenshotSettings(settings.screenshot);
  workspaceRootCache = workspaceRoot(settings.workspaceFolder, app.getPath('documents'));
  refreshScreenshot();
}

/** Raccourci pris (et worker préchauffé) seulement pendant une partie lancée depuis DLSGM. */
function refreshScreenshot(): void {
  const active = screenshotConfig.enabled && process.platform === 'win32' && runningGameDirs.size > 0 && !panicActive;
  if (screenshotHotkey && (!active || screenshotHotkey !== screenshotConfig.hotkey)) {
    globalShortcut.unregister(screenshotHotkey);
    screenshotHotkey = null;
  }
  if (!active) {
    capturer?.dispose();
    return;
  }
  const taken = [...RESERVED_HOTKEYS, clickerHotkey, triggerHotkey, ocrHotkey, ...macroHotkeys].filter((k): k is string => Boolean(k));
  if (!screenshotHotkey && !taken.some(k => k.toLowerCase() === screenshotConfig.hotkey.toLowerCase())) {
    try {
      if (globalShortcut.register(screenshotConfig.hotkey, () => void takeScreenshot().catch(error => console.error('Capture :', error)))) {
        screenshotHotkey = screenshotConfig.hotkey;
      }
    } catch {
      // accélérateur invalide
    }
  }
  capturer?.warmUp();
}

/**
 * Capture la zone client du jeu le plus récemment lancé. Synchrone jusqu'à
 * l'envoi de la commande au worker (raccourci global : voir AutoClicker.start).
 */
function takeScreenshot(): Promise<CaptureInfo | null> {
  const gameId = [...runningGameDirs.keys()].pop();
  const area = gameRectForOcr?.();
  if (!capturer || !gameId || !area || !workspaceRootCache) return Promise.resolve(null);
  const dir = capturesDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  const file = captureFileName(dir);
  return capturer.capture(area.physical, path.join(dir, file)).then(() => {
    notifyCapture?.(gameId);
    const info = listCaptures(dir).find(c => c.file === file) ?? null;
    // Petite notification Windows (ne prend pas le focus) : le jeu reste au premier plan.
    if (Notification.isSupported()) new Notification({ title: tm('Capture enregistrée'), body: file, silent: true }).show();
    return info;
  });
}

// --- Traduction à l'écran (OCR) ---
let ocrReader: OcrReader | null = null;
let ocrView: OcrViewWindow | null = null;
let ocrConfig: OcrTranslateSettings = DEFAULT_OCR;
let ocrHotkey: string | null = null;
// Échap pris par la vue (si l'overlay ne l'a pas déjà) le temps de l'affichage.
let ocrEscape = false;
// Lecture en cours : une nouvelle pression la remplace (son résultat est ignoré).
let ocrRun = 0;
let dictionary: DictionaryStore | null = null;
let gameRectForOcr: (() => { physical: Rectangle; dip: Rectangle } | null) | null = null;
// Clés DeepL / Google, chiffrées (safeStorage), jamais dans settings.db ni vers le renderer.
const translationKeyStore = new Store('translation-keys.db', {});

async function translationKey(engine: 'deepl' | 'google'): Promise<string | null> {
  const stored = await translationKeyStore.get(engine);
  if (typeof stored !== 'string' || !stored) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return null;
  }
}

export async function applyOcrSettings(): Promise<void> {
  ocrConfig = sanitizeOcrSettings((await getSettings()).ocrTranslate);
  refreshOcr();
}

/** Raccourci pris (et worker préchauffé) seulement pendant une partie lancée depuis DLSGM, OCR activé. */
function refreshOcr(): void {
  const active = ocrConfig.enabled && process.platform === 'win32' && runningGameDirs.size > 0 && !panicActive;
  if (ocrHotkey && (!active || ocrHotkey !== ocrConfig.hotkey)) {
    globalShortcut.unregister(ocrHotkey);
    ocrHotkey = null;
  }
  if (!active) {
    hideOcrView();
    ocrReader?.dispose();
    // ≈200 Mo libérés hors partie (sauf installation en cours, qui utilise le même processus).
    if (!dictionary?.status().progress) dictionary?.dispose();
    return;
  }
  if (ocrConfig.engine === 'dictionary') dictionary?.warmUp();
  const taken = [...RESERVED_HOTKEYS, clickerHotkey, triggerHotkey, ...macroHotkeys].filter((k): k is string => Boolean(k));
  if (!ocrHotkey && !taken.some(k => k.toLowerCase() === ocrConfig.hotkey.toLowerCase())) {
    try {
      if (globalShortcut.register(ocrConfig.hotkey, () => toggleOcr())) ocrHotkey = ocrConfig.hotkey;
    } catch {
      // accélérateur invalide
    }
  }
  ocrReader?.warmUp();
}

function hideOcrView(): void {
  ocrRun++;
  ocrView?.hide();
  if (ocrEscape) {
    globalShortcut.unregister('Escape');
    ocrEscape = false;
  }
}

/**
 * Raccourci (ou bouton de l'overlay) : lit la fenêtre du jeu et affiche la
 * traduction par-dessus ; une seconde pression la cache. Synchrone jusqu'à
 * l'envoi de la commande au worker OCR (voir AutoClicker.start).
 */
function toggleOcr(): void {
  if (!ocrReader || !ocrView) return;
  if (ocrView.isVisible()) {
    hideOcrView();
    return;
  }
  const area = gameRectForOcr?.();
  if (!area) return;
  const run = ++ocrRun;
  const config = ocrConfig;
  const base: OcrView = { status: 'reading', area: area.dip, blocks: [], error: null, engine: config.engine, target: config.target };
  ocrView.show(base, area.dip);
  if (!globalShortcut.isRegistered('Escape')) ocrEscape = globalShortcut.register('Escape', () => hideOcrView());
  // Erreur (OCR ou traduction) : les blocs déjà lus restent affichés.
  const fail = (error: unknown) => {
    if (run === ocrRun && ocrView) ocrView.update({ ...ocrView.getView(), status: 'error', error: error instanceof Error ? error.message : String(error) });
  };
  ocrReader
    .read(config.source, area.physical)
    .then(async lines => {
      if (run !== ocrRun) return;
      // Pixels physiques de la capture → DIP de la fenêtre de la vue.
      const scale = area.dip.width / area.physical.width;
      const blocks = groupOcrLines(lines).map(b => ({
        text: b.text,
        x: Math.round(b.x * scale),
        y: Math.round(b.y * scale),
        width: Math.round(b.width * scale),
        height: Math.round(b.height * scale),
        translation: null as string | null
      }));
      const translating = config.engine !== 'none' && blocks.length > 0;
      ocrView?.update({ ...base, status: translating ? 'translating' : 'done', blocks });
      if (!translating) return;
      if (config.engine === 'dictionary') {
        if (!dictionary) return;
        const words = await dictionary.lookup(blocks.map(b => b.text), config.target === 'fr' ? 'fr' : 'en');
        if (run !== ocrRun) return;
        ocrView?.update({ ...base, status: 'done', blocks: blocks.map((b, i) => ({ ...b, words: words[i] })) });
        return;
      }
      const apiKey = config.engine === 'deepl' || config.engine === 'google' ? await translationKey(config.engine) : null;
      const translations = await translateTexts(blocks.map(b => b.text), {
        settings: config,
        apiKey,
        fetch: (url, init) => net.fetch(url, init)
      });
      if (run !== ocrRun) return;
      ocrView?.update({ ...base, status: 'done', blocks: blocks.map((b, i) => ({ ...b, translation: translations[i] })) });
    })
    .catch(fail);
}

// --- Textractor (lancement avec extraction du texte) ---
const textractorSessions = new Map<string, TextractorSession>();
// Écritures du fichier de texte, une à la fois par jeu (dans l'ordre d'arrivée).
const textractorWrites = new Map<string, Promise<unknown>>();
let notifyTextractor: ((gameId: string, view: TextractorView) => void) | null = null;

interface TextractorLaunch {
  dir: string;
  output: AppSettings['textractorOutput'];
  selectedHook: string | null;
  workspace: string;
}

/** Réglages du lancement avec Textractor, ou null si ce jeu ne le demande pas. Lève si Textractor manque. */
async function textractorLaunch(gameId: string): Promise<TextractorLaunch | null> {
  const entry = ((await cacheStore.get(gameId)) ?? {}) as Partial<GameMetadata>;
  // Textractor n'existe pas hors Windows : comme Sandboxie et Locale Emulator,
  // l'option n'a simplement aucun sens sur cet OS plutôt que de bloquer le lancement
  // (utile si l'entrée vient d'un profil Windows copié tel quel).
  if (entry.textractorEnabled !== true || process.platform !== 'win32') return null;
  const settings = await getSettings();
  const dir = settings.textractorPath ?? '';
  if (!findTextractorCli(dir, 'x86') && !findTextractorCli(dir, 'x64')) {
    throw new Error(
      dir
        ? tm('TextractorCLI.exe introuvable dans {dir} : vérifie le dossier de Textractor (Paramètres › Lancement), ou décoche « Lancer avec Textractor ».', { dir })
        : tm('Dossier de Textractor non configuré (Paramètres › Lancement) : le jeu ne peut pas être lancé avec Textractor.')
    );
  }
  return {
    dir,
    output: settings.textractorOutput ?? 'both',
    selectedHook: typeof entry.textractorHook === 'string' && entry.textractorHook ? entry.textractorHook : null,
    workspace: path.join(workspaceRoot(settings.workspaceFolder, app.getPath('documents')), gameId)
  };
}

/**
 * Texte d'un fil : le fil choisi va au presse-papiers et/ou au fichier du
 * jour (`<travaux>/<ID>/textractor/AAAA-MM-JJ.txt`) ; tant qu'aucun fil
 * n'est choisi, tous vont au fichier, préfixés de leur nom.
 */
function handleTextractorText(gameId: string, launch: TextractorLaunch, session: TextractorSession, thread: TextractorThread, text: string): void {
  const selected = session.view().selectedHook;
  const isSelected = selected !== null && thread.hookcode === selected;
  if (isSelected && launch.output !== 'file') clipboard.writeText(text);
  if (launch.output === 'clipboard' || (selected !== null && !isSelected)) return;
  const line = isSelected ? text : `[${thread.name} ${thread.hookcode}] ${text}`;
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(launch.workspace, 'textractor', `${day}.txt`);
  const previous = textractorWrites.get(gameId) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.appendFile(file, `${line}\n`, 'utf8');
    })
    .catch(error => console.error('Textractor : écriture du texte impossible', error));
  textractorWrites.set(gameId, next);
}

function startTextractor(gameId: string, gamePath: string, launch: TextractorLaunch): void {
  const session: TextractorSession = new TextractorSession({
    textractorDir: launch.dir,
    gameDir: gamePath,
    selectedHook: launch.selectedHook,
    onText: (thread, text) => handleTextractorText(gameId, launch, session, thread, text),
    onChange: view => notifyTextractor?.(gameId, view)
  });
  textractorSessions.set(gameId, session);
  session.start();
}

function stopTextractor(gameId: string): void {
  textractorSessions.get(gameId)?.stop();
  textractorSessions.delete(gameId);
  textractorWrites.delete(gameId);
}

async function clickerSettings() {
  return sanitizeClickerSettings((await getSettings()).autoClicker);
}

/** Relit les paramètres de l'auto-clicker puis l'active ou le désactive. */
export async function applyAutoClickerSettings(): Promise<void> {
  clickerConfig = await clickerSettings();
  refreshAutoClicker();
  refreshPixelTrigger();
}

/**
 * Actif = activé (Paramètres), sous Windows, et au moins un jeu lancé depuis
 * DLSGM en cours où il a été ajouté (case de l'overlay). Actif : raccourci enregistré, worker préchauffé (le
 * premier appui réagit tout de suite), dossiers des jeux transmis et témoin
 * affiché (hors mode panique). Inactif : ni raccourci, ni worker, ni témoin.
 */
function refreshAutoClicker(): void {
  if (!autoClicker) return;
  const config = clickerConfig;
  const gameDirs = [...runningGameDirs].filter(([id]) => clickerEnabledGames.has(id)).map(([, dir]) => dir);
  const available = autoClicker.getStatus().available;
  const active = config.enabled && available && gameDirs.length > 0;
  autoClicker.setInGame(active);

  if (clickerHotkey && (!active || clickerHotkey !== config.hotkey)) {
    globalShortcut.unregister(clickerHotkey);
    clickerHotkey = null;
  }
  if (!active) {
    autoClicker.dispose();
    autoClicker.setHotkeyActive(false);
  } else {
    // Le raccourci du détecteur de rythme, s'il est déjà enregistré, reste le sien.
    const taken = [...RESERVED_HOTKEYS, ...(triggerHotkey ? [triggerHotkey] : [])];
    if (!clickerHotkey && !taken.some(key => key.toLowerCase() === config.hotkey.toLowerCase())) {
      try {
        const onHotkey = () => {
          const pressedAt = Date.now();
          toggleAutoClicker(pressedAt).catch(error => console.error('Auto-clicker :', error));
        };
        if (globalShortcut.register(config.hotkey, onHotkey)) {
          clickerHotkey = config.hotkey;
        }
      } catch {
        // accélérateur invalide : raccourci indiqué comme indisponible
      }
    }
    autoClicker.setHotkeyActive(clickerHotkey !== null);
    autoClicker.warmUp().catch(error => console.error("Préparation de l'auto-clicker impossible:", error));
    autoClicker.setGameDirs(gameDirs);
  }

  clickerHud?.setVisible(active && !panicActive);
  clickerHud?.send('overlay-state-changed');
}

/**
 * Marche / arrêt (raccourci). Aucun await ne doit précéder `toggle` (voir
 * AutoClicker.start) : tout jusqu'à l'envoi de la commande reste synchrone.
 */
async function toggleAutoClicker(requestedAt = Date.now()): Promise<AutoClickerStatus> {
  if (!autoClicker) throw new Error(tm('Auto-clicker indisponible.'));
  if (!autoClicker.getStatus().running) {
    if (!clickerConfig.enabled) throw new Error(tm("L'auto-clicker est désactivé (Paramètres › Outils en jeu)."));
    if (!autoClicker.getStatus().inGame) {
      throw new Error(tm("L'auto-clicker ne fonctionne que pendant un jeu lancé depuis DLSGM, où il a été ajouté (case de l'overlay Maj+Tab)."));
    }
  }
  await autoClicker.toggle(clickerConfig, requestedAt);
  return autoClicker.getStatus();
}

/** Alt+Espace : arrête les clics et bascule le mode panique (le témoin suit). */
/** Alt+Espace : bascule le mode panique ; renvoie le nouvel état. */
export function togglePanic(): boolean {
  setPanic(!panicActive);
  return panicActive;
}

/** Mode panique fixé (Alt+Espace, super bouton panique) : outils en jeu arrêtés et masqués. */
function setPanic(active: boolean): void {
  autoClicker?.stop();
  pixelTrigger?.stop();
  macroRecorder?.stop(true);
  panicActive = active;
  refreshAutoClicker();
  refreshPixelTrigger();
  refreshMacroRecorder();
  refreshOcr();
  refreshScreenshot();
}

/** Fermeture de la fenêtre principale ou de l'application. */
export function shutdownInGameTools(): void {
  // Fenêtres encore réduites par le super bouton panique : restaurées avant de partir.
  if (superPanic?.active) superPanic.toggle();
  superPanic?.dispose();
  autoClicker?.dispose();
  pixelTrigger?.dispose();
  macroRecorder?.dispose();
  overlay?.destroy();
  gameWindow?.dispose();
  clickerHud?.destroy();
  triggerHud?.destroy();
  triggerZones?.destroy();
  macroHud?.destroy();
  ocrReader?.dispose();
  ocrView?.destroy();
  capturer?.dispose();
  dictionary?.dispose();
}

export interface PageLoader {
  preloadPath: string;
  /** Charge le renderer dans une fenêtre, à une route (#overlay). */
  loadPage: (window: BrowserWindow, hash?: string) => void;
  /** Adresse d'une page de DLSGM (ipc-guard.ts) : seules celles-ci peuvent appeler les canaux IPC. */
  isAppUrl: (url: string) => boolean;
}

// Fixé par setupIpcHandlers avant tout enregistrement de canal.
let isAppPage: (url: string) => boolean = () => false;

function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent, channel: string): void {
  if (!isTrustedSender(event.senderFrame, isAppPage)) {
    throw new Error(`Appel IPC refusé (${channel}) depuis ${event.senderFrame?.url ?? 'un cadre détruit'}`);
  }
}

/** `ipcMain.handle` réservé aux pages de DLSGM (cadre principal). */
function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event, channel);
    return listener(event, ...args);
  });
}

/** `ipcMain.on` réservé aux pages de DLSGM : un message d'ailleurs est ignoré (journalisé). */
function on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedSender(event, channel);
    } catch (error) {
      console.warn((error as Error).message);
      return;
    }
    listener(event, ...args);
  });
}

/**
 * Enregistre les handlers IPC. À n'appeler qu'une fois : sur macOS la fenêtre
 * peut être recréée (événement `activate`), d'où `getWindow` plutôt qu'une
 * référence figée — un second `ipcMain.handle` sur le même canal lève une erreur.
 */
export function setupIpcHandlers(
  getWindow: () => BrowserWindow | null,
  onSettingsSaved: ((settings: AppSettings) => void) | undefined,
  pages: PageLoader
): void {
  isAppPage = pages.isAppUrl;
  const clicker = new AutoClicker({
    scriptDir: app.getPath('userData'),
    logPath: path.join(app.getPath('userData'), 'auto-clicker.log'),
    // Les coordonnées Electron (DIP) deviennent des pixels physiques pour SetCursorPos.
    toScreenPoint: point => (process.platform === 'win32' ? screen.dipToScreenPoint(point) : point),
    onStatus: status => {
      getWindow()?.webContents.send('auto-clicker-status', status);
      clickerHud?.send('auto-clicker-status', status);
      // Démarré par le raccourci pendant que le témoin est déplié : on le replie.
      if (status.running) clickerHud?.setExpanded(false);
    }
  });
  autoClicker = clicker;
  // Overlay, témoins et contours des zones se posent sur la fenêtre du jeu et la suivent.
  const tracker = new GameWindowTracker({
    scriptDir: app.getPath('userData'),
    onChange: () => {
      overlay?.followGame();
      clickerHud?.followGame();
      triggerHud?.followGame();
      triggerZones?.followGame();
      macroHud?.followGame();
    }
  });
  gameWindow = tracker;
  const gameBounds = () => {
    const rect = tracker.current();
    // Pixels physiques → DIP (mise à l'échelle de l'écran où se trouve le jeu).
    return rect ? screen.screenToDipRect(null, rect) : null;
  };
  const gameOverlay = new GameOverlay({
    preloadPath: pages.preloadPath,
    loadPage: window => pages.loadPage(window, 'overlay'),
    gameBounds,
    isEnabled: async () => (await getSettings()).overlayEnabled !== false,
    onGamesChanged: () => overlay?.send('overlay-state-changed')
  });
  overlay = gameOverlay;
  const hud = new ClickerHud({ preloadPath: pages.preloadPath, loadPage: window => pages.loadPage(window, 'clicker-hud'), area: gameBounds });
  clickerHud = hud;
  notifySettingsChanged = () => getWindow()?.webContents.send('settings-changed');
  applyAutoClickerSettings().catch(error => console.error('Auto-clicker au démarrage :', error));

  const detector = new PixelTriggerDetector({
    scriptDir: app.getPath('userData'),
    toScreenPoint: point => (process.platform === 'win32' ? screen.dipToScreenPoint(point) : point),
    onStatus: status => {
      getWindow()?.webContents.send('pixel-trigger-status', status);
      triggerHud?.send('pixel-trigger-status', status);
      triggerZones?.send('pixel-trigger-status', status);
      // Démarré par le raccourci pendant que le témoin est déplié : on le replie.
      if (status.running) triggerHud?.setExpanded(false);
      overlay?.send('pixel-trigger-status', status);
    }
  });
  pixelTrigger = detector;
  triggerHud = new ClickerHud({
    preloadPath: pages.preloadPath,
    loadPage: window => pages.loadPage(window, 'trigger-hud'),
    offsetX: TRIGGER_HUD_OFFSET_X,
    expandedSize: TRIGGER_HUD_EXPANDED,
    area: gameBounds
  });
  triggerZones = new TriggerZonesWindow({
    preloadPath: pages.preloadPath,
    loadPage: window => pages.loadPage(window, 'trigger-zones'),
    area: gameBounds
  });
  applyPixelTriggerSettings().catch(error => console.error('Détecteur de rythme au démarrage :', error));

  macroRecorder = new MacroRecorder({
    scriptDir: app.getPath('userData'),
    onStatus: status => {
      getWindow()?.webContents.send('macro-status', status);
      macroHud?.send('macro-status', status);
      overlay?.send('macro-status', status);
    },
    onRecorded: saveRecordedMacro
  });
  macroHud = new ClickerHud({
    preloadPath: pages.preloadPath,
    loadPage: window => pages.loadPage(window, 'macro-hud'),
    offsetX: MACRO_HUD_OFFSET_X,
    area: gameBounds
  });
  applyMacroSettings().catch(error => console.error('Macros au démarrage :', error));

  handle('set-game-macro-enabled', async (event: IpcMainInvokeEvent, gameId: string, enabled: boolean) => {
    assertGameId(gameId);
    await cacheStore.update(gameId, () => ({ macroEnabled: Boolean(enabled) }));
    if (enabled) {
      macroEnabledGames.add(gameId);
      if (runningGameDirs.has(gameId)) runningGameMacros.set(gameId, await readGameMacros(gameId));
    } else {
      macroEnabledGames.delete(gameId);
      runningGameMacros.delete(gameId);
      if (macroGame() === null) macroRecorder?.stop();
    }
    overlay?.updateGame(gameId, { macroEnabled: Boolean(enabled) });
    refreshMacroRecorder();
    getWindow()?.webContents.send('cache-entry-changed', gameId, { macroEnabled: Boolean(enabled) });
  });
  handle('set-active-macro', (event: IpcMainInvokeEvent, gameId: string, macroId: string) => {
    assertGameId(gameId);
    return changeGameMacros(gameId, current => ({ ...current, activeId: String(macroId) }));
  });
  handle('update-macro', (event: IpcMainInvokeEvent, gameId: string, macroId: string, patch: { loop?: boolean; name?: string }) => {
    assertGameId(gameId);
    return changeGameMacros(gameId, current => ({
      ...current,
      macros: current.macros.map(m =>
        m.id !== macroId
          ? m
          : {
              ...m,
              ...(typeof patch?.loop === 'boolean' && { loop: patch.loop }),
              ...(typeof patch?.name === 'string' && patch.name.trim() && { name: patch.name.trim().slice(0, 80) })
            }
      )
    }));
  });
  handle('delete-macro', (event: IpcMainInvokeEvent, gameId: string, macroId: string) => {
    assertGameId(gameId);
    if (macroRecorder?.getStatus().playingMacroId === macroId) macroRecorder.stop();
    return changeGameMacros(gameId, current => ({ ...current, macros: current.macros.filter(m => m.id !== macroId) }));
  });
  // Traduction à l'écran : zone client du jeu (pixels physiques pour la capture, DIP pour la vue).
  ocrReader = new OcrReader(app.getPath('userData'));
  ocrView = new OcrViewWindow({ preloadPath: pages.preloadPath, loadPage: window => pages.loadPage(window, 'ocr-view') });
  gameRectForOcr = () => {
    const physical = tracker.current();
    if (physical) return { physical, dip: screen.screenToDipRect(null, physical) };
    // Fenêtre du jeu inconnue : l'écran principal entier.
    const dip = screen.getPrimaryDisplay().bounds;
    return { physical: screen.dipToScreenRect(null, dip), dip };
  };
  applyOcrSettings().catch(error => console.error('OCR au démarrage :', error));

  capturer = new ScreenCapturer(app.getPath('userData'));
  notifyCapture = gameId => {
    getWindow()?.webContents.send('captures-changed', gameId);
    overlay?.send('captures-changed', gameId);
  };
  applyScreenshotSettings().catch(error => console.error('Captures au démarrage :', error));

  superPanic = new SuperPanic(app.getPath('userData'), {
    setPanic: active => {
      setPanic(active);
      getWindow()?.webContents.send('panic-button-triggered', active);
    },
    hideApp: () => {
      overlay?.hide();
      const window = getWindow();
      if (process.platform === 'darwin') app.hide();
      else if (window && !window.isDestroyed() && window.isVisible() && !window.isMinimized()) {
        window.minimize();
        superPanicMinimizedApp = true;
      }
    },
    showApp: () => {
      if (process.platform === 'darwin') app.show();
      // Fenêtre de DLSGM réduite par le super bouton : rendue (le worker ne touche pas à DLSGM).
      else if (superPanicMinimizedApp) getWindow()?.restore();
      superPanicMinimizedApp = false;
    },
    openTarget: target => {
      if (target.kind === 'url') shell.openExternal(target.value).catch(error => console.error('Super panique :', error));
      else shell.openPath(target.value).then(error => error && console.error('Super panique :', error));
    }
  });
  applySuperPanicSettings().catch(error => console.error('Super panique au démarrage :', error));
  // Overlay : il se cache d'abord (sinon il serait sur la capture), comme pour l'OCR.
  handle('take-screenshot', async () => {
    if (overlay?.isVisible()) {
      overlay.hide();
      await delay(250);
    }
    return takeScreenshot();
  });
  handle('list-captures', (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    return listCaptures(capturesDir(gameId));
  });
  handle('delete-capture', async (event: IpcMainInvokeEvent, gameId: string, file: string) => {
    assertGameId(gameId);
    const full = captureFilePath(gameId, file);
    if (!full) throw new Error(tm('Capture introuvable.'));
    await shell.trashItem(full);
    return listCaptures(capturesDir(gameId));
  });
  handle('open-captures-folder', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    fs.mkdirSync(capturesDir(gameId), { recursive: true });
    const error = await shell.openPath(capturesDir(gameId));
    if (error) throw new Error(error);
  });
  dictionary = new DictionaryStore(
    path.join(app.getPath('userData'), 'dict'),
    async url => {
      const response = await net.fetch(url);
      return { ok: response.ok, status: response.status, body: response.body };
    },
    status => getWindow()?.webContents.send('dictionary-status', status)
  );
  handle('get-dictionary-status', () => dictionary!.status());
  handle('install-dictionary', async () => {
    await dictionary!.install();
    return dictionary!.status();
  });
  handle('remove-dictionary', () => {
    dictionary!.remove();
    return dictionary!.status();
  });
  handle('lookup-japanese', async (event: IpcMainInvokeEvent, text: string) => {
    if (typeof text !== 'string' || text.length > 2000) throw new Error(tm('Texte invalide.'));
    const settings = await getSettings();
    return (await dictionary!.lookup([text], settings.ocrTranslate?.target === 'en' ? 'en' : 'fr'))[0];
  });
  handle('get-ocr-view', () => ocrView?.getView() ?? null);
  handle('ocr-languages', async () => {
    try {
      return await (ocrReader?.languages() ?? Promise.resolve([]));
    } catch {
      return [];
    }
  });
  // Bouton de l'overlay : l'overlay se cache d'abord, sinon il serait lu avec le jeu.
  handle('ocr-translate-now', () => {
    if (!ocrConfig.enabled) throw new Error(tm("La traduction à l'écran est désactivée (Paramètres › Outils en jeu)."));
    if (overlay?.isVisible()) {
      overlay.hide();
      setTimeout(toggleOcr, 250);
    } else {
      toggleOcr();
    }
  });
  handle('get-translation-keys', async () => ({
    deepl: (await translationKey('deepl')) !== null,
    google: (await translationKey('google')) !== null
  }));
  handle('set-translation-key', async (event: IpcMainInvokeEvent, engine: string, key: string | null) => {
    if (engine !== 'deepl' && engine !== 'google') throw new Error(tm('Service inconnu.'));
    if (key === null || key === '') {
      await translationKeyStore.set(engine, '');
      return;
    }
    if (typeof key !== 'string' || key.length > 300) throw new Error(tm('Clé invalide.'));
    if (!safeStorage.isEncryptionAvailable()) throw new Error(tm('Chiffrement Windows indisponible : clé non enregistrée.'));
    await translationKeyStore.set(engine, safeStorage.encryptString(key.trim()).toString('base64'));
  });

  notifyTextractor = (gameId, view) => {
    getWindow()?.webContents.send('textractor-changed', gameId, view);
    overlay?.send('textractor-changed', gameId, view);
  };
  handle('set-textractor-hook', async (event: IpcMainInvokeEvent, gameId: string, hookcode: string | null) => {
    assertGameId(gameId);
    if (hookcode !== null && (typeof hookcode !== 'string' || hookcode.length > 300)) throw new Error(tm('Fil invalide.'));
    // '' = aucun fil choisi (Store.update fusionne : on ne retire pas la clé).
    await cacheStore.update(gameId, () => ({ textractorHook: hookcode ?? '' }));
    textractorSessions.get(gameId)?.setSelectedHook(hookcode);
    getWindow()?.webContents.send('cache-entry-changed', gameId, { textractorHook: hookcode ?? '' });
  });
  // --- Taille des jeux sur le disque (calcul en tâche de fond, mis en cache) ---
  const diskUsageStore = new Store('disk-usage.db', {});
  const diskScanner = new DiskUsageScanner(
    {
      get: async gameId => (await diskUsageStore.get(gameId)) as GameDiskUsage | undefined,
      set: (gameId, usage) => diskUsageStore.set(gameId, usage)
    },
    (gameId, usage, pending) => getWindow()?.webContents.send('disk-usage-changed', gameId, usage, pending)
  );
  handle('get-disk-usage', async (event: IpcMainInvokeEvent, gameIds: string[], force: boolean): Promise<DiskUsageReport> => {
    const ids = (Array.isArray(gameIds) ? gameIds : []).filter(id => typeof id === 'string' && GAME_ID_REGEX.test(id));
    const games = await Promise.all(ids.map(async gameId => ({ gameId, dir: await getGameDir(gameId) })));
    await diskScanner.refresh(games, Boolean(force));
    const known: Record<string, GameDiskUsage> = {};
    for (const { gameId } of games) {
      const usage = (await diskUsageStore.get(gameId)) as GameDiskUsage | undefined;
      if (usage) known[gameId] = usage;
    }
    return {
      games: known,
      gameDisks: Object.fromEntries(games.map(g => [g.gameId, path.parse(path.resolve(g.dir)).root])),
      disks: await diskInfo(games.map(g => g.dir)),
      pending: diskScanner.pending()
    };
  });

  handle('check-locale-emulator', async (event: IpcMainInvokeEvent, dir?: string) => {
    const target = typeof dir === 'string' ? dir : (await getSettings()).localeEmulatorPath ?? '';
    return { found: findLeProc(target) !== null, installed: leInstalled(target) };
  });
  handle('check-textractor', async (event: IpcMainInvokeEvent, dir?: string) => {
    const target = typeof dir === 'string' ? dir : (await getSettings()).textractorPath ?? '';
    return { x86: findTextractorCli(target, 'x86') !== null, x64: findTextractorCli(target, 'x64') !== null };
  });

  handle('extract-rpgmaker-assets', async (event: IpcMainInvokeEvent, gameId: string): Promise<RpgMakerExtractResult> => {
    assertGameId(gameId);
    if (!(await getSettings()).rpgMakerExtractor) throw new Error(tm("L'extracteur RPG Maker est désactivé (Paramètres › Lancement)."));
    const { installRootAbs } = await getGameToolsInfo(gameId);
    const web = findRpgMakerWebRoot(installRootAbs);
    if (!web) throw new Error(tm("Ce jeu n'est pas un RPG Maker MV / MZ."));
    const folder = 'rpgmaker-assets';
    const outDir = path.join(await gameWorkspaceDir(gameId), folder);
    const result = await extractRpgMakerAssets(web.webDir, outDir, (done, total) =>
      getWindow()?.webContents.send('rpgmaker-extract-progress', { gameId, done, total })
    );
    return { ...result, folder };
  });

  handle('toggle-macro-recording', () => toggleMacroRecordingNow());
  handle('toggle-macro-playback', () => toggleMacroPlaybackNow());

  handle('get-pixel-trigger-state', () => ({ status: detector.getStatus(), settings: triggerConfig }));
  // Témoin du détecteur : réglages rapides (déplié seulement à l'arrêt, comme celui de l'auto-clicker).
  handle('set-trigger-hud-expanded', (event: IpcMainInvokeEvent, expanded: boolean) => {
    triggerHud?.setExpanded(Boolean(expanded) && !detector.getStatus().running);
  });
  handle('save-trigger-quick-settings', async (event: IpcMainInvokeEvent, patch: { hotkey?: string }) => {
    const next = sanitizePixelTriggerSettings({ ...triggerConfig, ...(typeof patch?.hotkey === 'string' && { hotkey: patch.hotkey }) });
    await settingsStore.set('pixelTrigger', next);
    await applyPixelTriggerSettings();
    notifySettingsChanged?.();
    return detector.getStatus();
  });
  handle('get-trigger-zones', () => triggerZones?.getView() ?? null);
  handle('set-game-pixel-trigger', async (event: IpcMainInvokeEvent, gameId: string, enabled: boolean) => {
    if (typeof gameId !== 'string' || !GAME_ID_REGEX.test(gameId)) throw new Error(tm('ID de jeu invalide.'));
    await cacheStore.update(gameId, () => ({ pixelTriggerEnabled: Boolean(enabled) }));
    // Retiré en pleine surveillance : refreshPixelTrigger repart sans ses zones (ou s'arrête).
    if (enabled) triggerEnabledGames.add(gameId);
    else triggerEnabledGames.delete(gameId);
    overlay?.updateGame(gameId, { pixelTriggerEnabled: Boolean(enabled) });
    refreshPixelTrigger();
    getWindow()?.webContents.send('cache-entry-changed', gameId, { pixelTriggerEnabled: Boolean(enabled) });
  });
  // « Viser » : le temps de placer la souris dans le jeu, puis sa position (DIP) et la couleur dessous.
  // Depuis l'overlay, il s'efface le temps de viser : sinon on lirait la couleur de son voile sombre.
  handle('capture-pixel-target', async (event: IpcMainInvokeEvent, delayMs: number, hideOverlay: boolean) => {
    if (hideOverlay) overlay?.hide();
    try {
      const warm = detector.warmUp();
      await delay(Math.min(10_000, Math.max(0, Number(delayMs) || 0)));
      await warm;
      const target = await detector.captureTarget(screen.getCursorScreenPoint());
      // Worker lancé pour la seule visée : il s'arrête s'il n'a rien à surveiller.
      if (!detector.getStatus().inGame) detector.dispose();
      return target;
    } finally {
      if (hideOverlay) overlay?.show();
    }
  });
  handle('set-game-pixel-triggers', async (event: IpcMainInvokeEvent, gameId: string, raw: unknown) => {
    if (typeof gameId !== 'string' || !GAME_ID_REGEX.test(gameId)) throw new Error(tm('ID de jeu invalide.'));
    const triggers = sanitizePixelTriggers(raw);
    await cacheStore.update(gameId, () => ({ pixelTriggers: triggers }));
    gameTriggersChanged(gameId, triggers);
    // La fenêtre principale fusionne la modification dans sa copie de la fiche.
    getWindow()?.webContents.send('cache-entry-changed', gameId, { pixelTriggers: triggers });
    return triggers;
  });

  handle('get-overlay-state', async (): Promise<OverlayState> => ({
    games: gameOverlay.listGames(),
    clicker: clicker.getStatus(),
    clickerSettings: clickerConfig,
    trigger: pixelTrigger?.getStatus() ?? { available: false, running: false, paused: false, inGame: false, hotkeyActive: false, zoneCount: 0, hits: {}, frameMs: null, error: null },
    triggerSettings: triggerConfig,
    gameTriggers: Object.fromEntries(runningGameTriggers),
    macro: macroRecorder?.getStatus() ?? { available: false, recording: false, playing: false, paused: false, inGame: false, hotkeysActive: false, stepCount: 0, loops: 0, playingMacroId: null, error: null },
    macroSettings: macroConfig,
    gameMacros: Object.fromEntries(runningGameMacros),
    textractor: Object.fromEntries([...textractorSessions].map(([id, session]) => [id, session.view()])),
    ocr: { enabled: ocrConfig.enabled && process.platform === 'win32', hotkey: ocrConfig.hotkey },
    screenshot: { ...screenshotConfig, enabled: screenshotConfig.enabled && process.platform === 'win32' }
  }));
  handle('hide-overlay', () => gameOverlay.hide());
  // Témoin : réglages rapides (déplié seulement à l'arrêt, sinon les clics tomberaient dessus).
  handle('set-clicker-hud-expanded', (event: IpcMainInvokeEvent, expanded: boolean) => {
    hud.setExpanded(Boolean(expanded) && !clicker.getStatus().running);
  });
  handle('set-game-auto-clicker', async (event: IpcMainInvokeEvent, gameId: string, enabled: boolean) => {
    if (typeof gameId !== 'string' || !GAME_ID_REGEX.test(gameId)) throw new Error(tm('ID de jeu invalide.'));
    await cacheStore.update(gameId, () => ({ autoClickerEnabled: Boolean(enabled) }));
    if (enabled) clickerEnabledGames.add(gameId);
    else clickerEnabledGames.delete(gameId);
    gameOverlay.updateGame(gameId, { autoClickerEnabled: Boolean(enabled) });
    refreshAutoClicker();
  });
  handle('save-clicker-quick-settings', async (event: IpcMainInvokeEvent, patch: { intervalMs?: number; hotkey?: string }) => {
    const next = sanitizeClickerSettings({
      ...clickerConfig,
      ...(typeof patch?.intervalMs === 'number' && { intervalMs: patch.intervalMs }),
      ...(typeof patch?.hotkey === 'string' && { hotkey: patch.hotkey })
    });
    await settingsStore.set('autoClicker', next);
    await applyAutoClickerSettings();
    notifySettingsChanged?.();
    return clicker.getStatus();
  });
  handle('auto-clicker-status', () => clicker.getStatus());
  // « Prendre la position » : le temps de placer la souris, puis sa position (DIP).
  handle('capture-cursor-position', async (event: IpcMainInvokeEvent, delayMs: number) => {
    await delay(Math.min(10_000, Math.max(0, Number(delayMs) || 0)));
    return screen.getCursorScreenPoint();
  });

  // Depuis Electron 43, sans `defaultPath` les dialogues s'ouvrent toujours dans
  // Téléchargements (l'OS ne mémorise plus le dernier dossier) : on le mémorise ici.
  let lastDialogDir: string | undefined;
  const showOpenDialog = async (options: OpenDialogOptions) => {
    const window = getWindow();
    const withDefault = { ...options, defaultPath: options.defaultPath ?? lastDialogDir };
    const result = await (window ? dialog.showOpenDialog(window, withDefault) : dialog.showOpenDialog(withDefault));
    if (!result.canceled && result.filePaths.length > 0) {
      const first = result.filePaths[0];
      lastDialogDir = options.properties?.includes('openDirectory') ? first : path.dirname(first);
    }
    return result;
  };

  // --- Infos App ---
  handle('get-user-data-path', () => app.getPath('userData'));

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

  handle('get-lan-receiver-status', () => share.status());
  handle('start-lan-receiver', (event: IpcMainInvokeEvent, port: number) => share.startReceiver(port));
  handle('stop-lan-receiver', () => share.stopReceiver());
  handle('discover-lan-peers', () => share.discoverPeers());
  handle('send-games-over-lan', (event: IpcMainInvokeEvent, request: LanSendRequest) => share.sendGames(request, getGameDir));
  handle('cancel-lan-send', () => share.cancelSend());

  // --- Mises à jour ---
  handle('get-app-update-info', () => getAppUpdateInfo());
  // Bouton « Quitter DLSGM » des paramètres : quitte vraiment, même avec la
  // réduction dans la zone de notification (tray.ts laisse passer app.quit).
  on('quit-app', () => app.quit());
  handle('check-for-updates', () => checkForUpdates({ manual: true, getWindow }));

  // --- Gestion des Paramètres ---
  handle('get-settings', () => {
    return settingsStore.getAll();
  });

  handle('get-system-languages', () => systemLanguages());

  // --- Thème de couleur (src/main/theme.ts) ---
  handle('get-active-theme', () => getActiveTheme());
  handle('reroll-theme', () => rerollTheme());
  // Palettes perso : enregistrées tout de suite (sans attendre « Enregistrer »).
  // Pas de `settings-changed` : il réinitialiserait le formulaire des
  // paramètres ouvert ; le sélecteur de thème tient sa propre liste.
  handle('save-custom-themes', async (event: IpcMainInvokeEvent, list: unknown) => {
    const customThemes = sanitizeCustomThemes(list);
    await settingsStore.set('customThemes', customThemes);
    const { theme } = await getSettings();
    // Thème enregistré = palette supprimée : retour au thème par défaut.
    if (normalizeThemeSetting(theme, customThemes) !== theme) await settingsStore.set('theme', DEFAULT_THEME);
    applyThemeSetting(theme, customThemes);
    return customThemes;
  });
  on('set-app-icon', (event, dataUrl: unknown) => {
    // Seule la fenêtre principale dessine l'icône (l'overlay et les témoins ont le même thème).
    const window = getWindow();
    if (!window || event.sender !== window.webContents) return;
    const image = iconFromDataUrl(dataUrl);
    if (image) applyThemeIcon(window, image);
  });

  handle('save-settings', async (event: IpcMainInvokeEvent, newSettings: AppSettings) => {
    // Mot de passe du proxy : chiffré à part, jamais en clair dans settings.db
    // (le renderer ne renvoie que le masque, ou un nouveau mot de passe).
    const previous = await getSettings();
    const proxy = protectProxySettings(newSettings.dlsiteProxy, previous.dlsiteProxySecret);
    // Palettes perso : gérées par `save-custom-themes`, jamais écrasées par une copie périmée du formulaire.
    newSettings = { ...newSettings, customThemes: sanitizeCustomThemes(previous.customThemes) };
    // Programmes lancés par DLSGM : un nouveau chemin seulement s'il vient d'une boîte de dialogue.
    newSettings = guardExecutablePaths(newSettings, previous, pickedPaths);
    await settingsStore.setAll({ ...newSettings, ...proxy } as unknown as Record<string, unknown>);
    // Langue de l'interface changée : chaque fenêtre la relit à son chargement.
    setMainLanguage(newSettings.uiLanguage);
    applyThemeSetting(newSettings.theme, newSettings.customThemes);
    if (previous.uiLanguage !== newSettings.uiLanguage) {
      setTimeout(() => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) window.webContents.reload();
        }
      }, 150);
    }
    await applyDlsiteProxy(proxy.dlsiteProxy, proxy.dlsiteProxySecret);
    await applyAutoClickerSettings();
    await applyPixelTriggerSettings();
    await applyMacroSettings();
    await applyOcrSettings();
    await applyScreenshotSettings();
    await applySuperPanicSettings();
    await overlay?.refreshHotkey();
    onSettingsSaved?.(newSettings);
    return true;
  });

  on('update-language', (event, lang: string) => {
    // Pas de réponse attendue par l'appelant (ipcRenderer.send) : on capture
    // l'erreur ici pour éviter un rejet de promesse non géré dans le main process.
    settingsStore.set('language', lang).catch(error => {
      console.error('Erreur lors de la mise à jour de la langue:', error);
    });
  });

  // --- Gestion du Cache ---
  handle('get-cache', () => {
    return cacheStore.getAll();
  });

  // Écritures par entrée uniquement, fusionnées ici. L'ancien `save-cache`
  // (cache complet envoyé par le renderer) supprimait toute entrée absente
  // de la copie, éventuellement périmée, du renderer : perte de données dès
  // que deux écritures se croisaient (scan parallèle, note posée pendant un
  // scan...).
  handle('update-cache-entry', async (event: IpcMainInvokeEvent, gameId: string, patch: Record<string, unknown>) => {
    assertGameId(gameId);
    if (patch && 'pixelTriggers' in patch) {
      const triggers = sanitizePixelTriggers(patch.pixelTriggers);
      patch = { ...patch, pixelTriggers: triggers };
      gameTriggersChanged(gameId, triggers);
    }
    return cacheStore.update(gameId, patch);
  });

  handle('replace-cache-entry', async (event: IpcMainInvokeEvent, gameId: string, data: GameMetadata) => {
    assertGameId(gameId);
    await cacheStore.set(gameId, data);
    return true;
  });

  handle('delete-cache-entry', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    return cacheStore.delete(gameId);
  });

  // --- Sélecteur de Dossier ---
  handle('open-folder-dialog', async () => {
    const result = await showOpenDialog({
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return pickedPaths.add(result.filePaths[0]);
    }
    return null;
  });

  // Plateformes présentes dans le dossier de chaque jeu (filtre « Jouable sur
  // ce Mac », icônes de la page du jeu) : d'après ses fichiers, un jeu à la fois.
  handle('detect-game-platforms', async (event: IpcMainInvokeEvent, gameIds: unknown) => {
    if (!Array.isArray(gameIds)) return {};
    const { destinationFolder } = await getSettings();
    const result: Record<string, OsPlatform[]> = {};
    if (!destinationFolder) return result;
    for (const gameId of gameIds) {
      if (typeof gameId !== 'string' || !GAME_ID_REGEX.test(gameId)) continue;
      result[gameId] = await detectPlatforms(path.join(destinationFolder, gameId));
    }
    return result;
  });

  // --- Déplacement de la bibliothèque (src/main/library-move.ts) ---
  let libraryMoving = false;
  const libraryMoveMessage = (error: unknown): string => {
    if (!(error instanceof LibraryMoveError)) return error instanceof Error ? error.message : String(error);
    switch (error.code) {
      case 'same-folder': return tm("C'est déjà le dossier de la bibliothèque.");
      case 'target-inside-source': return tm("Le nouveau dossier ne peut pas être à l'intérieur de la bibliothèque actuelle.");
      case 'source-missing': return tm('Dossier de la bibliothèque introuvable.');
      case 'target-missing': return tm('Dossier de destination introuvable.');
      case 'nothing-to-move': return tm('La bibliothèque est vide : rien à déplacer.');
      case 'conflicts': return tm('Le dossier de destination contient déjà : {names}. Rien ne sera écrasé : choisis un dossier vide.', { names: error.detail.slice(0, 5).join(', ') + (error.detail.length > 5 ? '…' : '') });
      case 'no-space': return tm("Pas assez d'espace libre sur le disque de destination.");
    }
  };
  /** Raison de refuser un déplacement maintenant (jeu lancé, réception réseau ouverte), sinon null. */
  const libraryBusy = (): string | null => {
    if (libraryMoving) return tm('Un déplacement est déjà en cours.');
    if (runningGameDirs.size > 0) return tm("Ferme d'abord le jeu en cours.");
    if (lanShare?.status().running) return tm("Ferme d'abord la réception réseau (onglet Partage).");
    return null;
  };
  handle('plan-library-move', async (event: IpcMainInvokeEvent, target: unknown) => {
    if (typeof target !== 'string' || !target) return { ok: false, error: tm('Dossier de destination introuvable.') };
    const { destinationFolder } = await getSettings();
    if (!destinationFolder) return { ok: false, error: tm('Dossier de jeux non configuré') };
    try {
      return { ok: true, plan: await planLibraryMove(destinationFolder, target), busy: libraryBusy() };
    } catch (error) {
      return { ok: false, error: libraryMoveMessage(error) };
    }
  });
  handle('move-library', async (event: IpcMainInvokeEvent, target: unknown) => {
    if (typeof target !== 'string' || !target) return { ok: false, error: tm('Dossier de destination introuvable.') };
    const busy = libraryBusy();
    if (busy) return { ok: false, error: busy };
    const { destinationFolder } = await getSettings();
    if (!destinationFolder) return { ok: false, error: tm('Dossier de jeux non configuré') };
    libraryMoving = true;
    try {
      const result = await moveLibrary(destinationFolder, target, {
        onProgress: progress => event.sender.send('library-move-progress', progress)
      });
      // Seulement après un déplacement réussi : la bibliothèque est entière au nouvel endroit.
      await settingsStore.set('destinationFolder', path.resolve(target));
      notifySettingsChanged?.();
      return { ok: true, result };
    } catch (error) {
      console.error('Déplacement de la bibliothèque :', error);
      return { ok: false, error: libraryMoveMessage(error) };
    } finally {
      libraryMoving = false;
    }
  });

  // Fenêtre de travail du super bouton panique : un fichier ou une application choisis par l'utilisateur.
  handle('choose-super-panic-target', async () => {
    const result = await showOpenDialog({ properties: ['openFile'] });
    return !result.canceled && result.filePaths.length > 0 ? pickedPaths.add(result.filePaths[0]) : null;
  });

  // --- Opérations Système ---
  // Renvoie null (et non []) si le dossier n'existe pas, pour que l'appelant
  // distingue "dossier introuvable" de "dossier vide".
  handle('list-game-folders', async (event: IpcMainInvokeEvent, folderPath: string) => {
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
  handle('open-game-folder', async (event: IpcMainInvokeEvent, gameId: string) => {
    const gamePath = await getGameDir(gameId);
    if (!fs.existsSync(gamePath)) return false;
    const error = await shell.openPath(gamePath);
    return error === '';
  });

  handle('open-external', async (event: IpcMainInvokeEvent, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  // --- Lancement de Jeu ---
  handle('launch-game', async (event: IpcMainInvokeEvent, gameId: string): Promise<LaunchGameResult> => {
    const gamePath = await getGameDir(gameId);
    if (!fs.existsSync(gamePath)) throw new Error(tm('Dossier du jeu introuvable'));

    const executablePath = await resolveExecutable(gameId, gamePath);
    if (!executablePath) throw new Error(tm('Aucun exécutable trouvé pour ce jeu.'));
    // Lancement avec Textractor demandé : sans Textractor, le lancement échoue
    // plutôt que de se faire sans (l'option a été choisie pour ce jeu).
    const textractor = await textractorLaunch(gameId);

    let result: TrackedLaunchResult;
    runningGames.add(gameId);
    // Champs personnels (temps de jeu...) : hors de GameMetadata.
    const entry = ((await cacheStore.get(gameId)) ?? {}) as Record<string, unknown>;
    await overlay?.gameStarted({
      id: gameId,
      name: typeof entry.work_name === 'string' && entry.work_name ? entry.work_name : gameId,
      startedAt: new Date().toISOString(),
      previousPlayTime: Number(entry.totalPlayTime) || 0,
      sessionCount: Array.isArray(entry.playSessions) ? entry.playSessions.length : 0,
      lastPlayed: typeof entry.lastPlayed === 'string' ? entry.lastPlayed : null,
      autoClickerEnabled: entry.autoClickerEnabled === true,
      pixelTriggerEnabled: entry.pixelTriggerEnabled === true,
      macroEnabled: entry.macroEnabled === true
    });
    runningGameDirs.set(gameId, gamePath);
    // Suivi de la fenêtre du jeu (un worker PowerShell) : overlay, témoins et zones s'y posent.
    gameWindow?.setGameDirs([...runningGameDirs.values()]);
    if (entry.autoClickerEnabled === true) clickerEnabledGames.add(gameId);
    else clickerEnabledGames.delete(gameId);
    runningGameTriggers.set(gameId, sanitizePixelTriggers(entry.pixelTriggers));
    if (entry.pixelTriggerEnabled === true) triggerEnabledGames.add(gameId);
    else triggerEnabledGames.delete(gameId);
    if (entry.macroEnabled === true) {
      macroEnabledGames.add(gameId);
      runningGameMacros.set(gameId, await readGameMacros(gameId));
    } else {
      macroEnabledGames.delete(gameId);
    }
    refreshAutoClicker();
    refreshPixelTrigger();
    refreshMacroRecorder();
    refreshOcr();
    refreshScreenshot();
    if (textractor) startTextractor(gameId, gamePath, textractor);
    try {
      result = await startGameProcess(gameId, gamePath, executablePath);
    } finally {
      stopTextractor(gameId);
      runningGames.delete(gameId);
      await overlay?.gameEnded(gameId);
      // Plus de jeu : plus d'auto-clicker (ni raccourci, ni témoin).
      runningGameDirs.delete(gameId);
      gameWindow?.setGameDirs([...runningGameDirs.values()]);
      runningGameTriggers.delete(gameId);
      runningGameMacros.delete(gameId);
      // Plus de jeu où rejouer : la lecture et l'enregistrement s'arrêtent.
      if (macroGame() === null) macroRecorder?.stop();
      refreshAutoClicker();
      refreshPixelTrigger();
      refreshMacroRecorder();
      refreshOcr();
      refreshScreenshot();
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

  handle('choose-game-executable', async (event: IpcMainInvokeEvent, gameId: string) => {
    const gamePath = await getGameDir(gameId);
    if (!fs.existsSync(gamePath)) throw new Error(tm('Dossier du jeu introuvable'));

    const result = await showOpenDialog({
      title: tm('Exécutable de {id}', { id: gameId }),
      defaultPath: gamePath,
      properties: ['openFile'],
      filters: process.platform === 'darwin'
        ? [{ name: 'Applications', extensions: ['app'] }]
        : [{ name: 'Exécutables', extensions: ['exe'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const chosen = result.filePaths[0];
    if (!isInside(gamePath, chosen)) {
      throw new Error(tm("L'exécutable doit se trouver dans le dossier du jeu ({path}).", { path: gamePath }));
    }

    const relativePath = path.relative(gamePath, chosen);
    const saved = await cacheStore.update(gameId, { executablePath: relativePath });
    if (!saved) throw new Error(tm('Aucune fiche en cache pour {id}.', { id: gameId }));
    return relativePath;
  });

  // --- Outils par jeu (moteur, sauvegardes, patchs) ---
  handle('get-game-tools-info', async (event: IpcMainInvokeEvent, gameId: string) => {
    return publicToolsInfo(await getGameToolsInfo(gameId));
  });

  handle('open-save-location', async (event: IpcMainInvokeEvent, gameId: string, index: number) => {
    const { saveLocations } = await getGameToolsInfo(gameId);
    const location = saveLocations[index];
    if (!location || !fs.existsSync(location.path)) return false;
    return (await shell.openPath(location.path)) === '';
  });

  handle('install-auto-translator', async (event: IpcMainInvokeEvent, gameId: string, targetLanguage: string) => {
    return withPatchLock(gameId, async () => {
      const info = await getGameToolsInfo(gameId);
      await installAutoTranslator(info.gamePath, info.installRootAbs, info.engine, targetLanguage);
      return publicToolsInfo(await getGameToolsInfo(gameId));
    });
  });

  handle('apply-user-patch', async (event: IpcMainInvokeEvent, gameId: string, source: 'zip' | 'folder') => {
    return withPatchLock(gameId, async () => {
      const info = await getGameToolsInfo(gameId);
      const result = await showOpenDialog(source === 'zip'
        ? { title: tm('Patch pour {id}', { id: gameId }), properties: ['openFile'], filters: [{ name: tm('Archive zip'), extensions: ['zip'] }] }
        : { title: tm('Patch pour {id}', { id: gameId }), properties: ['openDirectory'] });
      if (result.canceled || result.filePaths.length === 0) return null;

      const sourcePath = result.filePaths[0];
      if (isInside(info.gamePath, sourcePath)) throw new Error(tm('Le patch ne peut pas se trouver dans le dossier du jeu lui-même.'));
      await applyUserPatch(info.gamePath, info.installRootAbs, sourcePath);
      return publicToolsInfo(await getGameToolsInfo(gameId));
    });
  });

  handle('uninstall-last-patch', async (event: IpcMainInvokeEvent, gameId: string) => {
    return withPatchLock(gameId, async () => {
      const gamePath = await getGameDir(gameId);
      uninstallLastPatch(gamePath);
      return publicToolsInfo(await getGameToolsInfo(gameId));
    });
  });

  // --- Import d'archives ---
  let importing = false;
  // Archives importées avec succès, par importId : seuls ces fichiers (toutes
  // leurs parties) peuvent être mis à la corbeille par le renderer, qui ne
  // fournit jamais de chemin lui-même.
  const importedArchives = new Map<string, string[]>();
  // Imports en échec faute de mot de passe, par retryId (même principe : pas de chemin venant du renderer).
  const passwordRetries = new Map<string, string>();
  const importOne = async (file: string, destinationFolder: string, password?: string): Promise<ArchiveImportResult> => {
    try {
      // Saisi, puis devinés d'après les noms et les fichiers texte, puis ceux du gestionnaire.
      const { gameId, version, dlc } = await importArchive(file, destinationFolder, { password, passwords: await archivePasswords() });
      const importId = crypto.randomUUID();
      importedArchives.set(importId, archiveVolumes(file));
      return { file: path.basename(file), gameId, importId, version, dlc };
    } catch (error) {
      const result: ArchiveImportResult = { file: path.basename(file), error: error instanceof Error ? error.message : String(error) };
      if (error instanceof ArchivePasswordError) {
        result.retryId = crypto.randomUUID();
        passwordRetries.set(result.retryId, file);
      }
      return result;
    }
  };
  handle('import-game-archives', async (): Promise<ArchiveImportResult[]> => {
    if (importing) throw new Error(tm('Un import est déjà en cours.'));
    importing = true;
    try {
      const { destinationFolder } = await getSettings();
      if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new Error(tm('Dossier de jeux non configuré ou introuvable.'));
      const result = await showOpenDialog({
        title: tm('Importer des jeux depuis leur archive'),
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: tm('Archives (.zip, .rar, .7z, .part1.exe)'), extensions: ARCHIVE_EXTENSIONS }]
      });
      if (result.canceled) return [];
      await removeStaleImports(destinationFolder);

      const results: ArchiveImportResult[] = [];
      for (const [i, file] of result.filePaths.entries()) {
        getWindow()?.webContents.send('archive-import-progress', { file: path.basename(file), index: i + 1, total: result.filePaths.length });
        results.push(await importOne(file, destinationFolder));
      }
      return results;
    } finally {
      importing = false;
    }
  });

  handle('retry-archive-import', async (event: IpcMainInvokeEvent, retryId: string, password: string, remember: boolean): Promise<ArchiveImportResult> => {
    const file = typeof retryId === 'string' ? passwordRetries.get(retryId) : undefined;
    if (!file) throw new Error(tm('Import introuvable : relance-le depuis « Importer ».'));
    if (!validArchivePassword(password)) throw new Error(tm('Mot de passe invalide.'));
    if (importing) throw new Error(tm('Un import est déjà en cours.'));
    importing = true;
    try {
      const { destinationFolder } = await getSettings();
      if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new Error(tm('Dossier de jeux non configuré ou introuvable.'));
      await removeStaleImports(destinationFolder);
      getWindow()?.webContents.send('archive-import-progress', { file: path.basename(file), index: 1, total: 1 });
      const result = await importOne(file, destinationFolder, password);
      passwordRetries.delete(retryId);
      if (result.gameId && remember) await addArchivePassword(password);
      return result;
    } finally {
      importing = false;
    }
  });

  handle('list-archive-passwords', () => archivePasswords());
  handle('add-archive-password', async (event: IpcMainInvokeEvent, password: string) => {
    if (!validArchivePassword(password)) throw new Error(tm('Mot de passe invalide.'));
    return addArchivePassword(password);
  });
  handle('remove-archive-password', async (event: IpcMainInvokeEvent, password: string) => {
    const next = (await archivePasswords()).filter(p => p !== password);
    await archivePasswordStore.set('passwords', next);
    return next;
  });

  // --- Assistant de renommage des dossiers ---
  handle('find-misnamed-folders', async (): Promise<MisnamedFolder[]> => {
    const { destinationFolder } = await getSettings();
    if (!destinationFolder || !fs.existsSync(destinationFolder)) return [];
    return findMisnamedFolders(destinationFolder);
  });

  handle('rename-misnamed-folders', async (event: IpcMainInvokeEvent, folders: string[]): Promise<FolderRenameResult[]> => {
    const { destinationFolder } = await getSettings();
    if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new Error(tm('Dossier de jeux non configuré ou introuvable.'));
    if (!Array.isArray(folders) || folders.some(f => typeof f !== 'string')) throw new Error(tm('Liste de dossiers invalide.'));
    // Seuls des noms proposés par findMisnamedFolders sont renommés (revérifiés dans renameMisnamedFolders).
    return renameMisnamedFolders(destinationFolder, folders);
  });

  // Corbeille plutôt que suppression définitive : récupérable en cas d'erreur.
  handle('trash-imported-archives', async (event: IpcMainInvokeEvent, importIds: string[]): Promise<TrashArchivesResult> => {
    const result: TrashArchivesResult = { trashed: 0, errors: [] };
    for (const importId of Array.isArray(importIds) ? importIds : []) {
      const files = importedArchives.get(importId);
      if (!files) continue;
      importedArchives.delete(importId);
      for (const file of files) {
        if (!fs.existsSync(file)) continue;
        try {
          await shell.trashItem(file);
          result.trashed++;
        } catch (error) {
          result.errors.push(`${path.basename(file)} : ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return result;
  });

  handle('test-dlsite-connection', () => testDlsiteConnection());
  // Même pile réseau que DLsite (net.fetch) : l'IP publique affichée est celle que DLsite verra.
  handle('check-ip', () => checkIp((url, init) => net.fetch(url, init)));

  // --- VPN Private Internet Access ---
  handle('get-pia-status', () => pia.status());

  handle('begin-vpn-session', async () => {
    const { piaRegion } = await getSettings();
    await pia.begin(piaRegion || 'jp-tokyo');
    // Connexions HTTP ouvertes avant le tunnel : fermées, pour que les
    // requêtes suivantes passent bien par le VPN.
    await session.defaultSession.closeAllConnections();
  });

  handle('end-vpn-session', async () => {
    await pia.end();
    if (!pia.active) await session.defaultSession.closeAllConnections();
  });

  // --- Copie de la base (avant une mise à jour groupée) ---
  handle('snapshot-cache', async () => {
    // Écritures en attente appliquées avant la copie.
    await cacheStore.getAll();
    return snapshotDatabase(app.getPath('userData'), 'cache.db');
  });

  // --- Dossier de travaux (data mining...) ---

  const gameWorkspaceDir = async (gameId: string) => {
    assertGameId(gameId);
    return path.join(workspaceRoot((await getSettings()).workspaceFolder, app.getPath('documents')), gameId);
  };

  handle('get-workspace-root', async () => workspaceRoot((await getSettings()).workspaceFolder, app.getPath('documents')));

  handle('get-game-workspace', async (event: IpcMainInvokeEvent, gameId: string) => describeWorkspace(await gameWorkspaceDir(gameId)));

  handle('open-game-workspace', async (event: IpcMainInvokeEvent, gameId: string) => {
    const dir = await gameWorkspaceDir(gameId);
    await fs.promises.mkdir(dir, { recursive: true });
    const error = await shell.openPath(dir);
    if (error) throw new Error(tm("Impossible d'ouvrir le dossier de travaux : {error}", { error }));
    return describeWorkspace(dir);
  });

  // --- Copies des sauvegardes ---


  handle('list-save-backups', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    return listSaveBackups(gameId);
  });

  handle('create-save-backup', async (event: IpcMainInvokeEvent, gameId: string) => {
    return withBackupLock(gameId, async () => createSaveBackup(gameId, (await getGameToolsInfo(gameId)).saveLocations, 'manual'));
  });

  handle('restore-save-backup', async (event: IpcMainInvokeEvent, gameId: string, backupId: string) => {
    assertGameId(gameId);
    if (runningGames.has(gameId)) throw new Error(tm("Le jeu est en cours d'exécution : ferme-le avant de restaurer ses sauvegardes."));
    return withBackupLock(gameId, async () => restoreSaveBackup(gameId, backupId, (await getGameToolsInfo(gameId)).saveLocations));
  });

  handle('delete-save-backup', async (event: IpcMainInvokeEvent, gameId: string, backupId: string) => {
    assertGameId(gameId);
    return withBackupLock(gameId, () => deleteSaveBackup(gameId, backupId));
  });

  // --- Sandbox Sandboxie-Plus ---

  handle('get-sandboxie-status', async (): Promise<SandboxieStatus> => {
    const installDir = await findSandboxieDir();
    return { available: installDir !== null, installDir };
  });

  handle('clear-game-sandbox', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    if (runningGames.has(gameId)) throw new Error(tm("Le jeu est en cours d'exécution : ferme-le avant de vider sa sandbox."));
    const sandboxieDir = await findSandboxieDir();
    if (!sandboxieDir) throw new Error(tm('Sandboxie-Plus est introuvable.'));
    await deleteGameBox(sandboxieDir, gameId);
    return publicToolsInfo(await getGameToolsInfo(gameId));
  });

  // --- Récupération des métadonnées DLsite (japonais + traductions) ---
  handle('fetch-game-metadata', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    const { metadata, genreTranslations: learned } = await fetchWork(gameId);
    await genreTranslations.learn(learned);
    return metadata;
  });

  // --- Dictionnaire des tags ---
  // Amorçage idempotent (n'écrase rien) avec les paires connues ; les anciens
  // « genres liés » sont repris par la migration 004.
  genreTranslations.seed(KNOWN_GENRE_TRANSLATIONS).catch(error => console.error('Amorçage du dictionnaire des tags impossible:', error));

  handle('get-genre-translations', () => genreTranslations.all());
  handle('set-genre-translation', async (event: IpcMainInvokeEvent, japanese: string, english: string | null) => {
    if (typeof japanese !== 'string' || !japanese || japanese.length > 200) throw new Error(tm('Genre invalide.'));
    if (english !== null && (typeof english !== 'string' || english.length > 200)) throw new Error(tm('Traduction invalide.'));
    await genreTranslations.setManual(japanese, english);
    return genreTranslations.all();
  });

  // --- Cache d'images ---
  // Canaux dédiés, à la place des anciens fs-rm / fs-copy / fs-mkdir
  // génériques qui acceptaient n'importe quel chemin venant du renderer.
  // Les images ajoutées à la main (work_image / sample_images === 'manual')
  // sont conservées : elles ne sont téléchargeables nulle part, les supprimer
  // les perdrait définitivement.
  handle('reset-image-cache', async () => {
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
  handle('apply-game-images', async (event: IpcMainInvokeEvent, gameId: string, plan: GameImagesPlan) => {
    assertGameId(gameId);
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.samples)) throw new Error(tm("Plan d'images invalide."));

    // Chaque image existante (0 = couverture, n = sample_n.jpg) sert au plus
    // une fois : sinon deux renommages se disputeraient le même fichier.
    const used = new Set<number>();
    const checkSource = (source: unknown, allowCover: boolean) => {
      if (!source || typeof source !== 'object') throw new Error(tm("Plan d'images invalide."));
      if ('keep' in source) {
        const keep = (source as { keep: unknown }).keep;
        if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < (allowCover ? 0 : 1) || used.has(keep)) {
          throw new Error(tm("Plan d'images invalide."));
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
  handle('toggle-fullscreen', () => {
    const window = getWindow();
    if (!window) return false;
    window.setFullScreen(!window.isFullScreen());
    return window.isFullScreen();
  });

  handle('is-fullscreen', () => getWindow()?.isFullScreen() ?? false);

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
  handle('download-game-images', async (event: IpcMainInvokeEvent, gameId: string, metadata: GameMetadata, options?: { overwrite?: boolean }) => {
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

  handle('get-wishlist', () => wishlist.list());
  handle('add-to-wishlist', (event: IpcMainInvokeEvent, text: string) => {
    if (typeof text !== 'string' || text.length > 20000) throw new Error(tm('Saisie invalide.'));
    return wishlist.add(text);
  });
  handle('remove-from-wishlist', (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    return wishlist.remove(gameId);
  });
  handle('refresh-wishlist-item', async (event: IpcMainInvokeEvent, gameId: string) => {
    assertGameId(gameId);
    if (!(await wishlistStore.get(gameId))) throw new Error(tm("{id} n'est pas dans la liste de souhaits.", { id: gameId }));
    return wishlist.refresh(gameId);
  });
}

