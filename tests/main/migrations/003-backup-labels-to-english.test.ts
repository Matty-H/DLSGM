import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import { backupLabelsToEnglish, currentSaveLabel, migrateManifest } from '../../../src/main/migrations/003-backup-labels-to-english';
import { createSaveBackup, restoreSaveBackup } from '../../../src/main/save-backups';
import type { SaveSource } from '../../../src/main/game-tools';
import { migrationContext } from './context';

const GAME = 'RJ01000001';
let root: string;

beforeEach(() => {
  root = makeTempDir();
  electron.userData = path.join(root, 'userData');
});

afterEach(() => removeTempDir(root));

describe('003 — libellés des sauvegardes en anglais', () => {
  it('traduit les anciens libellés, garde « (sandbox) » et les libellés inconnus', () => {
    expect(currentSaveLabel('Sauvegardes')).toBe('Saves');
    expect(currentSaveLabel('Sauvegardes (jeu) (sandbox)')).toBe('Saves (game) (sandbox)');
    expect(currentSaveLabel('Saves')).toBe('Saves');
    expect(currentSaveLabel('Autre')).toBe('Autre');
  });

  it('réécrit locations et folders, et renvoie null quand tout est déjà à jour', () => {
    const manifest = { id: 'x', locations: ['Sauvegardes'], folders: [{ label: 'Sauvegardes', folder: '0' }] };
    expect(migrateManifest(manifest)).toEqual({ id: 'x', locations: ['Saves'], folders: [{ label: 'Saves', folder: '0' }] });
    expect(migrateManifest({ locations: ['Saves'], folders: [{ label: 'Saves', folder: '0' }] })).toBeNull();
  });

  it('rend restaurable une copie faite avec les anciens libellés français', async () => {
    const saveDir = path.join(root, 'game', 'www', 'save');
    const vxRoot = path.join(root, 'vx');
    writeTree(saveDir, { 'file1.rmmzsave': 'v1' });
    writeTree(vxRoot, { 'Save01.rvdata2': 'S1', 'Game.exe': 'EXE' });
    const filter = /^Save\d+\.(rvdata2?|rxdata)$/i;
    // Copie faite par une ancienne version : libellés français dans backup.json.
    const legacy: SaveSource[] = [
      { label: 'Sauvegardes', path: saveDir, exists: true },
      { label: 'Dossier du jeu (SaveNN)', path: vxRoot, exists: true, fileFilter: filter }
    ];
    const backup = (await createSaveBackup(GAME, legacy, 'manual'))!;
    fs.writeFileSync(path.join(saveDir, 'file1.rmmzsave'), 'changed');
    fs.writeFileSync(path.join(vxRoot, 'Save01.rvdata2'), 'changed');

    await backupLabelsToEnglish.run(migrationContext(root));

    const current: SaveSource[] = [
      { label: 'Saves', path: saveDir, exists: true },
      { label: 'Game folder (SaveNN)', path: vxRoot, exists: true, fileFilter: filter }
    ];
    expect(await restoreSaveBackup(GAME, backup.id, current)).toEqual({ skipped: [] });
    expect(fs.readFileSync(path.join(saveDir, 'file1.rmmzsave'), 'utf8')).toBe('v1');
    expect(fs.readFileSync(path.join(vxRoot, 'Save01.rvdata2'), 'utf8')).toBe('S1');
  });

  it('ignore les copies en cours (.tmp) et ne fait rien sans dossier de copies', async () => {
    await backupLabelsToEnglish.run(migrationContext(root));
    const tmp = path.join(electron.userData, 'save_backups', GAME, 'b1.tmp', 'backup.json');
    writeTree(path.dirname(tmp), { 'backup.json': JSON.stringify({ locations: ['Sauvegardes'], folders: [] }) });
    await backupLabelsToEnglish.run(migrationContext(root));
    expect(JSON.parse(fs.readFileSync(tmp, 'utf8')).locations).toEqual(['Sauvegardes']);
  });
});
