import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listTree, makeTempDir, makeZip, removeTempDir, writeTree } from '../helpers';

const electron = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({
  app: { getPath: (name: string) => path.join(electron.root, 'system', name) }
}));

import { applyUserPatch, detectEngine, fetchWithRetry, findSaveLocations, readPatches, uninstallLastPatch } from '../../src/main/game-tools';

let game: string;

beforeEach(() => {
  electron.root = makeTempDir();
  game = path.join(electron.root, 'RJ01000001');
  fs.mkdirSync(game);
  // app.getPath('temp') : extraction des patchs .zip.
  fs.mkdirSync(path.join(electron.root, 'system', 'temp'), { recursive: true });
});

afterEach(() => removeTempDir(electron.root));

describe('detectEngine', () => {
  it.each([
    ['rpgmaker-mz', { 'www/js/rmmz_core.js': '' }],
    ['rpgmaker-mv', { 'js/rpg_core.js': '' }],
    ['rpgmaker-vxace', { 'Game.rgss3a': '' }],
    ['wolf', { 'Data.wolf': '' }],
    ['renpy', { 'renpy/x': '', 'game/script.rpy': '' }],
    ['kirikiri', { 'data.xp3': '' }],
    ['unity', { 'UnityPlayer.dll': '', 'Game_Data/globalgamemanagers': '' }],
    ['unknown', { 'readme.txt': '' }]
  ])('%s', (engine, files) => {
    writeTree(game, files);
    expect(detectEngine(game, null).engine).toBe(engine);
  });

  it('distingue Unity IL2CPP de Mono', () => {
    writeTree(game, { 'UnityPlayer.dll': '', 'GameAssembly.dll': '' });
    expect(detectEngine(game, null).unityBackend).toBe('il2cpp');
  });
});

describe('findSaveLocations', () => {
  it('RPG Maker VX Ace : seuls les SaveNN de la racine sont des sauvegardes', () => {
    writeTree(game, { 'Game.rgss3a': '' });
    const [location] = findSaveLocations(game, null, detectEngine(game, null));
    expect(location.path).toBe(game);
    expect(location.fileFilter?.test('Save01.rvdata2')).toBe(true);
    expect(location.fileFilter?.test('Game.exe')).toBe(false);
  });

  it('RPG Maker MZ : dossier www/save, signalé absent tant que le jeu ne l’a pas créé', () => {
    writeTree(game, { 'www/js/rmmz_core.js': '' });
    const [location] = findSaveLocations(game, null, detectEngine(game, null));
    expect(location.path).toBe(path.join(game, 'www', 'save'));
    expect(location.exists).toBe(false);
  });
});

describe('patchs réversibles', () => {
  it('désinstalle en pile et restaure exactement les fichiers écrasés deux fois', async () => {
    writeTree(game, { 'data/a.txt': 'original', 'Game.exe': 'exe' });
    const patch1 = path.join(electron.root, 'patch1');
    const patch2 = path.join(electron.root, 'patch2');
    writeTree(patch1, { 'data/a.txt': 'patch1', 'data/new.txt': 'nouveau' });
    writeTree(patch2, { 'data/a.txt': 'patch2' });

    await applyUserPatch(game, game, patch1);
    await applyUserPatch(game, game, patch2);
    expect(fs.readFileSync(path.join(game, 'data', 'a.txt'), 'utf8')).toBe('patch2');
    expect(readPatches(game).map(p => p.name)).toEqual(['patch1', 'patch2']);

    uninstallLastPatch(game);
    expect(fs.readFileSync(path.join(game, 'data', 'a.txt'), 'utf8')).toBe('patch1');
    uninstallLastPatch(game);
    expect(fs.readFileSync(path.join(game, 'data', 'a.txt'), 'utf8')).toBe('original');
    expect(listTree(game).filter(f => !f.startsWith('.dlsgm/'))).toEqual(['Game.exe', 'data/a.txt']);
    expect(readPatches(game)).toEqual([]);
  });

  it('descend dans le dossier enveloppe d’un patch pour l’aligner sur le jeu', async () => {
    writeTree(game, { 'data/a.txt': 'original' });
    const patch = path.join(electron.root, 'patch');
    writeTree(patch, { 'MonPatch/data/a.txt': 'patché' });
    await applyUserPatch(game, game, patch);
    expect(fs.readFileSync(path.join(game, 'data', 'a.txt'), 'utf8')).toBe('patché');
    expect(fs.existsSync(path.join(game, 'MonPatch'))).toBe(false);
  });

  it('applique un patch .zip', async () => {
    writeTree(game, { 'data/a.txt': 'original' });
    const zip = path.join(electron.root, 'patch.zip');
    fs.writeFileSync(zip, makeZip([{ name: 'data/a.txt', data: 'patché' }, { name: 'data/b.txt', data: 'nouveau' }]));
    await applyUserPatch(game, game, zip);
    expect(fs.readFileSync(path.join(game, 'data', 'a.txt'), 'utf8')).toBe('patché');
    uninstallLastPatch(game);
    expect(fs.readFileSync(path.join(game, 'data', 'a.txt'), 'utf8')).toBe('original');
    expect(fs.existsSync(path.join(game, 'data', 'b.txt'))).toBe(false);
  });

  it('un lien symbolique dans un patch .zip ne fait rien écrire hors du jeu', async () => {
    writeTree(game, { 'Game.exe': 'exe' });
    const outside = path.join(electron.root, 'outside');
    fs.mkdirSync(outside);
    const zip = path.join(electron.root, 'patch.zip');
    // Faille d'extract-zip ≤ 2.0.1 : « lien » vers l'extérieur, puis un fichier écrit à travers lui.
    fs.writeFileSync(zip, makeZip([
      { name: 'link', data: outside, unixMode: 0o120777 },
      { name: 'link/evil.txt', data: 'pwned' }
    ]));
    // Le « lien » devient un fichier ordinaire : le fichier suivant ne peut pas passer à travers (échec du patch).
    await expect(applyUserPatch(game, game, zip)).rejects.toThrow();
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(listTree(game)).toEqual(['Game.exe']);
  });
});

describe('manifeste de patchs venu d’ailleurs (LAN, archive)', () => {
  const library = () => path.dirname(game);
  const writeManifest = (patches: unknown[]) => writeTree(game, { '.dlsgm/patches.json': JSON.stringify({ patches }) });
  const patch = (fields: Record<string, unknown>) => ({ id: '1700000000000', name: 'Uncensor', kind: 'custom', installedAt: '', added: [], overwritten: [], ...fields });

  it('ignore un patch qui supprimerait un fichier hors du jeu', () => {
    writeTree(library(), { 'precious.txt': 'data' });
    writeManifest([patch({ added: ['../precious.txt'] })]);
    expect(readPatches(game)).toEqual([]);
    expect(uninstallLastPatch(game)).toBeNull();
    expect(fs.existsSync(path.join(library(), 'precious.txt'))).toBe(true);
  });

  it('ignore un patch qui écrirait hors du jeu depuis une « sauvegarde » du jeu', () => {
    writeTree(game, { 'payload/evil.bat': 'calc' });
    // id → dossier de sauvegarde = <jeu>/payload/x, donc la sauvegarde lue est payload/evil.bat ; cible = à côté du jeu.
    writeManifest([patch({ id: '../../../RJ01000001/payload/x', overwritten: ['../evil.bat'] })]);
    expect(uninstallLastPatch(game)).toBeNull();
    expect(fs.existsSync(path.join(electron.root, 'evil.bat'))).toBe(false);
  });

  it('ignore un identifiant qui viderait un dossier hors du jeu', () => {
    writeTree(library(), { 'RJ02000000/Game.exe': 'autre jeu' });
    writeManifest([patch({ id: '../../..' })]);
    expect(uninstallLastPatch(game)).toBeNull();
    expect(fs.existsSync(path.join(library(), 'RJ02000000', 'Game.exe'))).toBe(true);
  });

  it('ignore les chemins absolus et ceux qui visent .dlsgm, garde les patchs valides', () => {
    writeTree(game, { 'data/a.txt': 'x' });
    writeManifest([
      patch({ name: 'ok', added: ['data/a.txt'] }),
      patch({ name: 'absolu', added: [path.join(electron.root, 'x.txt')] }),
      patch({ name: 'méta', added: ['.dlsgm/patches.json'] })
    ]);
    expect(readPatches(game).map(p => p.name)).toEqual(['ok']);
  });
});

describe('fetchWithRetry', () => {
  const responder = (...steps: (number | Error)[]) => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      const step = steps.shift()!;
      if (step instanceof Error) throw step;
      return new Response('x', { status: step });
    }) as unknown as typeof fetch;
    return { calls, fetchFn };
  };

  it('réessaie un 503 passager de GitHub puis rend la réponse réussie', async () => {
    const { calls, fetchFn } = responder(503, new TypeError('fetch failed'), 200);
    const response = await fetchWithRetry('https://example.com/a.zip', { fetchFn, delaysMs: [0, 0] });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it('rend la dernière erreur serveur une fois les essais épuisés', async () => {
    const { calls, fetchFn } = responder(503, 503, 503);
    expect((await fetchWithRetry('https://example.com/a.zip', { fetchFn, delaysMs: [0, 0] })).status).toBe(503);
    expect(calls).toHaveLength(3);
  });

  it("ne réessaie ni un 404 ni un délai dépassé", async () => {
    const notFound = responder(404, 200);
    expect((await fetchWithRetry('https://example.com/a.zip', { fetchFn: notFound.fetchFn, delaysMs: [0, 0] })).status).toBe(404);
    expect(notFound.calls).toHaveLength(1);
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    const slow = responder(timeout, 200);
    await expect(fetchWithRetry('https://example.com/a.zip', { fetchFn: slow.fetchFn, delaysMs: [0, 0] })).rejects.toBe(timeout);
    expect(slow.calls).toHaveLength(1);
  });
});
