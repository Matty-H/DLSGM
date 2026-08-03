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

  // Gestion du cache
  getCache: () => ipcRenderer.invoke('get-cache'),
  saveCache: (cache) => ipcRenderer.invoke('save-cache', cache),

  // Dialogue de dossier
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),

  // Opérations système
  listGameFolders: (folderPath) => ipcRenderer.invoke('list-game-folders', folderPath),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  launchGame: (gameId) => ipcRenderer.invoke('launch-game', gameId),
  downloadGameImages: (gameId, metadata, destBaseDir) => ipcRenderer.invoke('download-game-images', gameId, metadata, destBaseDir),

  // Récupération des métadonnées DLsite
  fetchGameMetadata: (gameId, locale) => ipcRenderer.invoke('fetch-game-metadata', gameId, locale),

  // Utilitaires de fichiers (bridgés pour la sécurité)
  pathJoin: (...args) => ipcRenderer.invoke('path-join', args),
  fsExists: (path) => ipcRenderer.invoke('fs-exists', path),
  fsMkdir: (path) => ipcRenderer.invoke('fs-mkdir', path),
  fsReaddir: (path) => ipcRenderer.invoke('fs-readdir', path),
  fsRm: (path) => ipcRenderer.invoke('fs-rm', path),
  fsCopy: (src, dest) => ipcRenderer.invoke('fs-copy', src, dest),

  // Événements (du Main vers le Renderer)
  onPanicTriggered: (callback) => ipcRenderer.on('panic-button-triggered', () => callback())
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
