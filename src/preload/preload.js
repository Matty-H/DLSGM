const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose les API sécurisées au processus de rendu.
 */
contextBridge.exposeInMainWorld('electronAPI', {
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

  // Opérations système
  listGameFolders: (folderPath) => ipcRenderer.invoke('list-game-folders', folderPath),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  launchGame: (gameId) => ipcRenderer.invoke('launch-game', gameId),
  downloadGameImages: (gameId, metadata, destBaseDir) => ipcRenderer.invoke('download-game-images', gameId, metadata, destBaseDir),

  // Scripts Python
  runPythonScript: (scriptName, args) => ipcRenderer.invoke('run-python-script', scriptName, args),

  // Utilitaires de fichiers (bridgés pour la sécurité)
  pathJoin: (...args) => ipcRenderer.invoke('path-join', ...args),
  fsExists: (path) => ipcRenderer.invoke('fs-exists', path),
  fsMkdir: (path) => ipcRenderer.invoke('fs-mkdir', path),
  fsReaddir: (path) => ipcRenderer.invoke('fs-readdir', path),
  fsRm: (path) => ipcRenderer.invoke('fs-rm', path),

  // Événements (du Main vers le Renderer)
  onPanicTriggered: (callback) => ipcRenderer.on('panic-button-triggered', (event, ...args) => callback(...args))
});
