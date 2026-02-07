const { app, BrowserWindow, globalShortcut, ipcMain, protocol } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');

let mainWindow;

/**
 * Crée la fenêtre principale de l'application.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // Pour un look plus moderne sur Mac
    webPreferences: {
      nodeIntegration: false,    // Sécurité : désactivé
      contextIsolation: true,    // Sécurité : activé
      sandbox: true,             // Sécurité : activé
      preload: path.join(__dirname, '..', 'preload', 'preload.js')
    },
    backgroundColor: '#121212'   // Évite le flash blanc au chargement
  });

  // Chargement de l'interface
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Ouvrir les outils de développement en mode dev (optionnel)
  // mainWindow.webContents.openDevTools();

  // Initialisation des gestionnaires IPC
  setupIpcHandlers(mainWindow);
}

// Enregistrement du protocole atom pour charger les images locales
protocol.registerSchemesAsPrivileged([
  { scheme: 'atom', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Initialisation de l'application
app.whenReady().then(() => {
  protocol.registerFileProtocol('atom', (request, callback) => {
    const url = request.url.substr(7);
    callback({ path: path.normalize(decodeURIComponent(url)) });
  });

  createWindow();

  // Enregistrement du raccourci Panic Button (Alt+Space)
  globalShortcut.register('Alt+Space', () => {
    if (mainWindow) {
      mainWindow.webContents.send('panic-button-triggered');
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Libération des raccourcis à la fermeture
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Quitter quand toutes les fenêtres sont fermées (sauf sur Mac)
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('Une erreur non capturée est survenue dans le processus principal:', error);
});
