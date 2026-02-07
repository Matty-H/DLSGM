// src/main/index.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');
const { setupShortcuts } = require('./shortcuts');

let mainWindow = null;

/**
 * Crée la fenêtre principale de l'application
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 570,
    webPreferences: {
      // NOTE: Pour une application locale, nous activons nodeIntegration
      // Pour une meilleure sécurité en production, utilisez un bundler (webpack/vite)
      // et gardez contextIsolation: true avec nodeIntegration: false
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  // Charger l'interface
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Ouvrir DevTools en développement
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Nettoyer la référence quand la fenêtre est fermée
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Point d'entrée de l'application
 */
app.whenReady().then(() => {
  createWindow();
  
  // Configurer les gestionnaires IPC
  setupIpcHandlers();
  
  // Configurer les raccourcis globaux
  setupShortcuts(mainWindow);

  app.on('activate', () => {
    // Sur macOS, recréer la fenêtre si elle est fermée
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Quitter quand toutes les fenêtres sont fermées
 * (sauf sur macOS où c'est commun de garder l'app active)
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Nettoyer avant de quitter
 */
app.on('will-quit', () => {
  const { cleanupShortcuts } = require('./shortcuts');
  cleanupShortcuts();
});
