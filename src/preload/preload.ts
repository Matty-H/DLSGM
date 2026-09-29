import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/ipc-types';

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
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),

  // Opérations système
  listGameFolders: (folderPath) => ipcRenderer.invoke('list-game-folders', folderPath),
  openGameFolder: (gameId) => ipcRenderer.invoke('open-game-folder', gameId),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  launchGame: (gameId) => ipcRenderer.invoke('launch-game', gameId),
  chooseGameExecutable: (gameId) => ipcRenderer.invoke('choose-game-executable', gameId),
  downloadGameImages: (gameId, metadata) => ipcRenderer.invoke('download-game-images', gameId, metadata),
  resetImageCache: () => ipcRenderer.invoke('reset-image-cache'),
  setCustomCover: (gameId, sourceImagePath) => ipcRenderer.invoke('set-custom-cover', gameId, sourceImagePath),

  // Outils par jeu : moteur, sauvegardes, patchs réversibles
  getGameToolsInfo: (gameId) => ipcRenderer.invoke('get-game-tools-info', gameId),
  openSaveLocation: (gameId, index) => ipcRenderer.invoke('open-save-location', gameId, index),
  installAutoTranslator: (gameId, targetLanguage) => ipcRenderer.invoke('install-auto-translator', gameId, targetLanguage),
  applyUserPatch: (gameId, source) => ipcRenderer.invoke('apply-user-patch', gameId, source),
  uninstallLastPatch: (gameId) => ipcRenderer.invoke('uninstall-last-patch', gameId),


  // Récupération des métadonnées DLsite
  fetchGameMetadata: (gameId, locale) => ipcRenderer.invoke('fetch-game-metadata', gameId, locale),

  // Événements (du Main vers le Renderer)
  onPanicTriggered: (callback) => ipcRenderer.on('panic-button-triggered', () => callback())
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
