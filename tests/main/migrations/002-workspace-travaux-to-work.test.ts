import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listTree, makeTempDir, removeTempDir, writeTree } from '../../helpers';
import { workspaceTravauxToWork } from '../../../src/main/migrations/002-workspace-travaux-to-work';
import { openDataFile } from '../../../src/main/migrations/nedb';
import { migrationContext } from './context';
import { MIGRATIONS, PROFILE_MIGRATIONS, runMigrations } from '../../../src/main/migrations';

let root: string;
let base: string;

beforeEach(() => {
  root = makeTempDir();
  base = path.join(root, 'Documents', 'DLSGM');
});

afterEach(() => removeTempDir(root));

describe('002 — dossier Travaux renommé en Work', () => {
  it('renomme Travaux en Work, contenu compris', async () => {
    writeTree(path.join(base, 'Travaux'), { 'RJ01000001/notes.md': 'abc' });
    await workspaceTravauxToWork.run(migrationContext(root));
    expect(fs.readFileSync(path.join(base, 'Work', 'RJ01000001', 'notes.md'), 'utf8')).toBe('abc');
    expect(fs.existsSync(path.join(base, 'Travaux'))).toBe(false);
  });

  it('fusionne dans un Work existant sans rien écraser, les doublons restent dans Travaux', async () => {
    writeTree(path.join(base, 'Travaux'), { 'RJ01000001/old.md': 'old', 'RJ01000002/a.md': 'a' });
    writeTree(path.join(base, 'Work'), { 'RJ01000001/new.md': 'new' });
    await workspaceTravauxToWork.run(migrationContext(root));
    expect(listTree(path.join(base, 'Work'))).toEqual(['RJ01000001/new.md', 'RJ01000002/a.md']);
    expect(listTree(path.join(base, 'Travaux'))).toEqual(['RJ01000001/old.md']);
  });

  it('retire Travaux une fois vidé par la fusion', async () => {
    writeTree(path.join(base, 'Travaux'), { 'RJ01000002/a.md': 'a' });
    writeTree(path.join(base, 'Work'), { 'RJ01000001/new.md': 'new' });
    await workspaceTravauxToWork.run(migrationContext(root));
    expect(fs.existsSync(path.join(base, 'Travaux'))).toBe(false);
  });

  it('ne touche pas à un dossier Travaux choisi explicitement dans les paramètres', async () => {
    const legacy = path.join(base, 'Travaux');
    writeTree(legacy, { 'RJ01000001/notes.md': 'abc' });
    const settings = await openDataFile(path.join(root, 'userData', 'settings.db'));
    await settings.insertAsync({ _id: 'workspaceFolder', value: legacy });
    await settings.compactDatafileAsync();
    await workspaceTravauxToWork.run(migrationContext(root));
    expect(fs.existsSync(path.join(legacy, 'RJ01000001', 'notes.md'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'Work'))).toBe(false);
  });

  // Le profil leurre (app-lock.ts) a ses propres réglages, sans le dossier
  // de travaux choisi dans le vrai profil : il ne doit pas toucher à Documents.
  it("ne tourne pas pour le profil leurre, les autres migrations si", async () => {
    writeTree(path.join(base, 'Travaux'), { 'RJ01000001/notes.md': 'abc' });
    const context = { ...migrationContext(root), userData: path.join(root, 'userData', 'alt-profile') };
    fs.mkdirSync(context.userData, { recursive: true });
    expect(await runMigrations(context, PROFILE_MIGRATIONS)).toEqual([]);
    expect(fs.existsSync(path.join(base, 'Travaux', 'RJ01000001', 'notes.md'))).toBe(true);
    expect(PROFILE_MIGRATIONS.map(m => m.id)).toEqual(MIGRATIONS.filter(m => m.id !== workspaceTravauxToWork.id).map(m => m.id));
  });
});
