import { app, BrowserWindow, globalShortcut, net, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { setupIpcHandlers, getImgCacheDir, getSettings, isInside, shutdownLanShare } from './ipc-handlers';
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
    backgroundColor: '#0e141b'   // Évite le flash blanc au chargement
  });

  const window = mainWindow;

  // Un fichier lâché hors d'une zone de dépôt ferait naviguer la fenêtre vers
  // ce fichier (et quitter l'application) : toute navigation est refusée,
  // l'interface est une page unique.
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  // F11 bascule le plein écran. Intercepté ici (et non dans la page) pour
  // ne pas entrer en conflit avec l'accélérateur du menu par défaut.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
  });
  window.on('enter-full-screen', () => window.webContents.send('fullscreen-changed', true));
  window.on('leave-full-screen', () => window.webContents.send('fullscreen-changed', false));

  getSettings()
    .then(settings => {
      if (settings.startFullscreen && !window.isDestroyed()) window.setFullScreen(true);
    })
    .catch(error => console.error('Lecture des paramètres de plein écran impossible:', error));

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
}

// Enregistrement du protocole atom pour charger les images locales
protocol.registerSchemesAsPrivileged([
  { scheme: 'atom', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Initialisation de l'application
app.whenReady().then(() => {
  // atom://img/<ID>/<fichier> -> <userData>/img_cache/<ID>/<fichier>. Le
  // protocole ne sert que le cache d'images : tout chemin qui en sort
  // (../, chemin absolu) est refusé, au lieu d'exposer tout le disque.
  protocol.handle('atom', (request) => {
    const imgCacheDir = getImgCacheDir();
    const { pathname } = new URL(request.url);
    const filePath = path.join(imgCacheDir, decodeURIComponent(pathname));

    if (!isInside(imgCacheDir, filePath) || !fs.existsSync(filePath)) {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  setupIpcHandlers(() => mainWindow);
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
  // Ferme le port de réception réseau local et annule les transferts en cours.
  shutdownLanShare().catch(error => console.error('Fermeture du partage réseau local:', error));
});

// Quitter quand toutes les fenêtres sont fermées (sauf sur Mac)
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('Une erreur non capturée est survenue dans le processus principal:', error);
});
