import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, dialog, net, shell, type BrowserWindow, type MessageBoxOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import type { AppUpdateInfo, UpdateCheckResult, UpdateDownloadProgress } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Mises à jour via GitHub Releases (config `publish` d'electron-builder).
 *
 * - Installeur NSIS (Windows) : une nouvelle version est téléchargée dès
 *   qu'elle est trouvée (barre de progression dans l'interface), puis
 *   l'utilisateur choisit : installer maintenant (l'app se ferme, s'installe
 *   en silence et se relance) ou au redémarrage (installation silencieuse
 *   quand il ferme DLSGM).
 * - Version portable, macOS et build de dev : pas de mise à jour automatique.
 *   macOS a le code pour (electron-updater sait appliquer un zip via
 *   Squirrel.Mac/ShipIt), mais DLSGM n'est pas signé avec un certificat Apple
 *   Developer ID payant, et ShipIt rejette alors systématiquement la mise à
 *   jour téléchargée (« Code signature ... did not pass validation », observé
 *   à chaque tentative, jamais un succès) : on ne tente donc jamais
 *   `autoUpdater.checkForUpdates()`/`quitAndInstall()` sur mac. Comme pour la
 *   version portable, on interroge juste l'API GitHub et on se contente d'un
 *   pop-up qui renvoie vers la page de téléchargement.
 */

export const RELEASES_PAGE = 'https://github.com/Matty-H/DLSGM/releases/latest';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Matty-H/DLSGM/releases/latest';

/** Variable posée par le lanceur de la cible `portable` d'electron-builder. */
export function isPortable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.PORTABLE_EXECUTABLE_FILE);
}

export function getAppUpdateInfo(): AppUpdateInfo {
  const portable = isPortable();
  return {
    version: app.getVersion(),
    portable,
    // Windows uniquement : voir la note en tête de fichier pour macOS.
    selfUpdate: app.isPackaged && !portable && process.platform === 'win32',
    packaged: app.isPackaged
  };
}

/**
 * Compare deux versions semver (`v` initial toléré). Une pré-version
 * (`1.0.1-test`) passe avant la version finale du même numéro.
 * > 0 si a est plus récente que b.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ''] = v.trim().replace(/^v/i, '').split('+')[0].split(/-(.*)/s);
    return { nums: core.split('.').map(n => parseInt(n, 10) || 0), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

let configured = false;
let checking = false;

function configure(): void {
  if (configured) return;
  configured = true;
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
}

async function showBox(getWindow: () => BrowserWindow | null, options: MessageBoxOptions): Promise<number> {
  const window = getWindow();
  const { response } = window && !window.isDestroyed()
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  return response;
}

/** Dernière version publiée, lue sur l'API GitHub (portable, macOS, dev). */
async function latestReleaseVersion(): Promise<string> {
  const response = await net.fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(tm('GitHub a répondu {status}.', { status: response.status }));
  const release = await response.json() as { tag_name?: unknown };
  if (typeof release.tag_name !== 'string') throw new Error(tm('Réponse de GitHub inattendue.'));
  return release.tag_name.replace(/^v/i, '');
}

/** Avancement envoyé à la fenêtre principale (barre de l'interface) et à la barre des tâches. */
function reportProgress(getWindow: () => BrowserWindow | null, progress: UpdateDownloadProgress | null): void {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.setProgressBar(progress ? progress.percent / 100 : -1);
  window.webContents.send('update-download-progress', progress);
}

// --- Installation à la fermeture : reprise si DLSGM est relancé pendant ---------
//
// L'installation silencieuse lancée à la fermeture dure plusieurs secondes,
// sans rien afficher. Relancé entre-temps, DLSGM serait encore l'ancienne
// version et reproposerait la mise à jour : on note la version en attente,
// et un démarrage qui trouve l'installeur encore actif attend sa fin, puis
// redémarre sur la nouvelle version.

const PENDING_FILE = 'pending-update.json';
const INSTALL_WAIT_MS = 5 * 60_000;

function pendingFile(): string {
  return path.join(app.getPath('userData'), PENDING_FILE);
}

function writePendingInstall(version: string): void {
  try {
    fs.writeFileSync(pendingFile(), JSON.stringify({ version }));
  } catch (error) {
    log.warn('Mise à jour en attente non notée :', error);
  }
}

function readPendingInstall(): string | null {
  try {
    const { version } = JSON.parse(fs.readFileSync(pendingFile(), 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

function clearPendingInstall(): void {
  fs.rmSync(pendingFile(), { force: true });
}

/** Installeur de mise à jour en cours d'exécution (lancé depuis le cache d'electron-updater). */
function updateInstallerRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const script = "@(Get-Process | Where-Object { $_.Path -like '*\\dlsgm-updater\\pending\\*' }).Count";
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15_000 }, (error, stdout) =>
      resolve(!error && Number(String(stdout).trim()) > 0)
    );
  });
}

export interface PendingInstallDeps {
  installerRunning?: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  /** Fin de l'attente : relance sur la nouvelle version (app.relaunch + exit par défaut). */
  restart?: () => void;
}

/**
 * Au démarrage, avant d'ouvrir la fenêtre : si une mise à jour s'installe
 * encore (fermeture juste avant), affiche « Installation de la mise à jour… »,
 * attend la fin de l'installeur puis relance DLSGM. Renvoie true dans ce cas
 * (le démarrage normal ne doit pas continuer).
 */
export async function finishPendingInstall(deps: PendingInstallDeps = {}): Promise<boolean> {
  const version = readPendingInstall();
  if (!version) return false;
  if (compareVersions(version, app.getVersion()) <= 0) {
    clearPendingInstall(); // déjà installée
    return false;
  }
  const installerRunning = deps.installerRunning ?? updateInstallerRunning;
  if (!(await installerRunning())) {
    // Rien en cours (installation pas lancée ou échouée) : la vérification habituelle la reproposera.
    clearPendingInstall();
    return false;
  }
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const notice = new AbortController();
  void dialog
    .showMessageBox({
      type: 'info',
      title: 'DLSGM',
      message: tm('Installation de la mise à jour {version}…', { version }),
      detail: tm('DLSGM redémarrera tout seul une fois la mise à jour installée.'),
      buttons: ['OK'],
      noLink: true,
      signal: notice.signal
    })
    .catch(() => undefined);
  const deadline = Date.now() + INSTALL_WAIT_MS;
  while (Date.now() < deadline && (await installerRunning())) await sleep(1000);
  notice.abort();
  clearPendingInstall();
  (deps.restart ?? (() => {
    app.relaunch();
    app.exit(0);
  }))();
  return true;
}

/**
 * Télécharge la mise à jour (barre de progression dans l'interface), puis
 * demande : maintenant, ou au redémarrage (à la fermeture de DLSGM).
 */
async function downloadAndOfferInstall(getWindow: () => BrowserWindow | null, version: string): Promise<void> {
  const onProgress = (progress: { percent: number }) => reportProgress(getWindow, { version, percent: progress.percent });
  autoUpdater.on('download-progress', onProgress);
  reportProgress(getWindow, { version, percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } finally {
    autoUpdater.removeListener('download-progress', onProgress);
    reportProgress(getWindow, null);
  }
  // Notée dans les deux cas : un DLSGM relancé pendant l'installation attendra sa fin.
  writePendingInstall(version);
  const choice = await showBox(getWindow, {
    type: 'info',
    title: tm('Mise à jour prête'),
    message: tm('La version {version} est téléchargée.', { version }),
    detail: tm("Maintenant : DLSGM se ferme, installe la mise à jour et redémarre. Au redémarrage : elle s'installe quand vous fermez DLSGM."),
    buttons: [tm('Mettre à jour maintenant'), tm('Au redémarrage')],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  // Installation silencieuse (/S) puis relance : sans ces arguments,
  // electron-updater ouvre l'assistant de l'installeur NSIS, comme une
  // première installation. « Au redémarrage » installe aussi en silence, à
  // la fermeture (autoInstallOnAppQuit). Toujours Windows ici : voir
  // `getAppUpdateInfo` pour pourquoi macOS ne passe jamais par ce chemin.
  if (choice === 0) autoUpdater.quitAndInstall(true, true);
}

export interface CheckOptions {
  /** Vérification demandée depuis les Paramètres : on signale aussi « à jour » et les erreurs. */
  manual: boolean;
  getWindow: () => BrowserWindow | null;
}

export async function checkForUpdates({ manual, getWindow }: CheckOptions): Promise<UpdateCheckResult> {
  if (checking) return { status: 'busy' };
  checking = true;
  const current = app.getVersion();
  const { selfUpdate } = getAppUpdateInfo();
  try {
    let latest: string;
    if (selfUpdate) {
      configure();
      const result = await autoUpdater.checkForUpdates();
      latest = result?.isUpdateAvailable ? result.updateInfo.version : current;
    } else {
      latest = await latestReleaseVersion();
    }

    if (compareVersions(latest, current) <= 0) {
      if (manual) {
        await showBox(getWindow, {
          type: 'info',
          title: tm('Mises à jour'),
          message: tm('DLSGM est à jour.'),
          detail: tm('Version installée : {version}.', { version: current }),
          buttons: ['OK'],
          noLink: true
        });
      }
      return { status: 'up-to-date', version: current };
    }

    if (!selfUpdate) {
      const open = await showBox(getWindow, {
        type: 'info',
        title: tm('Mise à jour disponible'),
        message: tm('La version {version} de DLSGM est disponible.', { version: latest }),
        detail: tm('Version utilisée : {version}. Mise à jour automatique indisponible : téléchargez la nouvelle version sur GitHub.', { version: current }),
        buttons: [tm('Ouvrir la page de téléchargement'), tm('Fermer')],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      if (open === 0) await shell.openExternal(RELEASES_PAGE);
      return { status: 'available', version: latest };
    }

    await downloadAndOfferInstall(getWindow, latest).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Téléchargement de la mise à jour impossible :', message);
      // Au démarrage, un échec réseau reste dans le journal : rien n'a été demandé.
      if (!manual) return;
      await showBox(getWindow, {
        type: 'error',
        title: tm('Mises à jour'),
        message: tm('Le téléchargement de la mise à jour a échoué.'),
        detail: message,
        buttons: ['OK'],
        noLink: true
      });
    });
    return { status: 'available', version: latest };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Vérification des mises à jour impossible :', message);
    if (manual) {
      await showBox(getWindow, {
        type: 'error',
        title: tm('Mises à jour'),
        message: tm('Impossible de vérifier les mises à jour.'),
        detail: message,
        buttons: ['OK'],
        noLink: true
      });
    }
    return { status: 'error', message };
  } finally {
    checking = false;
  }
}
