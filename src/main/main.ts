import { app, BrowserWindow, globalShortcut, protocol } from 'electron';
import path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { initAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;

/**
 * Crée la fenêtre principale de l'application.
 */
function createWindow(): void {
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

  // Chargement de l'interface : serveur de dev Vite si présent (npm run dev),
  // sinon le build de production (npm start / app packagée). Le renderer
  // buildé vit sous src/renderer/dist quel que soit le dossier de sortie de
  // la compilation de main (dist/main/main), donc on remonte jusqu'à la
  // racine du repo avant de redescendre vers src/renderer/dist.
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'dist', 'index.html'));
  }

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
    // Nettoie l'URL pour obtenir un chemin de fichier valide
    let filePath = decodeURIComponent(request.url.replace(/^atom:\/\/[/]*/, ''));

    // Correction spécifique pour Windows : restauration du colon (C:/ au lieu de C/)
    if (process.platform === 'win32' && /^[a-zA-Z]\//.test(filePath)) {
      filePath = filePath[0] + ':' + filePath.substring(1);
    }

    callback({ path: path.normalize(filePath) });
  });

  createWindow();

  // Vérification des mises à jour (build packagée uniquement — en dev, il
  // n'y a pas d'installation existante à mettre à jour).
  if (app.isPackaged) {
    initAutoUpdater();
  }

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
