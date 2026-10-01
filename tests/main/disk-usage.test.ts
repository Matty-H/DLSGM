import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';
import { DiskUsageScanner, MAX_AGE_MS, diskInfo, folderSize, isFresh } from '../../src/main/disk-usage';
import type { GameDiskUsage } from '../../src/shared/ipc-types';

let root: string;
beforeEach(() => {
  root = makeTempDir();
});
afterEach(() => removeTempDir(root));

describe('taille des dossiers de jeux', () => {
  it('additionne tous les fichiers, sous-dossiers compris', async () => {
    writeTree(root, { 'Game.exe': '12345', 'www/data/a.json': '{}', 'www/img/b.png': 'x'.repeat(1000), 'vide/.keep': '' });
    expect(await folderSize(root)).toEqual({ bytes: 1007, files: 4 });
  });

  it('dossier introuvable : 0 sans erreur', async () => {
    expect(await folderSize(path.join(root, 'absent'))).toEqual({ bytes: 0, files: 0 });
  });

  it('cache valable tant que le dossier n’a pas bougé et pendant 7 jours', () => {
    const usage: GameDiskUsage = { bytes: 1, files: 1, computedAt: 1_000, folderMtimeMs: 50 };
    expect(isFresh(usage, 50, 2_000)).toBe(true);
    expect(isFresh(usage, 51, 2_000)).toBe(false);
    expect(isFresh(usage, 50, 1_000 + MAX_AGE_MS + 1)).toBe(false);
    expect(isFresh(undefined, 50)).toBe(false);
  });

  it('espace du disque du dossier', async () => {
    const [disk] = await diskInfo([root, path.join(root, 'x')]);
    expect(disk.root).toBe(path.parse(root).root);
    expect(disk.totalBytes).toBeGreaterThan(0);
    expect(disk.freeBytes).toBeGreaterThan(0);
  });

  it('mesure en file, un jeu à la fois, sans remesurer ce qui est à jour (sauf « forcer »)', async () => {
    writeTree(root, { 'RJ01/a.bin': 'aaaa', 'RJ02/b.bin': 'bb' });
    const stored = new Map<string, GameDiskUsage>();
    const updates: string[] = [];
    const pendings: number[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const measure = async (dir: string) => {
      maxConcurrent = Math.max(maxConcurrent, ++concurrent);
      await new Promise(r => setTimeout(r, 5));
      concurrent--;
      return folderSize(dir);
    };
    const scanner = new DiskUsageScanner(
      { get: async id => stored.get(id), set: async (id, u) => void stored.set(id, u) },
      (id, _usage, pending) => {
        updates.push(id);
        pendings.push(pending);
      },
      measure
    );
    const games = [
      { gameId: 'RJ01', dir: path.join(root, 'RJ01') },
      { gameId: 'RJ02', dir: path.join(root, 'RJ02') }
    ];
    await scanner.refresh(games);
    await vi.waitFor(() => expect(updates).toEqual(['RJ01', 'RJ02']));
    expect(maxConcurrent).toBe(1);
    // Après la dernière mesure, plus rien en attente (sinon « calcul en cours » resterait affiché).
    expect(pendings).toEqual([1, 0]);
    expect(stored.get('RJ01')?.bytes).toBe(4);

    await scanner.refresh(games);
    await new Promise(r => setTimeout(r, 30));
    expect(updates).toHaveLength(2);

    fs.writeFileSync(path.join(root, 'RJ02', 'c.bin'), 'ccc');
    await scanner.refresh(games, true);
    await vi.waitFor(() => expect(updates).toHaveLength(4));
    expect(stored.get('RJ02')?.bytes).toBe(5);
  });
});
