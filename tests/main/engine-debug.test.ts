import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listTree, makeTempDir, removeTempDir, writeTree } from '../helpers';

const electron = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({
  app: { getPath: (name: string) => path.join(electron.root, 'system', name) }
}));

import { rpgMakerDebugLaunch } from '../../src/main/engine-debug';
import { RENPY_DEBUG_FILE, applyUserPatch, findDebugPatch, installRenpyDebug, readPatches, uninstallPatch } from '../../src/main/game-tools';

let root: string;
let game: string;

beforeEach(() => {
  electron.root = makeTempDir();
  root = electron.root;
  game = path.join(root, 'RJ01000001');
  fs.mkdirSync(path.join(root, 'system', 'temp'), { recursive: true });
});

afterEach(() => removeTempDir(root));

describe('rpgMakerDebugLaunch', () => {
  it('passes test first to the game exe of a plain MV or MZ game', () => {
    writeTree(game, { 'Game.exe': 'x', 'nw.dll': 'x', 'www/js/rpg_core.js': '' });
    expect(rpgMakerDebugLaunch(path.join(game, 'Game.exe'))).toEqual({ executablePath: path.join(game, 'Game.exe'), args: ['test'] });
    const mz = path.join(root, 'RJ01000002');
    writeTree(mz, { 'Game.exe': 'x', 'nw.dll': 'x', 'js/rmmz_core.js': '' });
    expect(rpgMakerDebugLaunch(path.join(mz, 'Game.exe'))?.args).toEqual(['test']);
  });

  it('launches NW.js directly when the chosen exe is a launcher', () => {
    writeTree(game, { 'Launcher.exe': 'x', 'data/nw.dll': 'x', 'data/Game.exe': 'xxxx', 'data/notification_helper.exe': 'xxxxxxxx', 'data/www/js/rpg_core.js': '' });
    expect(rpgMakerDebugLaunch(path.join(game, 'Launcher.exe'))?.executablePath).toBe(path.join(game, 'data', 'Game.exe'));
  });

  it('ignores other engines', () => {
    writeTree(game, { 'Game.exe': 'x', 'Game_Data/app.info': '' });
    expect(rpgMakerDebugLaunch(path.join(game, 'Game.exe'))).toBeNull();
  });
});

describe('Ren\'Py debug patch', () => {
  beforeEach(() => writeTree(game, { 'Game.exe': 'x', 'game/script.rpy': 'label start:' }));

  it('adds the script as a debug patch and removes it with its compiled file', async () => {
    const patch = await installRenpyDebug(game, game);
    expect(patch.kind).toBe('debug');
    expect(fs.readFileSync(path.join(game, RENPY_DEBUG_FILE), 'utf8')).toContain('config.console = True');
    // Compilé par Ren'Py au lancement.
    fs.writeFileSync(path.join(game, `${RENPY_DEBUG_FILE}c`), 'compiled');
    await expect(installRenpyDebug(game, game)).rejects.toThrow();

    uninstallPatch(game, findDebugPatch(game)!.id);
    expect(findDebugPatch(game)).toBeNull();
    expect(listTree(game)).toEqual(['.dlsgm/patches.json', 'Game.exe', 'game/script.rpy']);
  });

  it('uninstalls out of order only when no later patch touches the same files', async () => {
    const debug = await installRenpyDebug(game, game);
    const other = path.join(root, 'patch');
    writeTree(other, { 'game/tl.rpy': 'x' });
    await applyUserPatch(game, game, other);
    uninstallPatch(game, debug.id);
    expect(readPatches(game).map(p => p.name)).toEqual(['patch']);

    const debug2 = await installRenpyDebug(game, game);
    const overlapping = path.join(root, 'overlap');
    writeTree(overlapping, { [RENPY_DEBUG_FILE]: 'replaced' });
    await applyUserPatch(game, game, overlapping);
    expect(() => uninstallPatch(game, debug2.id)).toThrow();
  });
});
