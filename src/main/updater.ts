import { app, dialog, net, shell, type BrowserWindow, type MessageBoxOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import type { AppUpdateInfo, UpdateCheckResult, UpdateDownloadProgress } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Mises à jour via GitHub Releases (config `publish` d'electron-builder).
 *
 * - Installeur NSIS (Windows) et zip (macOS) : electron-updater télécharge et
 *   installe, mais seulement si l'utilisateur accepte (pas de téléchargement
 *   automatique).
 * - Version portable (et build de dev) : electron-updater ne sait pas
 *   remplacer un .exe portable ; on interroge l'API GitHub et on se contente
 *   d'un pop-up qui renvoie vers la page de téléchargement.
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
    selfUpdate: app.isPackaged && !portable && (process.platform === 'win32' || process.platform === 'darwin')
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

/** Dernière version publiée, lue sur l'API GitHub (portable, dev). */
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

async function downloadAndOfferRestart(getWindow: () => BrowserWindow | null, version: string): Promise<void> {
  const onProgress = (progress: { percent: number }) => reportProgress(getWindow, { version, percent: progress.percent });
  autoUpdater.on('download-progress', onProgress);
  reportProgress(getWindow, { version, percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } finally {
    autoUpdater.removeListener('download-progress', onProgress);
    reportProgress(getWindow, null);
  }
  const restart = await showBox(getWindow, {
    type: 'info',
    title: tm('Mise à jour prête'),
    message: tm('La version {version} est téléchargée.', { version }),
    detail: tm('Elle sera installée au redémarrage de DLSGM.'),
    buttons: [tm('Redémarrer maintenant'), tm('Au prochain lancement')],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  // Installation silencieuse (/S) puis relance : sans ces arguments,
  // electron-updater ouvre l'assistant de l'installeur NSIS, comme une
  // première installation. « Au prochain lancement » installe aussi en
  // silence, à la fermeture (autoInstallOnAppQuit).
  if (restart === 0) autoUpdater.quitAndInstall(true, true);
}

export interface CheckOptions {
  /** Vérification demandée depuis les Paramètres : on signale aussi « à jour » et les erreurs. */
  manual: boolean;
  getWindow: () => BrowserWindow | null;
  /** Bouton « Ne plus vérifier au démarrage » (vérification au démarrage uniquement). */
  disableStartupCheck?: () => Promise<void>;
}

export async function checkForUpdates({ manual, getWindow, disableStartupCheck }: CheckOptions): Promise<UpdateCheckResult> {
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
        detail: tm('Version utilisée : {version}. La version portable ne se met pas à jour seule : téléchargez la nouvelle version sur GitHub.', { version: current }),
        buttons: [tm('Ouvrir la page de téléchargement'), tm('Fermer')],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      if (open === 0) await shell.openExternal(RELEASES_PAGE);
      return { status: 'available', version: latest };
    }

    const buttons = [tm('Mettre à jour'), tm('Plus tard')];
    if (!manual && disableStartupCheck) buttons.push(tm('Ne plus vérifier au démarrage'));
    const choice = await showBox(getWindow, {
      type: 'question',
      title: tm('Mise à jour disponible'),
      message: tm('La version {version} de DLSGM est disponible.', { version: latest }),
      detail: tm("Version installée : {version}. Voulez-vous la télécharger et l'installer ?", { version: current })
        + (buttons.length > 2 ? '\n\n' + tm('La vérification au démarrage peut être réactivée dans Paramètres › Mises à jour.') : ''),
      buttons,
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (choice === 0) {
      // Erreur affichée même au démarrage : l'utilisateur vient de demander l'installation.
      await downloadAndOfferRestart(getWindow, latest).catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Téléchargement de la mise à jour impossible :', message);
        await showBox(getWindow, {
          type: 'error',
          title: tm('Mises à jour'),
          message: tm('Le téléchargement de la mise à jour a échoué.'),
          detail: message,
          buttons: ['OK'],
          noLink: true
        });
      });
    } else if (choice === 2) await disableStartupCheck?.();
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
