import { contextBridge, ipcRenderer } from 'electron';
import type { ArchiveImportProgress, AutoClickerStatus, ElectronAPI, GameDiskUsage, MacroRecorderStatus, OcrView, TextractorView, PixelTriggerStatus, TriggerZonesView, LanReceiverStatus, LanTransferProgress } from '../shared/ipc-types';

/**
 * Expose les API sécurisées au processus de rendu. Typé contre `ElectronAPI`
 * (src/shared/ipc-types.ts) : toute divergence entre ce qui est exposé ici et
 * le contrat déclaré devient une erreur de compilation.
 */
const electronAPI: ElectronAPI = {
  // Infos App
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // Gestion des paramètres
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  updateLanguage: (lang) => ipcRenderer.send('update-language', lang),

  // Gestion du cache (écritures par entrée, fusionnées côté main)
  getCache: () => ipcRenderer.invoke('get-cache'),
  updateCacheEntry: (gameId, patch) => ipcRenderer.invoke('update-cache-entry', gameId, patch),
  replaceCacheEntry: (gameId, data) => ipcRenderer.invoke('replace-cache-entry', gameId, data),
  deleteCacheEntry: (gameId) => ipcRenderer.invoke('delete-cache-entry', gameId),

  // Dialogue de dossier
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),

  // Opérations système
  listGameFolders: (folderPath) => ipcRenderer.invoke('list-game-folders', folderPath),
  openGameFolder: (gameId) => ipcRenderer.invoke('open-game-folder', gameId),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  launchGame: (gameId) => ipcRenderer.invoke('launch-game', gameId),
  chooseGameExecutable: (gameId) => ipcRenderer.invoke('choose-game-executable', gameId),
  downloadGameImages: (gameId, metadata, options) => ipcRenderer.invoke('download-game-images', gameId, metadata, options),
  resetImageCache: () => ipcRenderer.invoke('reset-image-cache'),
  applyGameImages: (gameId, plan) => ipcRenderer.invoke('apply-game-images', gameId, plan),

  // Plein écran
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),

  // Outils par jeu : moteur, sauvegardes, patchs réversibles
  getGameToolsInfo: (gameId) => ipcRenderer.invoke('get-game-tools-info', gameId),
  openSaveLocation: (gameId, index) => ipcRenderer.invoke('open-save-location', gameId, index),
  installAutoTranslator: (gameId, targetLanguage) => ipcRenderer.invoke('install-auto-translator', gameId, targetLanguage),
  applyUserPatch: (gameId, source) => ipcRenderer.invoke('apply-user-patch', gameId, source),
  uninstallLastPatch: (gameId) => ipcRenderer.invoke('uninstall-last-patch', gameId),

  // Liste de souhaits
  getWishlist: () => ipcRenderer.invoke('get-wishlist'),
  addToWishlist: (text) => ipcRenderer.invoke('add-to-wishlist', text),
  removeFromWishlist: (gameId) => ipcRenderer.invoke('remove-from-wishlist', gameId),
  refreshWishlistItem: (gameId) => ipcRenderer.invoke('refresh-wishlist-item', gameId),

  // Import d'archives

  importGameArchives: () => ipcRenderer.invoke('import-game-archives'),
  trashImportedArchives: (importIds) => ipcRenderer.invoke('trash-imported-archives', importIds),
  retryArchiveImport: (retryId, password, remember) => ipcRenderer.invoke('retry-archive-import', retryId, password, remember),
  listArchivePasswords: () => ipcRenderer.invoke('list-archive-passwords'),
  removeArchivePassword: password => ipcRenderer.invoke('remove-archive-password', password),
  findMisnamedFolders: () => ipcRenderer.invoke('find-misnamed-folders'),
  renameMisnamedFolders: folders => ipcRenderer.invoke('rename-misnamed-folders', folders),
  onArchiveImportProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ArchiveImportProgress) => callback(progress);
    ipcRenderer.on('archive-import-progress', listener);
    return () => {
      ipcRenderer.removeListener('archive-import-progress', listener);
    };
  },

  snapshotCache: () => ipcRenderer.invoke('snapshot-cache'),

  testDlsiteConnection: () => ipcRenderer.invoke('test-dlsite-connection'),
  checkIp: () => ipcRenderer.invoke('check-ip'),

  // VPN Private Internet Access
  getPiaStatus: () => ipcRenderer.invoke('get-pia-status'),
  beginVpnSession: () => ipcRenderer.invoke('begin-vpn-session'),
  endVpnSession: () => ipcRenderer.invoke('end-vpn-session'),

  // Dossier de travaux d'un jeu


  getGameWorkspace: (gameId) => ipcRenderer.invoke('get-game-workspace', gameId),
  openGameWorkspace: (gameId) => ipcRenderer.invoke('open-game-workspace', gameId),
  getWorkspaceRoot: () => ipcRenderer.invoke('get-workspace-root'),

  // Copies des sauvegardes


  listSaveBackups: (gameId) => ipcRenderer.invoke('list-save-backups', gameId),
  createSaveBackup: (gameId) => ipcRenderer.invoke('create-save-backup', gameId),
  restoreSaveBackup: (gameId, backupId) => ipcRenderer.invoke('restore-save-backup', gameId, backupId),
  deleteSaveBackup: (gameId, backupId) => ipcRenderer.invoke('delete-save-backup', gameId, backupId),


  // Sandbox Sandboxie-Plus
  getSandboxieStatus: () => ipcRenderer.invoke('get-sandboxie-status'),
  clearGameSandbox: (gameId) => ipcRenderer.invoke('clear-game-sandbox', gameId),

  // Récupération des métadonnées DLsite
  fetchGameMetadata: (gameId) => ipcRenderer.invoke('fetch-game-metadata', gameId),
  getGenreTranslations: () => ipcRenderer.invoke('get-genre-translations'),
  setGenreTranslation: (japanese, english) => ipcRenderer.invoke('set-genre-translation', japanese, english),


  // Échange de jeux en réseau local
  getLanReceiverStatus: () => ipcRenderer.invoke('get-lan-receiver-status'),
  startLanReceiver: (port) => ipcRenderer.invoke('start-lan-receiver', port),
  stopLanReceiver: () => ipcRenderer.invoke('stop-lan-receiver'),
  discoverLanPeers: () => ipcRenderer.invoke('discover-lan-peers'),
  sendGamesOverLan: (request) => ipcRenderer.invoke('send-games-over-lan', request),
  cancelLanSend: () => ipcRenderer.invoke('cancel-lan-send'),

  // Événements (du Main vers le Renderer)
  getOverlayState: () => ipcRenderer.invoke('get-overlay-state'),
  hideOverlay: () => ipcRenderer.invoke('hide-overlay'),
  getAutoClickerStatus: () => ipcRenderer.invoke('auto-clicker-status'),
  captureCursorPosition: (delayMs) => ipcRenderer.invoke('capture-cursor-position', delayMs),
  onAutoClickerStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AutoClickerStatus) => callback(status);
    ipcRenderer.on('auto-clicker-status', listener);
    return () => {
      ipcRenderer.removeListener('auto-clicker-status', listener);
    };
  },
  onOverlayStateChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('overlay-state-changed', listener);
    return () => {
      ipcRenderer.removeListener('overlay-state-changed', listener);
    };
  },
  onOverlayShown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('overlay-shown', listener);
    return () => {
      ipcRenderer.removeListener('overlay-shown', listener);
    };
  },

  setClickerHudExpanded: (expanded) => ipcRenderer.invoke('set-clicker-hud-expanded', expanded),
  saveClickerQuickSettings: (patch) => ipcRenderer.invoke('save-clicker-quick-settings', patch),
  setGameAutoClicker: (gameId, enabled) => ipcRenderer.invoke('set-game-auto-clicker', gameId, enabled),
  onClickerHudExpanded: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, expanded: boolean) => callback(expanded);
    ipcRenderer.on('clicker-hud-expanded', listener);
    return () => {
      ipcRenderer.removeListener('clicker-hud-expanded', listener);
    };
  },
  getPixelTriggerState: () => ipcRenderer.invoke('get-pixel-trigger-state'),
  setTextractorHook: (gameId, hookcode) => ipcRenderer.invoke('set-textractor-hook', gameId, hookcode),
  checkTextractor: dir => ipcRenderer.invoke('check-textractor', dir),
  onTextractorChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, gameId: string, view: TextractorView) => callback(gameId, view);
    ipcRenderer.on('textractor-changed', listener);
    return () => {
      ipcRenderer.removeListener('textractor-changed', listener);
    };
  },
  extractRpgMakerAssets: gameId => ipcRenderer.invoke('extract-rpgmaker-assets', gameId),
  onRpgMakerExtractProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { gameId: string; done: number; total: number }) => callback(progress);
    ipcRenderer.on('rpgmaker-extract-progress', listener);
    return () => {
      ipcRenderer.removeListener('rpgmaker-extract-progress', listener);
    };
  },
  getDiskUsage: (gameIds, force) => ipcRenderer.invoke('get-disk-usage', gameIds, Boolean(force)),
  onDiskUsageChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, gameId: string, usage: GameDiskUsage, pending: number) => callback(gameId, usage, pending);
    ipcRenderer.on('disk-usage-changed', listener);
    return () => {
      ipcRenderer.removeListener('disk-usage-changed', listener);
    };
  },
  checkLocaleEmulator: dir => ipcRenderer.invoke('check-locale-emulator', dir),
  getOcrView: () => ipcRenderer.invoke('get-ocr-view'),
  onOcrView: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, view: OcrView) => callback(view);
    ipcRenderer.on('ocr-view', listener);
    return () => {
      ipcRenderer.removeListener('ocr-view', listener);
    };
  },
  getOcrLanguages: () => ipcRenderer.invoke('ocr-languages'),
  ocrTranslateNow: () => ipcRenderer.invoke('ocr-translate-now'),
  getTranslationKeys: () => ipcRenderer.invoke('get-translation-keys'),
  setTranslationKey: (engine, key) => ipcRenderer.invoke('set-translation-key', engine, key),
  setGameMacroEnabled: (gameId, enabled) => ipcRenderer.invoke('set-game-macro-enabled', gameId, enabled),
  setActiveMacro: (gameId, macroId) => ipcRenderer.invoke('set-active-macro', gameId, macroId),
  updateMacro: (gameId, macroId, patch) => ipcRenderer.invoke('update-macro', gameId, macroId, patch),
  deleteMacro: (gameId, macroId) => ipcRenderer.invoke('delete-macro', gameId, macroId),
  toggleMacroRecording: () => ipcRenderer.invoke('toggle-macro-recording'),
  toggleMacroPlayback: () => ipcRenderer.invoke('toggle-macro-playback'),
  onMacroStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: MacroRecorderStatus) => callback(status);
    ipcRenderer.on('macro-status', listener);
    return () => {
      ipcRenderer.removeListener('macro-status', listener);
    };
  },
  setGamePixelTrigger: (gameId, enabled) => ipcRenderer.invoke('set-game-pixel-trigger', gameId, enabled),
  getTriggerZones: () => ipcRenderer.invoke('get-trigger-zones'),
  setTriggerHudExpanded: (expanded) => ipcRenderer.invoke('set-trigger-hud-expanded', expanded),
  saveTriggerQuickSettings: (patch) => ipcRenderer.invoke('save-trigger-quick-settings', patch),
  onTriggerZones: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, view: TriggerZonesView) => callback(view);
    ipcRenderer.on('trigger-zones', listener);
    return () => {
      ipcRenderer.removeListener('trigger-zones', listener);
    };
  },
  onPixelTriggerStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: PixelTriggerStatus) => callback(status);
    ipcRenderer.on('pixel-trigger-status', listener);
    return () => {
      ipcRenderer.removeListener('pixel-trigger-status', listener);
    };
  },
  capturePixelTarget: (delayMs, hideOverlay) => ipcRenderer.invoke('capture-pixel-target', delayMs, Boolean(hideOverlay)),
  setGamePixelTriggers: (gameId, triggers) => ipcRenderer.invoke('set-game-pixel-triggers', gameId, triggers),
  onCacheEntryChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, gameId: string, patch: Record<string, unknown>) => callback(gameId, patch);
    ipcRenderer.on('cache-entry-changed', listener);
    return () => {
      ipcRenderer.removeListener('cache-entry-changed', listener);
    };
  },
  onSettingsChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('settings-changed', listener);
    return () => {
      ipcRenderer.removeListener('settings-changed', listener);
    };
  },

  onPanicTriggered: (callback) => ipcRenderer.on('panic-button-triggered', () => callback()),
  onLanTransferProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: LanTransferProgress) => callback(progress);
    ipcRenderer.on('lan-transfer-progress', listener);
    return () => {
      ipcRenderer.removeListener('lan-transfer-progress', listener);
    };
  },
  onLanReceiverStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: LanReceiverStatus) => callback(status);
    ipcRenderer.on('lan-receiver-status', listener);
    return () => {
      ipcRenderer.removeListener('lan-receiver-status', listener);
    };
  },
  onFullscreenChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean) => callback(value);
    ipcRenderer.on('fullscreen-changed', listener);
    return () => {
      ipcRenderer.removeListener('fullscreen-changed', listener);
    };
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
