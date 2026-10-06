import { app, BrowserWindow, globalShortcut, Menu, net, protocol, screen, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { setMainLanguage } from './i18n';
import { PROFILE_MIGRATIONS, runMigrations } from './migrations';
import { holdStores } from './store';
import { finishPendingInstall } from './updater';
import { setupIpcHandlers, setupLockScreenHandlers, setLockSession, seedDecoyProfile, getImgCacheDir, getSettings, isInside, shutdownLanShare, shutdownVpn, isVpnActive, shutdownInGameTools, togglePanic, captureFilePath, runStartupUpdateCheck } from './ipc-handlers';
import { applyDlsiteProxy } from './dlsite-net';
import { hideInsteadOfClose, setTrayEnabled, setTrayIcon } from './tray';
import { initTheme, onThemeIcon } from './theme';
import { isAppUrl } from './ipc-guard';
import { DECOY_PROFILE_DIR, readLockConfig, type LockConfig } from './app-lock';

let mainWindow: BrowserWindow | null = null;
// Écran de verrouillage (app-lock.ts), tant que l'app n'est pas déverrouillée.
let lockWindow: BrowserWindow | null = null;

// Une seule instance : sans ça, deux process pourraient ouvrir les mêmes
// fichiers NeDB en même temps (store.ts : jamais deux Datastore sur un seul
// fichier — écriture atomique par rename, qui échoue en ENOENT si l'autre
// process réécrit le fichier entre-temps). `app.quit()` avant que l'app soit
// prête ne stoppe pas l'exécution du script : holdStores() et le callback de
// whenReady() plus bas restent gardés par `gotLock` pour ne pas toucher aux
// stores dans le process perdant.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on('second-instance', () => {
  // Une deuxième ouverture (double-clic, ou le relancement de secours après
  // mise à jour sur Mac — voir updater.ts) : on ramène l'instance existante
  // au lieu d'en ouvrir une autre.
  if (lockWindow?.isVisible()) {
    lockWindow.focus();
    return;
  }
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
});

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
const RENDERER_INDEX = path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'dist', 'index.html');
const DEV_SERVER_URL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;

function loadRenderer(window: BrowserWindow, hash?: string): void {
  if (DEV_SERVER_URL) {
    window.loadURL(hash ? `${DEV_SERVER_URL}#${hash}` : DEV_SERVER_URL);
  } else {
    window.loadFile(RENDERER_INDEX, hash ? { hash } : undefined);
  }
}

// Toute page web créée par DLSGM (fenêtre principale, overlay, HUD…) : pas
// de nouvelle fenêtre (window.open, clic molette ou Maj+clic sur un lien
// ouvriraient sinon une fenêtre Electron sur un site externe) — un lien web
// part dans le navigateur — et pas de navigation hors de l'interface.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(error => console.error('Ouverture du lien impossible :', error));
    return { action: 'deny' };
  });
  contents.on('will-navigate', event => event.preventDefault());
});

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

/**
 * Écran de verrouillage : résout avec le profil à ouvrir, ou null si la
 * fenêtre est fermée sans déverrouiller. Déverrouillée, la fenêtre est
 * seulement cachée (détruite une fois la fenêtre principale créée) : la
 * fermer avant laisserait l'app sans fenêtre, donc la quitterait.
 */
function showLockScreen(config: LockConfig): Promise<'real' | 'decoy' | null> {
  return new Promise(resolve => {
    const window = new BrowserWindow({
      width: 420,
      height: 620,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      title: 'DLSGM',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: PRELOAD_PATH },
      backgroundColor: '#0e141b'
    });
    lockWindow = window;
    setupLockScreenHandlers(url => isAppUrl(url, RENDERER_INDEX, DEV_SERVER_URL), config, target => {
      window.hide();
      resolve(target);
    });
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => {
      if (lockWindow === window) lockWindow = null;
      resolve(null);
    });
    loadRenderer(window, 'lock');
  });
}

// Les stores n'ouvrent leurs fichiers qu'après les migrations et le
// déverrouillage (voir plus bas) : c'est là qu'on sait quel profil ouvrir.
const releaseStores = gotLock ? holdStores() : () => undefined;

// Enregistrement du protocole atom pour charger les images locales
protocol.registerSchemesAsPrivileged([
  { scheme: 'atom', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Initialisation de l'application
app.whenReady().then(async () => {
  // Deuxième instance déjà renvoyée vers la première (second-instance) et en
  // cours de fermeture : ne rien initialiser (migrations, fenêtre, stores).
  if (!gotLock) return;
  // Données laissées par une ancienne version converties au format actuel,
  // avant toute lecture (src/main/migrations).
  const realUserData = app.getPath('userData');
  const documents = app.getPath('documents');
  const log = (message: string, error?: unknown) => (error ? console.error(message, error) : console.log(message));
  await runMigrations({ userData: realUserData, documents, log });
  // Pas de barre de menu "File, Edit, View, Window, Help" sous Windows/Linux :
  // l'app n'en a pas l'usage (copier/coller et F11 fonctionnent sans). Sur
  // macOS le menu reste : Cmd+C/V/Q en dépendent, et il n'apparaît pas dans
  // la fenêtre de toute façon.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  // Verrouillage (app-lock.ts) : code demandé avant d'ouvrir le moindre
  // store. Le leurre bascule tout le dossier de données vers le profil
  // leurre : chaque store, cache d'images, sauvegarde… y vit à part.
  const lock = readLockConfig(realUserData);
  let decoyIsNew = false;
  if (lock) {
    setMainLanguage(lock.uiLanguage);
    // Mise à jour en cours d'installation : inutile de demander le code avant de redémarrer.
    if (app.isPackaged && (await finishPendingInstall().catch(() => false))) return;
    const target = await showLockScreen(lock);
    if (!target) {
      app.quit();
      return;
    }
    if (target === 'decoy') {
      const decoyDir = path.join(realUserData, DECOY_PROFILE_DIR);
      decoyIsNew = !fs.existsSync(path.join(decoyDir, 'settings.db'));
      fs.mkdirSync(decoyDir, { recursive: true });
      app.setPath('userData', decoyDir);
      await runMigrations({ userData: decoyDir, documents, log }, PROFILE_MIGRATIONS);
    }
    setLockSession(realUserData, target);
  } else {
    setLockSession(realUserData, 'real');
  }
  releaseStores();
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
  onThemeIcon(setTrayIcon);
  setupIpcHandlers(getWindow, settings => setTrayEnabled(Boolean(settings.closeToTray), getWindow), {
    preloadPath: PRELOAD_PATH,
    loadPage: loadRenderer,
    isAppUrl: url => isAppUrl(url, RENDERER_INDEX, DEV_SERVER_URL)
  });
  if (lock && decoyIsNew) await seedDecoyProfile(lock).catch(error => console.error('Préparation du profil leurre impossible :', error));
  // Proxy DLsite avant tout fetch (le premier scan part dès le chargement).
  await getSettings()
    .then(async settings => {
      setMainLanguage(settings.uiLanguage);
      initTheme(settings.theme, settings.customThemes);
      setTrayEnabled(Boolean(settings.closeToTray), getWindow);
      await applyDlsiteProxy(settings.dlsiteProxy, settings.dlsiteProxySecret);
    })
    .catch(error => console.error('Application des paramètres au démarrage impossible:', error));
  // Mise à jour encore en cours d'installation (DLSGM relancé juste après sa
  // fermeture) : on attend la fin et on redémarre sur la nouvelle version.
  if (app.isPackaged && (await finishPendingInstall().catch(() => false))) return;
  createWindow();
  lockWindow?.destroy();
  lockWindow = null;

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
    const active = togglePanic();
    if (mainWindow) {
      mainWindow.webContents.send('panic-button-triggered', active);
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
