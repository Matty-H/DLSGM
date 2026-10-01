import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';
import { captureFileName, isCaptureName, listCaptures, sanitizeScreenshotSettings } from '../../src/main/screenshots';

let dir: string;
beforeEach(() => {
  dir = makeTempDir();
});
afterEach(() => removeTempDir(dir));

describe('captures', () => {
  it('nom horodaté, suffixé quand il existe déjà', () => {
    const date = new Date(2026, 9, 1, 12, 5, 3);
    expect(captureFileName(dir, date)).toBe('2026-10-01_12-05-03.png');
    fs.writeFileSync(path.join(dir, '2026-10-01_12-05-03.png'), '');
    expect(captureFileName(dir, date)).toBe('2026-10-01_12-05-03_2.png');
  });

  it("seuls des noms simples en .png sont acceptés (aucun chemin venant du renderer)", () => {
    expect(isCaptureName('2026-10-01_12-05-03.png')).toBe(true);
    for (const bad of ['../x.png', 'a/b.png', 'x.jpg', 'x.png.exe', '', 3]) expect(isCaptureName(bad)).toBe(false);
  });

  it('liste les captures de la plus récente à la plus ancienne, sans les autres fichiers', () => {
    fs.writeFileSync(path.join(dir, 'a.png'), 'a');
    fs.writeFileSync(path.join(dir, 'b.png'), 'bb');
    fs.writeFileSync(path.join(dir, 'notes.txt'), '');
    fs.utimesSync(path.join(dir, 'a.png'), new Date(2026, 0, 2), new Date(2026, 0, 2));
    fs.utimesSync(path.join(dir, 'b.png'), new Date(2026, 0, 1), new Date(2026, 0, 1));
    expect(listCaptures(dir).map(c => [c.file, c.size])).toEqual([['a.png', 1], ['b.png', 2]]);
    expect(listCaptures(path.join(dir, 'absent'))).toEqual([]);
  });

  it('réglages par défaut : activées, Ctrl+F8', () => {
    expect(sanitizeScreenshotSettings(undefined)).toEqual({ enabled: true, hotkey: 'Ctrl+F8' });
    expect(sanitizeScreenshotSettings({ enabled: false, hotkey: ' F9 ' })).toEqual({ enabled: false, hotkey: 'F9' });
  });
});
