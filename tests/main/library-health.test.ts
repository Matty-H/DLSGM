import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

import { checkLibraryHealth } from '../../src/main/library-health';
import type { GameMetadata } from '../../src/shared/ipc-types';

let root: string;
let library: string;
let imgCache: string;

beforeEach(() => {
  root = makeTempDir();
  library = path.join(root, 'library');
  imgCache = path.join(root, 'img_cache');
});

afterEach(() => removeTempDir(root));

const entry = (patch: Partial<GameMetadata> = {}): GameMetadata =>
  ({ work_name: 'Titre', category: 'RPG', work_image: '//img/cover.jpg', sample_images: [], imagesComplete: true, ...patch }) as GameMetadata;

const check = (cache: Record<string, GameMetadata>, platform: NodeJS.Platform = 'win32') =>
  checkLibraryHealth({ libraryDir: library, cache, imgCacheDir: imgCache, platform });

describe('checkLibraryHealth', () => {
  it('reports nothing for a healthy library', () => {
    writeTree(library, { 'RJ01000001/Game.exe': 'x' });
    writeTree(imgCache, { 'RJ01000001/work_image.jpg': 'x' });
    const report = check({ RJ01000001: entry() });
    expect(report.gameCount).toBe(1);
    expect([report.noExecutable, report.fetchFailed, report.missingImages, report.misnamed, report.orphans, report.brokenPatches].flat()).toEqual([]);
  });

  it('flags games without an executable, but not audio works or manga', () => {
    writeTree(library, { 'RJ01000001/data.bin': 'x', 'RJ01000002/track01.mp3': 'x', 'RJ01000003/sub/Game.exe': 'x' });
    writeTree(imgCache, { 'RJ01000001/work_image.jpg': 'x', 'RJ01000002/work_image.jpg': 'x', 'RJ01000003/work_image.jpg': 'x' });
    const report = check({ RJ01000001: entry(), RJ01000002: entry({ category: 'SOU' }), RJ01000003: entry() });
    expect(report.noExecutable).toEqual([{ gameId: 'RJ01000001', chosenMissing: null }]);
  });

  it('flags a chosen executable that disappeared, even if another one is detected', () => {
    writeTree(library, { 'RJ01000001/Game.exe': 'x' });
    writeTree(imgCache, { 'RJ01000001/work_image.jpg': 'x' });
    const report = check({ RJ01000001: entry({ executablePath: 'old/Launcher.exe' }) });
    expect(report.noExecutable).toEqual([{ gameId: 'RJ01000001', chosenMissing: 'old/Launcher.exe' }]);
  });

  it('only checks chosen executables on macOS (most games are Windows-only)', () => {
    writeTree(library, { 'RJ01000001/Game.exe': 'x', 'RJ01000002/data.bin': 'x' });
    const report = check({ RJ01000001: entry({ executablePath: 'Gone.app' }), RJ01000002: entry() }, 'darwin');
    expect(report.noExecutable.map(i => i.gameId)).toEqual(['RJ01000001']);
  });

  it('reports failed fetches separately from missing images', () => {
    writeTree(library, { 'RJ01000001/Game.exe': 'x' });
    const report = check({ RJ01000001: { work_name: 'RJ01000001', fetchFailed: true, error: 'introuvable' } as GameMetadata });
    expect(report.fetchFailed).toEqual([{ gameId: 'RJ01000001', error: 'introuvable' }]);
    expect(report.missingImages).toEqual([]);
  });

  it('reports missing cover and samples, but never manual images', () => {
    writeTree(library, { 'RJ01000001/Game.exe': 'x', 'RJ01000002/Game.exe': 'x' });
    writeTree(imgCache, { 'RJ01000001/sample_1.jpg': 'x' });
    const report = check({
      RJ01000001: entry({ sample_images: ['//a.jpg', '//b.jpg', 'manual'] }),
      RJ01000002: entry({ work_image: 'manual' })
    });
    expect(report.missingImages).toEqual([{ gameId: 'RJ01000001', cover: true, samples: 1 }]);
  });

  it('lists cache entries whose folder is gone, unless a misnamed folder holds the game', () => {
    writeTree(library, { '[RJ01000002] Titre v1.2/Game.exe': 'x' });
    const report = check({ RJ01000001: entry({ work_name: 'Disparu' }), RJ01000002: entry() });
    expect(report.orphans).toEqual([{ gameId: 'RJ01000001', name: 'Disparu', failed: false }]);
    expect(report.misnamed.map(m => m.gameId)).toEqual(['RJ01000002']);
  });

  it('flags patches whose added files or original copies disappeared', () => {
    const manifest = {
      patches: [
        { id: '1', name: 'Traduction', kind: 'custom', installedAt: '', added: ['tl/a.txt'], overwritten: ['data.bin'] },
        { id: '2', name: 'Fix', kind: 'custom', installedAt: '', added: ['fix.dll'], overwritten: [] }
      ]
    };
    writeTree(library, {
      'RJ01000001/Game.exe': 'x',
      'RJ01000001/data.bin': 'patched',
      'RJ01000001/.dlsgm/backup/1/data.bin': 'original',
      'RJ01000001/.dlsgm/patches.json': JSON.stringify(manifest)
    });
    writeTree(imgCache, { 'RJ01000001/work_image.jpg': 'x' });
    const report = check({ RJ01000001: entry() });
    expect(report.brokenPatches).toEqual([
      { gameId: 'RJ01000001', patchId: '1', name: 'Traduction', missingFiles: ['tl/a.txt'], missingBackups: [], isLast: false },
      { gameId: 'RJ01000001', patchId: '2', name: 'Fix', missingFiles: ['fix.dll'], missingBackups: [], isLast: true }
    ]);
  });
});
