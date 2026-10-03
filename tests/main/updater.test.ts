import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  app: { isPackaged: true, getVersion: () => '1.1.0' },
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
vi.mock('electron-log', () => ({ default: { transports: { file: {} }, error: vi.fn() } }));

import { checkForUpdates, compareVersions, isPortable, RELEASES_PAGE } from '../../src/main/updater';

const au = updater.autoUpdater as unknown as Record<'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall', ReturnType<typeof vi.fn>>;
const getWindow = () => null;
const answer = (...responses: number[]) => {
  for (const response of responses) electron.dialog.showMessageBox.mockResolvedValueOnce({ response });
};
const lastButtons = () => (electron.dialog.showMessageBox.mock.calls.at(-1)?.[0] as { buttons: string[] }).buttons;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PORTABLE_EXECUTABLE_FILE;
  electron.app.isPackaged = true;
});

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
    expect(await checkForUpdates({ manual: false, getWindow, disableStartupCheck: vi.fn() }))
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

  it('ne télécharge rien sans accord', async () => {
    answer(1);
    await checkForUpdates({ manual: false, getWindow, disableStartupCheck: vi.fn() });
    expect(au.downloadUpdate).not.toHaveBeenCalled();
  });

  it('« Ne plus vérifier au démarrage » décoche l\'option', async () => {
    const disable = vi.fn().mockResolvedValue(undefined);
    answer(2);
    await checkForUpdates({ manual: false, getWindow, disableStartupCheck: disable });
    expect(lastButtons()).toEqual(['Mettre à jour', 'Plus tard', 'Ne plus vérifier au démarrage']);
    expect(disable).toHaveBeenCalledOnce();
    expect(au.downloadUpdate).not.toHaveBeenCalled();
  });

  it("n'offre pas de désactiver lors d'une vérification manuelle", async () => {
    answer(1);
    await checkForUpdates({ manual: true, getWindow, disableStartupCheck: vi.fn() });
    expect(lastButtons()).toEqual(['Mettre à jour', 'Plus tard']);
  });

  it('télécharge puis installe au redémarrage choisi', async () => {
    au.downloadUpdate.mockResolvedValue([]);
    answer(0, 0);
    await checkForUpdates({ manual: true, getWindow });
    expect(au.downloadUpdate).toHaveBeenCalledOnce();
    // En silence, puis relance : sinon l'assistant de l'installeur s'ouvre.
    expect(au.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("envoie l'avancement du téléchargement à la fenêtre, puis null à la fin", async () => {
    const send = vi.fn();
    const window = { isDestroyed: () => false, setProgressBar: vi.fn(), webContents: { send } };
    au.downloadUpdate.mockImplementation(async () => {
      const onProgress = (updater.autoUpdater.on as ReturnType<typeof vi.fn>).mock.calls.find(([event]) => event === 'download-progress')?.[1];
      onProgress?.({ percent: 42 });
      return [];
    });
    answer(0, 1);
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
