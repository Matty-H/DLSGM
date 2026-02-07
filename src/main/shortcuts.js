// src/main/shortcuts.js

const { globalShortcut } = require('electron');
const { IPC_CHANNELS } = require('../shared/constants');

let mainWindowRef = null;

/**
 * Configure les raccourcis globaux de l'application
 * @param {BrowserWindow} mainWindow - Référence à la fenêtre principale
 */
function setupShortcuts(mainWindow) {
  mainWindowRef = mainWindow;
  
  // Enregistrer le raccourci panic button (Alt+Space)
  globalShortcut.register('Alt+Space', () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      console.log('Panic shortcut triggered');
      mainWindowRef.webContents.send(IPC_CHANNELS.PANIC_BUTTON_TRIGGERED);
    }
  });
}

/**
 * Nettoie tous les raccourcis globaux
 */
function cleanupShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = { setupShortcuts, cleanupShortcuts };
