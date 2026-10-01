import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';
import { findLeProc, leInstalled, runWithLocaleEmulator } from '../../src/main/locale-emulator';

/** Faux spawn : enregistre la commande, se termine avec `code`. */
function fakeSpawn(code: number | null, calls: { command: string; args: string[]; cwd: string }[]) {
  return ((command: string, args: string[], options: { cwd: string }) => {
    calls.push({ command, args, cwd: options.cwd });
    const child = new EventEmitter();
    setTimeout(() => child.emit('exit', code), 5);
    return child;
  }) as never;
}

describe('Locale Emulator', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
  });
  afterEach(() => removeTempDir(dir));

  it('LEProc trouvé, et installé seulement avec LECommonLibrary.dll à côté', () => {
    expect(findLeProc(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'LEProc.exe'), '');
    expect(findLeProc(dir)).toBe(path.join(dir, 'LEProc.exe'));
    expect(leInstalled(dir)).toBe(false);
    fs.writeFileSync(path.join(dir, 'LECommonLibrary.dll'), '');
    expect(leInstalled(dir)).toBe(true);
    expect(findLeProc('')).toBeNull();
  });

  it('lance `LEProc.exe <exe>` (jamais -run), puis suit le jeu jusqu’à ce qu’il n’en reste aucun processus', async () => {
    const calls: { command: string; args: string[]; cwd: string }[] = [];
    // Le jeu apparaît au 2e relevé, tourne 3 relevés, puis disparaît.
    const snapshots = [0, 1, 1, 1, 0];
    let polls = 0;
    const result = await runWithLocaleEmulator({
      leProc: 'C:\\LE\\LEProc.exe',
      executablePath: 'D:\\Jeux\\RJ01234567\\Game.exe',
      gameDir: 'D:\\Jeux\\RJ01234567',
      spawn: fakeSpawn(0, calls),
      listProcesses: async () => new Map(snapshots[Math.min(polls++, snapshots.length - 1)] ? [[42, 'D:\\Jeux\\RJ01234567\\Game.exe']] : []),
      pollMs: 10
    });
    expect(calls).toEqual([{ command: 'C:\\LE\\LEProc.exe', args: ['D:\\Jeux\\RJ01234567\\Game.exe'], cwd: path.dirname('D:\\Jeux\\RJ01234567\\Game.exe') }]);
    expect(result).toEqual({ success: true, duration: 0 });
    expect(polls).toBe(5);
  });

  it('LEProc qui reste ouvert pendant toute la partie (cas réel) : le jeu est suivi quand même', async () => {
    const neverExits = (() => new EventEmitter()) as never;
    let polls = 0;
    const result = await runWithLocaleEmulator({
      leProc: 'LEProc.exe',
      executablePath: 'Game.exe',
      gameDir: 'x',
      spawn: neverExits,
      listProcesses: async () => new Map(polls++ < 3 ? [[7, 'x\\Game.exe']] : []),
      pollMs: 10
    });
    expect(result).toMatchObject({ success: true });
    expect(polls).toBe(4);
  });

  it('LEProc en erreur, ou jeu jamais apparu : échec explicite, jamais de lancement sans LE', async () => {
    const failed = await runWithLocaleEmulator({
      leProc: 'LEProc.exe',
      executablePath: 'Game.exe',
      gameDir: 'x',
      spawn: fakeSpawn(-532462766, []),
      listProcesses: async () => new Map()
    });
    expect(failed).toMatchObject({ success: false, error: expect.stringMatching(/LEInstaller/) });

    const never = await runWithLocaleEmulator({
      leProc: 'LEProc.exe',
      executablePath: 'Game.exe',
      gameDir: 'x',
      spawn: fakeSpawn(0, []),
      listProcesses: async () => new Map(),
      appearTimeoutMs: 50,
      pollMs: 10
    });
    expect(never).toMatchObject({ success: false, error: expect.stringMatching(/n'a pas démarré/) });
  });
});
