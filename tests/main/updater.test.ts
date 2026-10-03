import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

const electron = vi.hoisted(() => ({
  app: { isPackaged: true, getVersion: () => '1.1.0', userData: '', getPath: (_name: string) => electron.app.userData },
  dialog: { showMessageBox: vi.fn() },
  net: { fetch: vi.fn() },
  shell: { openExternal: vi.fn() }
}));
const updater = vi.hoisted(() => ({
  autoUpdater: {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
  } as Record<string, unknown>
}));

vi.mock('electron', () => electron);
vi.mock('electron-updater', () => updater);
vi.mock('electron-log', () => ({ default: { transports: { file: {} }, error: vi.fn(), warn: vi.fn() } }));

import { checkForUpdates, compareVersions, finishPendingInstall, isPortable, RELEASES_PAGE } from '../../src/main/updater';

const au = updater.autoUpdater as unknown as Record<'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall', ReturnType<typeof vi.fn>>;
const getWindow = () => null;
const answer = (...responses: number[]) => {
  for (const response of responses) electron.dialog.showMessageBox.mockResolvedValueOnce({ response });
};
const lastButtons = () => (electron.dialog.showMessageBox.mock.calls.at(-1)?.[0] as { buttons: string[] }).buttons;

const pendingFile = () => path.join(electron.app.userData, 'pending-update.json');

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PORTABLE_EXECUTABLE_FILE;
  electron.app.isPackaged = true;
  electron.app.userData = makeTempDir();
  electron.dialog.showMessageBox.mockResolvedValue({ response: 0 });
});

afterEach(() => removeTempDir(electron.app.userData));

describe('compareVersions', () => {
  it('compare les numéros, pas le texte', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('v1.1.0', '1.1.0')).toBe(0);
    expect(compareVersions('1.0.2', '1.1.0')).toBe(-1);
  });

  it('met une pré-version avant la version finale', () => {
    expect(compareVersions('1.0.1-test', '1.0.1')).toBe(-1);
    expect(compareVersions('1.1.0', '1.0.1-test')).toBe(1);
  });
});

describe('isPortable', () => {
  it('reconnaît le lanceur portable', () => {
    expect(isPortable({ PORTABLE_EXECUTABLE_FILE: 'C:\\DLSGM.exe' })).toBe(true);
    expect(isPortable({})).toBe(false);
  });
});

describe('checkForUpdates — version portable', () => {
  beforeEach(() => {
    process.env.PORTABLE_EXECUTABLE_FILE = 'C:\\DLSGM-Portable.exe';
  });

  it("signale la nouvelle version sans passer par electron-updater et ouvre la page sur demande", async () => {
    electron.net.fetch.mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v1.2.0' })));
    answer(0);
    expect(await checkForUpdates({ manual: false, getWindow }))
      .toEqual({ status: 'available', version: '1.2.0' });
    expect(au.checkForUpdates).not.toHaveBeenCalled();
    expect(lastButtons()).toEqual(['Ouvrir la page de téléchargement', 'Fermer']);
    expect(electron.shell.openExternal).toHaveBeenCalledWith(RELEASES_PAGE);
  });

  it('reste silencieux au démarrage quand tout est à jour', async () => {
    electron.net.fetch.mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v1.1.0' })));
    expect(await checkForUpdates({ manual: false, getWindow })).toEqual({ status: 'up-to-date', version: '1.1.0' });
    expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
  });
});

describe('checkForUpdates — version installée', () => {
  beforeEach(() => {
    au.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '1.2.0' } });
  });

  it('télécharge sans demander, puis propose maintenant ou au redémarrage', async () => {
    au.downloadUpdate.mockResolvedValue([]);
    answer(1);
    await checkForUpdates({ manual: false, getWindow });
    expect(au.downloadUpdate).toHaveBeenCalledOnce();
    expect(electron.dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(lastButtons()).toEqual(['Mettre à jour maintenant', 'Au redémarrage']);
    // Au redémarrage : installée en silence à la fermeture (autoInstallOnAppQuit), pas tout de suite.
    expect(au.quitAndInstall).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(pendingFile(), 'utf8'))).toEqual({ version: '1.2.0' });
  });

  it('« Mettre à jour maintenant » installe en silence puis relance', async () => {
    au.downloadUpdate.mockResolvedValue([]);
    answer(0);
    await checkForUpdates({ manual: true, getWindow });
    // En silence, puis relance : sinon l'assistant de l'installeur s'ouvre.
    expect(au.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("garde un échec de téléchargement pour le journal au démarrage, l'affiche en manuel", async () => {
    au.downloadUpdate.mockRejectedValue(new Error('net::ERR_CONNECTION_RESET'));
    await checkForUpdates({ manual: false, getWindow });
    expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
    await checkForUpdates({ manual: true, getWindow });
    expect(electron.dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(fs.existsSync(pendingFile())).toBe(false);
  });

  it("envoie l'avancement du téléchargement à la fenêtre, puis null à la fin", async () => {
    const send = vi.fn();
    const window = { isDestroyed: () => false, setProgressBar: vi.fn(), webContents: { send } };
    au.downloadUpdate.mockImplementation(async () => {
      const onProgress = (updater.autoUpdater.on as ReturnType<typeof vi.fn>).mock.calls.find(([event]) => event === 'download-progress')?.[1];
      onProgress?.({ percent: 42 });
      return [];
    });
    answer(1);
    await checkForUpdates({ manual: true, getWindow: () => window as never });
    expect(send.mock.calls.map(([, progress]) => progress)).toEqual([
      { version: '1.2.0', percent: 0 },
      { version: '1.2.0', percent: 42 },
      null
    ]);
    expect(au.quitAndInstall).not.toHaveBeenCalled();
  });

  it('dit « à jour » seulement en vérification manuelle', async () => {
    au.checkForUpdates.mockResolvedValue({ isUpdateAvailable: false, updateInfo: { version: '1.1.0' } });
    await checkForUpdates({ manual: false, getWindow });
    expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
    answer(0);
    await checkForUpdates({ manual: true, getWindow });
    expect(electron.dialog.showMessageBox).toHaveBeenCalledOnce();
  });

  it("n'affiche pas d'erreur au démarrage, mais en manuel", async () => {
    au.checkForUpdates.mockRejectedValue(new Error('net::ERR_INTERNET_DISCONNECTED'));
    expect(await checkForUpdates({ manual: false, getWindow })).toEqual({ status: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' });
    expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
    answer(0);
    await checkForUpdates({ manual: true, getWindow });
    expect(electron.dialog.showMessageBox).toHaveBeenCalledOnce();
  });
});

describe('finishPendingInstall', () => {
  const write = (version: string) => fs.writeFileSync(pendingFile(), JSON.stringify({ version }));

  it('ne fait rien sans mise à jour en attente', async () => {
    const installerRunning = vi.fn();
    expect(await finishPendingInstall({ installerRunning })).toBe(false);
    expect(installerRunning).not.toHaveBeenCalled();
  });

  it("oublie une mise à jour déjà installée", async () => {
    write('1.1.0');
    expect(await finishPendingInstall({ installerRunning: vi.fn() })).toBe(false);
    expect(fs.existsSync(pendingFile())).toBe(false);
  });

  it("démarre normalement si aucun installeur ne tourne", async () => {
    write('1.2.0');
    const restart = vi.fn();
    expect(await finishPendingInstall({ installerRunning: async () => false, restart })).toBe(false);
    expect(restart).not.toHaveBeenCalled();
    expect(fs.existsSync(pendingFile())).toBe(false);
  });

  it("attend la fin de l'installeur puis relance sur la nouvelle version", async () => {
    write('1.2.0');
    const states = [true, true, false];
    const restart = vi.fn();
    electron.dialog.showMessageBox.mockReturnValue(new Promise(() => undefined));
    expect(
      await finishPendingInstall({ installerRunning: async () => states.shift() ?? false, sleep: async () => undefined, restart })
    ).toBe(true);
    expect(restart).toHaveBeenCalledOnce();
    expect((electron.dialog.showMessageBox.mock.calls[0][0] as { message: string }).message).toBe('Installation de la mise à jour 1.2.0…');
    expect(fs.existsSync(pendingFile())).toBe(false);
  });
});
