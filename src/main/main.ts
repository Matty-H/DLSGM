import { app, BrowserWindow, globalShortcut, Menu, net, protocol, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { setMainLanguage } from './i18n';
import { finishPendingInstall } from './updater';
import { setupIpcHandlers, getImgCacheDir, getSettings, isInside, shutdownLanShare, shutdownVpn, isVpnActive, shutdownInGameTools, togglePanic, captureFilePath, runStartupUpdateCheck } from './ipc-handlers';
import { applyDlsiteProxy } from './dlsite-net';
import { hideInsteadOfClose, setTrayEnabled } from './tray';

let mainWindow: BrowserWindow | null = null;

/**
 * Crée la fenêtre principale de l'application.
 */
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'preload.js');

/**
 * Chargement de l'interface : serveur de dev Vite si présent (npm run dev),
 * sinon le build de production (npm start / app packagée). Le renderer
 * buildé vit sous src/renderer/dist quel que soit le dossier de sortie de
 * la compilation de main (dist/main/main), donc on remonte jusqu'à la
 * racine du repo avant de redescendre vers src/renderer/dist. `hash` :
 * route du renderer (#overlay pour l'overlay en jeu).
 */
function loadRenderer(window: BrowserWindow, hash?: string): void {
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(hash ? `${process.env.VITE_DEV_SERVER_URL}#${hash}` : process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'dist', 'index.html'), hash ? { hash } : undefined);
  }
}

// Largeur à partir de laquelle la barre du haut affiche tous ses onglets en
// entier (point de rupture min-[1180px] de TopNav.tsx), avec de la marge.
const FULL_NAV_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

function createWindow(): void {
  // Fenêtre assez large pour la barre complète, sans dépasser l'écran.
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(FULL_NAV_WIDTH, workArea.width),
    height: Math.min(DEFAULT_HEIGHT, workArea.height),
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // Pour un look plus moderne sur Mac
    webPreferences: {
      nodeIntegration: false,    // Sécurité : désactivé
      contextIsolation: true,    // Sécurité : activé
      sandbox: true,             // Sécurité : activé
      preload: PRELOAD_PATH
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
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
    // Sans menu (Windows/Linux), les raccourcis de développement du menu
    // par défaut disparaissent : F12 (outils de dev) et Ctrl+R (recharger)
    // restent disponibles hors build packagée.
    if (!app.isPackaged && input.key === 'F12') {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
    if (!app.isPackaged && input.control && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      window.webContents.reload();
    }
  });
  window.on('close', (event) => hideInsteadOfClose(event, window));
  // L'overlay en jeu (fenêtre cachée) empêcherait sinon « toutes les fenêtres
  // fermées » de quitter l'application.
  window.on('closed', () => shutdownInGameTools());
  window.on('enter-full-screen', () => window.webContents.send('fullscreen-changed', true));
  window.on('leave-full-screen', () => window.webContents.send('fullscreen-changed', false));

  getSettings()
    .then(settings => {
      if (settings.startFullscreen && !window.isDestroyed()) window.setFullScreen(true);
    })
    .catch(error => console.error('Lecture des paramètres de plein écran impossible:', error));

  loadRenderer(window);

  // Ouvrir les outils de développement en mode dev (optionnel)
  // mainWindow.webContents.openDevTools();
}

// Enregistrement du protocole atom pour charger les images locales
protocol.registerSchemesAsPrivileged([
  { scheme: 'atom', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Initialisation de l'application
app.whenReady().then(async () => {
  // Pas de barre de menu "File, Edit, View, Window, Help" sous Windows/Linux :
  // l'app n'en a pas l'usage (copier/coller et F11 fonctionnent sans). Sur
  // macOS le menu reste : Cmd+C/V/Q en dépendent, et il n'apparaît pas dans
  // la fenêtre de toute façon.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  // atom://img/<ID>/<fichier> -> <userData>/img_cache/<ID>/<fichier>. Le
  // protocole ne sert que le cache d'images : tout chemin qui en sort
  // (../, chemin absolu) est refusé, au lieu d'exposer tout le disque.
  protocol.handle('atom', (request) => {
    const imgCacheDir = getImgCacheDir();
    const { host, pathname } = new URL(request.url);
    // atom://capture/<ID>/<fichier> : captures du dossier de travaux, nom et ID validés.
    if (host === 'capture') {
      const [gameId = '', file = ''] = decodeURIComponent(pathname).split('/').filter(Boolean);
      const capture = captureFilePath(gameId, file);
      return capture ? net.fetch(pathToFileURL(capture).toString()) : new Response(null, { status: 404 });
    }
    const filePath = path.join(imgCacheDir, decodeURIComponent(pathname));

    if (!isInside(imgCacheDir, filePath) || !fs.existsSync(filePath)) {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  const getWindow = () => mainWindow;
  setupIpcHandlers(getWindow, settings => setTrayEnabled(Boolean(settings.closeToTray), getWindow), {
    preloadPath: PRELOAD_PATH,
    loadPage: loadRenderer
  });
  // Proxy DLsite avant tout fetch (le premier scan part dès le chargement).
  await getSettings()
    .then(async settings => {
      setMainLanguage(settings.uiLanguage);
      setTrayEnabled(Boolean(settings.closeToTray), getWindow);
      await applyDlsiteProxy(settings.dlsiteProxy, settings.dlsiteProxySecret);
    })
    .catch(error => console.error('Application des paramètres au démarrage impossible:', error));
  // Mise à jour encore en cours d'installation (DLSGM relancé juste après sa
  // fermeture) : on attend la fin et on redémarre sur la nouvelle version.
  if (app.isPackaged && (await finishPendingInstall().catch(() => false))) return;
  createWindow();

  // Vérification des mises à jour (build packagée uniquement — en dev, il
  // n'y a pas d'installation existante à mettre à jour ; le bouton des
  // Paramètres reste utilisable). Après le chargement, pour que le pop-up
  // s'ouvre sur la fenêtre affichée.
  if (app.isPackaged) {
    setTimeout(() => {
      runStartupUpdateCheck(getWindow).catch(error => console.error('Vérification des mises à jour :', error));
    }, 5000);
  }

  // Enregistrement du raccourci Panic Button (Alt+Space)
  globalShortcut.register('Alt+Space', () => {
    togglePanic();
    if (mainWindow) {
      mainWindow.webContents.send('panic-button-triggered');
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show(); // fenêtre cachée dans la zone de notification
  });

});

// VPN PIA ouvert par DLSGM (fetchs en cours) : remis dans son état d'avant
// avant de quitter, sinon la machine resterait connectée au Japon.
let vpnRestored = false;
app.on('before-quit', (event) => {
  // Uniquement si une session est ouverte : sinon on ne retarde pas la
  // fermeture (mise à jour automatique comprise).
  if (vpnRestored || !isVpnActive()) return;
  event.preventDefault();
  vpnRestored = true;
  shutdownVpn()
    .catch(error => console.error('Restauration de PIA impossible:', error))
    .finally(() => app.quit());
});

// Libération des raccourcis à la fermeture

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  shutdownInGameTools();
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
