import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';
import type { TextractorThread, TextractorView } from '../../src/shared/ipc-types';

// Faux TextractorCLI : stdin enregistré, stdout piloté par le test.
const spawned: { exe: string; cwd: string; stdin: string[]; stdout: EventEmitter }[] = [];
vi.mock('child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: (exe: string, _args: string[], options: { cwd: string }) => {
    const record = { exe, cwd: options.cwd, stdin: [] as string[], stdout: new EventEmitter() };
    spawned.push(record);
    return Object.assign(new EventEmitter(), {
      // TextractorCLI lit son entrée en UTF-16LE : on décode comme lui.
      stdin: { write: (t: Buffer) => record.stdin.push(t.toString('utf16le')), end: () => undefined },
      stdout: record.stdout,
      kill: () => undefined
    });
  }
}));

import { CliOutputDecoder, TextractorLineReader, TextractorSession, findTextractorCli, isInternalThread, parseTextractorLine } from '../../src/main/textractor';

/** Exécutable PE minimal de l'architecture voulue (seul l'en-tête compte). */
function fakeExe(file: string, arch: 'x86' | 'x64'): void {
  const buf = Buffer.alloc(0x100);
  buf.write('MZ', 0);
  buf.writeUInt32LE(0x80, 0x3c);
  buf.write('PE\0\0', 0x80, 'latin1');
  buf.writeUInt16LE(arch === 'x64' ? 0x8664 : 0x14c, 0x84);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

const utf16 = (text: string) => Buffer.from(text, 'utf16le');

describe('sortie de TextractorCLI', () => {
  it('lit une ligne de texte (fil, processus, hookcode, texte japonais)', () => {
    // Le hookcode contient des « : » : le nom s'arrête au premier, le hookcode va jusqu'au « ] ».
    expect(parseTextractorLine('[2:1A2C:7FF6A0B1C2D0:0:0:GetGlyphOutlineW:HW-4@0:gdi32.dll:GetGlyphOutlineW] 「こんにちは」')).toMatchObject({
      name: 'GetGlyphOutlineW',
      hookcode: 'HW-4@0:gdi32.dll:GetGlyphOutlineW',
      text: '「こんにちは」'
    });
    const simple = parseTextractorLine('[2:1A2C:7FF6A0B1:0:0:TextOutW:HQ-8@0] 「こんにちは」');
    expect(simple).toEqual({ handle: 2, pid: 0x1a2c, key: '1A2C:7FF6A0B1:0:0', name: 'TextOutW', hookcode: 'HQ-8@0', text: '「こんにちは」' });
    expect(isInternalThread(parseTextractorLine('[0:0:0:0:0:Console:] Textractor: injected')!)).toBe(true);
    expect(parseTextractorLine('Usage: attach -Pprocessid')).toBeNull();
  });

  it('décode l’UTF-16 même coupé au milieu d’un caractère, et l’UTF-8 sinon', () => {
    const bytes = utf16('[2:1:2:0:0:A:HB0@0] 日本語\n');
    const decoder = new CliOutputDecoder();
    expect(decoder.push(bytes.subarray(0, 7)) + decoder.push(bytes.subarray(7))).toBe('[2:1:2:0:0:A:HB0@0] 日本語\n');
    expect(new CliOutputDecoder().push(Buffer.from('[2:1:2:0:0:A:HB0@0] abc\n', 'utf8'))).toBe('[2:1:2:0:0:A:HB0@0] abc\n');
  });

  it('un texte sur plusieurs lignes reste une seule entrée', () => {
    const got: string[] = [];
    const reader = new TextractorLineReader(line => got.push(line.text));
    reader.push('[2:1:2:0:0:A:HB0@0] première\r\nsuite\n[2:1:2:0:0:A:HB0@0] deuxième\n');
    expect(got).toEqual(['première\nsuite']);
    reader.flush();
    expect(got).toEqual(['première\nsuite', 'deuxième']);
  });
});

describe('TextractorSession', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
    spawned.length = 0;
    fakeExe(path.join(dir, 'tx', 'x86', 'TextractorCLI.exe'), 'x86');
    fakeExe(path.join(dir, 'tx', 'x64', 'TextractorCLI.exe'), 'x64');
    fakeExe(path.join(dir, 'game', 'Game.exe'), 'x86');
    fakeExe(path.join(dir, 'game', 'data', 'nw.exe'), 'x64');
  });
  afterEach(() => removeTempDir(dir));

  it('trouve TextractorCLI par architecture (sous-dossiers, ou racine de la bonne architecture)', () => {
    expect(findTextractorCli(path.join(dir, 'tx'), 'x64')).toBe(path.join(dir, 'tx', 'x64', 'TextractorCLI.exe'));
    const flat = path.join(dir, 'flat');
    fakeExe(path.join(flat, 'TextractorCLI.exe'), 'x86');
    expect(findTextractorCli(flat, 'x86')).toBe(path.join(flat, 'TextractorCLI.exe'));
    expect(findTextractorCli(flat, 'x64')).toBeNull();
    expect(findTextractorCli('', 'x86')).toBeNull();
  });

  it("attache chaque processus du jeu avec le CLI de son architecture, et ne garde que le texte du jeu", async () => {
    const texts: [TextractorThread, string][] = [];
    const views: TextractorView[] = [];
    const session = new TextractorSession({
      textractorDir: path.join(dir, 'tx'),
      gameDir: path.join(dir, 'game'),
      selectedHook: 'HS-8@0',
      onText: (thread, text) => texts.push([thread, text]),
      onChange: view => views.push(view),
      listProcesses: async () =>
        new Map([
          [100, path.join(dir, 'game', 'Game.exe')],
          [200, path.join(dir, 'game', 'data', 'nw.exe')]
        ])
    });
    session.start(0);
    await vi.waitFor(() => expect(spawned).toHaveLength(2));
    expect(spawned.map(s => [path.basename(s.cwd), s.stdin])).toEqual([
      ['x86', ['attach -P100\n']],
      ['x64', ['attach -P200\n']]
    ]);

    vi.useFakeTimers();
    spawned[1].stdout.emit('data', utf16('[0:0:0:0:0:Console:] Textractor: pipe connected\n[3:C8:1000:0:0:Script:HS-8@0] 「おはよう」\n'));
    spawned[1].stdout.emit('data', utf16('[3:C8:1000:0:0:Script:HS-8@0]   \n'));
    // Même hookcode, autre appelant, même texte (cas réel d'ExtTextOutW) : pas envoyé deux fois.
    spawned[1].stdout.emit('data', utf16('[4:C8:1000:77:0:Script:HS-8@0] 「おはよう」\n'));
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    expect(texts.map(([t, text]) => [t.hookcode, text])).toEqual([['HS-8@0', '「おはよう」']]);
    expect(session.view()).toMatchObject({ running: true, attachedPids: [100, 200], selectedHook: 'HS-8@0', threads: [{ name: 'Script', count: 1, lastText: '「おはよう」' }, { name: 'Script', count: 1 }] });

    session.stop();
    expect(views.at(-1)?.running).toBe(false);
  });
});
