import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';
import type { GameMacro, MacroStep } from '../../src/shared/ipc-types';

// Faux worker PowerShell : stdin enregistré, stdout piloté par le test.
const written: string[] = [];
const fakeWorker = Object.assign(new EventEmitter(), {
  stdin: { write: (text: string) => written.push(text), end: () => undefined },
  stdout: Object.assign(new EventEmitter(), { setEncoding: () => undefined }),
  stderr: new EventEmitter(),
  kill: () => undefined
});
vi.mock('child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: () => fakeWorker
}));

import {
  MACRO_WORKER_SCRIPT,
  MacroRecorder,
  acceleratorVks,
  finishRecording,
  playCommand,
  recordCommand,
  sanitizeMacroSettings,
  sanitizeMacros
} from '../../src/main/macro-recorder';

const macro = (steps: MacroStep[], loop = false, durationMs = 1000): GameMacro => ({ id: 'm1', name: 'Macro 1', createdAt: '', loop, durationMs, steps });

describe('macros : valeurs pures', () => {
  it('codes virtuels des raccourcis proposés (ignorés à l’enregistrement)', () => {
    expect(acceleratorVks('F8')).toEqual([0x77]);
    expect(acceleratorVks('Ctrl+F8')).toEqual([0x11, 0xa2, 0xa3, 0x77]);
    expect(acceleratorVks('Ctrl+Alt+C')).toEqual([0x11, 0xa2, 0xa3, 0x12, 0xa4, 0xa5, 0x43]);
    expect(acceleratorVks('Pause')).toEqual([0x13]);
    expect(acceleratorVks('ScrollLock')).toEqual([0x91]);
  });

  it('réglages ramenés à des valeurs sûres', () => {
    expect(sanitizeMacroSettings(undefined)).toEqual({ enabled: false, recordHotkey: 'F8', playHotkey: 'F9' });
    expect(sanitizeMacroSettings({ enabled: true, recordHotkey: ' F10 ', playHotkey: '' })).toEqual({ enabled: true, recordHotkey: 'F10', playHotkey: 'F9' });
  });

  it('fin d’enregistrement : temps ramenés au premier événement, durée jusqu’à l’arrêt, rien laissé enfoncé', () => {
    const raw: MacroStep[] = [
      [500, 0, 0x41, 30, 0], // A enfoncée
      [600, 2, 0, 10, 20], // clic gauche enfoncé
      [650, 4, 0, 15, 25],
      [700, 3, 0, 15, 25],
      [900, 0, 0x26, 72, 1] // flèche haut, jamais relâchée
    ];
    const { steps, durationMs } = finishRecording(raw, 1500);
    expect(durationMs).toBe(1000);
    expect(steps).toEqual([
      [0, 0, 0x41, 30, 0],
      [100, 2, 0, 10, 20],
      [150, 4, 0, 15, 25],
      [200, 3, 0, 15, 25],
      [400, 0, 0x26, 72, 1],
      [400, 1, 0x41, 30, 0],
      [400, 1, 0x26, 72, 1]
    ]);
    expect(finishRecording([], 100)).toEqual({ steps: [], durationMs: 0 });
  });

  it('commandes du worker', () => {
    expect(recordCommand(3, [0x77, 0x78])).toBe('record 3 119,120 0');
    expect(recordCommand(3, [], true)).toBe('record 3 - 1');
    expect(playCommand(4, macro([[0, 0, 65, 30, 0], [50, 1, 65, 30, 0]], true, 200))).toBe('play 4 1 200 0,0,65,30,0,50,1,65,30,0');
  });

  it('macros venues de la base ou du renderer : étapes invalides retirées, triées, durée bornée', () => {
    const [clean] = sanitizeMacros([
      {
        id: 'abc',
        name: '  Farm  ',
        loop: 1,
        durationMs: 5,
        steps: [[100, 1, 65, 30, 0], [0, 0, 65, 30, 0], [10, 9, 0, 0, 0], [20, 0, 999, 0, 0], 'x', [30, 2, 0, 1.5, 2]]
      },
      { id: '../evil', steps: [] }
    ]);
    expect(clean).toEqual({ id: 'abc', name: 'Farm', createdAt: new Date(0).toISOString(), loop: true, durationMs: 100, steps: [[0, 0, 65, 30, 0], [100, 1, 65, 30, 0]] });
    expect(sanitizeMacros('nope')).toEqual([]);
  });
});

describe('MacroRecorder : commandes sans attente, enregistrement rangé', () => {
  let dir: string;
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  beforeEach(() => {
    dir = makeTempDir();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    removeTempDir(dir);
  });

  it("worker prêt : enregistrer, arrêter et lire partent pendant l'appel (raccourci global, pas d'await)", async () => {
    const recorded: [MacroStep[], number][] = [];
    const recorder = new MacroRecorder({ scriptDir: dir, onStatus: () => undefined, onRecorded: (steps, d) => recorded.push([steps, d]) });
    const warm = recorder.warmUp();
    fakeWorker.stdout.emit('data', 'ready\n');
    await warm;

    written.length = 0;
    void recorder.toggleRecord([0x77]);
    expect(written).toEqual(['record 1 119 0\n']);
    expect(recorder.getStatus().recording).toBe(true);

    fakeWorker.stdout.emit('data', 'recording 1\nev 1 200 0 65 30 0\nev 1 260 1 65 30 0\n');
    expect(recorder.getStatus().stepCount).toBe(2);

    written.length = 0;
    void recorder.toggleRecord([0x77]);
    expect(written).toEqual(['stop\n']);
    fakeWorker.stdout.emit('data', 'recorded 1 900\n');
    expect(recorded).toEqual([[[[0, 0, 65, 30, 0], [60, 1, 65, 30, 0]], 700]]);

    written.length = 0;
    void recorder.togglePlay(macro([[0, 0, 65, 30, 0], [60, 1, 65, 30, 0]], true, 700));
    expect(written).toEqual(['play 2 1 700 0,0,65,30,0,60,1,65,30,0\n']);
    expect(recorder.getStatus()).toMatchObject({ playing: true, playingMacroId: 'm1' });

    // Un événement d'un ancien tour ne touche pas au nouveau.
    fakeWorker.stdout.emit('data', 'stopped 1\n');
    expect(recorder.getStatus().playing).toBe(true);
    fakeWorker.stdout.emit('data', 'paused 2\n');
    expect(recorder.getStatus().paused).toBe(true);

    written.length = 0;
    void recorder.togglePlay(null);
    expect(written).toEqual(['stop\n']);
    expect(recorder.getStatus().playing).toBe(false);
  });

  it('Alt+Espace pendant un enregistrement le jette ; sans macro, la lecture ne part pas', async () => {
    const recorded: unknown[] = [];
    const recorder = new MacroRecorder({ scriptDir: dir, onStatus: () => undefined, onRecorded: steps => recorded.push(steps) });
    const warm = recorder.warmUp();
    fakeWorker.stdout.emit('data', 'ready\n');
    await warm;
    void recorder.toggleRecord([]);
    fakeWorker.stdout.emit('data', 'ev 1 10 0 65 30 0\n');
    recorder.stop(true);
    fakeWorker.stdout.emit('data', 'recorded 1 50\n');
    expect(recorded).toEqual([]);

    written.length = 0;
    void recorder.togglePlay(null);
    expect(written).toEqual([]);
    expect(recorder.getStatus().error).toMatch(/Aucune macro/);
  });
});

// Le vrai worker : son C# compile, il répond, et il s'arrête proprement.
// Rien n'est enregistré ni rejoué : aucun dossier de jeu n'est déclaré, donc
// aucune fenêtre n'est « le jeu » (aucune entrée envoyée au bureau).
describe.runIf(process.platform === 'win32')('worker PowerShell réel', () => {
  it('compile, enregistre (rien hors du jeu) et lit sans rien envoyer', async () => {
    const dir = makeTempDir();
    const script = path.join(dir, 'macro.ps1');
    fs.writeFileSync(script, MACRO_WORKER_SCRIPT, 'utf8');
    const { spawn: realSpawn } = await vi.importActual<typeof import('child_process')>('child_process');
    const child = realSpawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
    const lines: string[] = [];
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => lines.push(...chunk.split(/\r?\n/).filter(Boolean)));
    child.stderr.on('data', chunk => (stderr += String(chunk)));
    const waitFor = async (prefix: string) => {
      for (let i = 0; i < 300 && !lines.some(l => l.startsWith(prefix)); i++) await new Promise(r => setTimeout(r, 50));
      if (!lines.some(l => l.startsWith(prefix))) throw new Error(`« ${prefix} » jamais reçu. stderr: ${stderr}\nlignes: ${lines.join(' | ')}`);
    };
    try {
      await waitFor('ready');
      child.stdin.write('record 1 119 0\n');
      await waitFor('recording 1');
      await new Promise(r => setTimeout(r, 200));
      child.stdin.write('stop\n');
      await waitFor('recorded 1');
      // Lecture : le jeu n'est jamais au premier plan → pause, puis arrêt sans rien envoyer.
      child.stdin.write('play 2 0 100 0,0,65,30,0,10,1,65,30,0\n');
      await waitFor('paused 2');
      child.stdin.write('stop\n');
      await waitFor('stopped 2');
      expect(lines.some(l => l.startsWith('ev '))).toBe(false);
    } finally {
      child.stdin.end();
      child.kill();
      removeTempDir(dir);
    }
  }, 30_000);
});
