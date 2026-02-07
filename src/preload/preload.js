// src/preload/preload.js

const { contextBridge, ipcRenderer } = require('electron');

/**
 * API exposée au renderer de manière sécurisée
 * Cette API permet au renderer d'interagir avec le processus principal
 * sans avoir accès direct aux modules Node.js
 */
const electronAPI = {
  // Settings
  updateLanguage: (lang) => {
    ipcRenderer.send('update-language', lang);
  },

  // Folder dialog
  openFolderDialog: () => {
    ipcRenderer.send('open-folder-dialog');
  },

  onFolderSelected: (callback) => {
    ipcRenderer.on('selected-folder', (event, folderPath) => {
      callback(folderPath);
    });
  },

  // Panic button
  onPanicButtonTriggered: (callback) => {
    ipcRenderer.on('panic-button-triggered', () => {
      callback();
    });
  },

  // Cleanup listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

/**
 * Expose l'API au renderer via contextBridge
 * L'API sera accessible via window.electronAPI dans le renderer
 */
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
