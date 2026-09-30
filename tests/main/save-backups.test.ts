import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import { createSaveBackup, deleteSaveBackup, listSaveBackups, restoreSaveBackup } from '../../src/main/save-backups';
import type { SaveSource } from '../../src/main/game-tools';

const GAME = 'RJ01000001';
let root: string;
let saveDir: string;
let vxRoot: string;
let sources: SaveSource[];

const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');

beforeEach(() => {
  root = makeTempDir();
  electron.userData = path.join(root, 'userData');
  saveDir = path.join(root, 'game', 'www', 'save');
  vxRoot = path.join(root, 'vx');
  writeTree(saveDir, { 'file1.rmmzsave': 'v1', 'sub/x.dat': 'x1' });
  // Racine d'un jeu RPG Maker VX : seuls les SaveNN sont des sauvegardes.
  writeTree(vxRoot, { 'Save01.rvdata2': 'S1', 'Game.exe': 'EXE' });
  sources = [
    { label: 'Sauvegardes', path: saveDir, exists: true },
    { label: 'Dossier du jeu (SaveNN)', path: vxRoot, exists: true, fileFilter: /^Save\d+\.(rvdata2?|rxdata)$/i },
    { label: 'Absent', path: path.join(root, 'nope'), exists: false }
  ];
});

afterEach(() => removeTempDir(root));

describe('createSaveBackup', () => {
  it('copie les emplacements existants, en respectant le filtre de fichiers', async () => {
    const backup = await createSaveBackup(GAME, sources, 'auto');
    expect(backup?.locations).toEqual(['Sauvegardes', 'Dossier du jeu (SaveNN)']);
    expect(backup?.fileCount).toBe(3); // Game.exe exclu
  });

  it("ignore une copie automatique identique à la précédente, pas une copie manuelle", async () => {
    await createSaveBackup(GAME, sources, 'auto');
    expect(await createSaveBackup(GAME, sources, 'auto')).toBeNull();
    expect(await createSaveBackup(GAME, sources, 'manual')).not.toBeNull();
  });

  it("renvoie null quand il n'y a rien à copier", async () => {
    expect(await createSaveBackup(GAME, [sources[2]], 'manual')).toBeNull();
  });

  it('garde 10 copies automatiques au plus, jamais de suppression des manuelles', async () => {
    await createSaveBackup(GAME, sources, 'manual');
    for (let i = 0; i < 12; i++) {
      fs.writeFileSync(path.join(saveDir, 'file1.rmmzsave'), `loop${i}`);
      await createSaveBackup(GAME, sources, 'auto');
    }
    const list = await listSaveBackups(GAME);
    expect(list.filter(b => b.reason !== 'manual')).toHaveLength(10);
    expect(list.filter(b => b.reason === 'manual')).toHaveLength(1);
  });
});

describe('restoreSaveBackup', () => {
  it("restaure exactement la copie, sans toucher au reste du jeu, et garde l'état écrasé", async () => {
    const backup = (await createSaveBackup(GAME, sources, 'auto'))!;
    fs.writeFileSync(path.join(saveDir, 'file1.rmmzsave'), 'v2');
    fs.writeFileSync(path.join(saveDir, 'extra.rmmzsave'), 'extra');
    fs.writeFileSync(path.join(vxRoot, 'Save02.rvdata2'), 'S2');

    expect(await restoreSaveBackup(GAME, backup.id, sources)).toEqual({ skipped: [] });
    expect(read(saveDir, 'file1.rmmzsave')).toBe('v1');
    expect(fs.existsSync(path.join(saveDir, 'extra.rmmzsave'))).toBe(false);
    expect(read(saveDir, 'sub', 'x.dat')).toBe('x1');
    expect(fs.existsSync(path.join(vxRoot, 'Save02.rvdata2'))).toBe(false);
    expect(read(vxRoot, 'Game.exe')).toBe('EXE');

    // La restauration est elle-même réversible.
    const [preRestore] = await listSaveBackups(GAME);
    expect(preRestore.reason).toBe('pre-restore');
    await restoreSaveBackup(GAME, preRestore.id, sources);
    expect(read(saveDir, 'file1.rmmzsave')).toBe('v2');
    expect(read(vxRoot, 'Save02.rvdata2')).toBe('S2');
  });

  it("signale les emplacements qui n'existent plus au lieu d'échouer", async () => {
    const backup = (await createSaveBackup(GAME, sources, 'auto'))!;
    expect(await restoreSaveBackup(GAME, backup.id, sources.slice(0, 1))).toEqual({ skipped: ['Dossier du jeu (SaveNN)'] });
  });

  it('restaure la plus ancienne copie automatique même quand le nettoyage passe', async () => {
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(saveDir, 'file1.rmmzsave'), `loop${i}`);
      await createSaveBackup(GAME, sources, 'auto');
    }
    const oldest = (await listSaveBackups(GAME)).at(-1)!;
    await restoreSaveBackup(GAME, oldest.id, sources);
    expect(read(saveDir, 'file1.rmmzsave')).toBe('loop0');
  });

  it('refuse un identifiant de copie qui sortirait du dossier des copies', async () => {
    await expect(restoreSaveBackup(GAME, '../../etc', sources)).rejects.toThrow();
    await expect(deleteSaveBackup(GAME, '..')).rejects.toThrow();
  });
});
