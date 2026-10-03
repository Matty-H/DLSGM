import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import { runMigrations, type Migration } from '../../../src/main/migrations';
import Store, { holdStores } from '../../../src/main/store';
import { GenreTranslations } from '../../../src/main/genre-translations';
import { createSaveBackup, restoreSaveBackup } from '../../../src/main/save-backups';
import { workspaceRoot } from '../../../src/main/workspace';
import type { SaveSource } from '../../../src/main/game-tools';
import { migrationContext } from './context';

const GAME = 'RJ01000001';
let root: string;

beforeEach(() => {
  root = makeTempDir();
  electron.userData = path.join(root, 'userData');
});

afterEach(() => removeTempDir(root));

/**
 * Dossier de données tel qu'une vieille version le laissait : réglages et
 * cache en JSON monobloc (avec les anciens « genres liés »), dossier
 * Documents/DLSGM/Travaux, copie de sauvegarde aux libellés français.
 */
async function oldInstallation(saveDir: string): Promise<{ backupId: string }> {
  writeTree(electron.userData, {
    'settings.json': JSON.stringify({ destinationFolder: 'D:\\Jeux', genreAliasGroups: [['Anal', 'アナル']] }),
    'cache.json': JSON.stringify({ [GAME]: { work_name: 'Titre', rating: 5, playTime: 3600 } })
  });
  writeTree(path.join(root, 'Documents', 'DLSGM', 'Travaux'), { [`${GAME}/notes.md`]: 'notes' });
  writeTree(saveDir, { 'file1.rmmzsave': 'v1' });
  const backup = (await createSaveBackup(GAME, [{ label: 'Sauvegardes', path: saveDir, exists: true }], 'manual'))!;
  fs.writeFileSync(path.join(saveDir, 'file1.rmmzsave'), 'changed');
  return { backupId: backup.id };
}

describe('migrations de bout en bout', () => {
  it("convertit le dossier d'une vieille version, deux fois sans effet de plus, et le code actuel lit tout", async () => {
    const saveDir = path.join(root, 'game', 'www', 'save');
    const { backupId } = await oldInstallation(saveDir);

    // Comme main.ts : stores retenus pendant les migrations, demandés avant.
    const release = holdStores();
    const settings = new Store('settings.db', { destinationFolder: '' });
    const pendingSettings = settings.getAll();
    expect(await runMigrations(migrationContext(root))).toEqual([]);
    // Un deuxième démarrage ne change rien (toujours avant l'ouverture des
    // stores : deux Datastore sur un même fichier se marchent dessus).
    expect(await runMigrations(migrationContext(root))).toEqual([]);
    release();

    expect(await pendingSettings).toEqual({ destinationFolder: 'D:\\Jeux' });
    expect(await new Store('cache.db', {}).getAll()).toEqual({ [GAME]: { work_name: 'Titre', rating: 5, playTime: 3600 } });
    expect(await new GenreTranslations(new Store('translations.db', {})).all()).toEqual({
      'アナル': { en: 'Anal', manual: false }
    });

    const work = workspaceRoot('', path.join(root, 'Documents'));
    expect(fs.readFileSync(path.join(work, GAME, 'notes.md'), 'utf8')).toBe('notes');

    const current: SaveSource[] = [{ label: 'Saves', path: saveDir, exists: true }];
    expect(await restoreSaveBackup(GAME, backupId, current)).toEqual({ skipped: [] });
    expect(fs.readFileSync(path.join(saveDir, 'file1.rmmzsave'), 'utf8')).toBe('v1');
  });

  it("un échec n'arrête ni les migrations suivantes ni le démarrage", async () => {
    const ran: string[] = [];
    const migrations: Migration[] = [
      { id: 'a', run: async () => { throw new Error('boom'); } },
      { id: 'b', run: async () => void ran.push('b') }
    ];
    const logs: string[] = [];
    expect(await runMigrations(migrationContext(root, logs), migrations)).toEqual(['a']);
    expect(ran).toEqual(['b']);
    expect(logs[0]).toContain('a');
  });
});
