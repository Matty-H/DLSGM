import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../../helpers';
import { jsonStoresToNedb } from '../../../src/main/migrations/001-json-stores-to-nedb';
import { openDataFile } from '../../../src/main/migrations/nedb';
import { migrationContext } from './context';

let root: string;
let userData: string;

beforeEach(() => {
  root = makeTempDir();
  userData = path.join(root, 'userData');
});

afterEach(() => removeTempDir(root));

const docs = async (file: string) =>
  Object.fromEntries((await (await openDataFile(path.join(userData, file))).findAsync({})).map(d => [d._id, d.value]));

describe('001 — anciens stores JSON monoblocs', () => {
  it('convertit settings.json et cache.json en un document par clé et garde les originaux en .migrated', async () => {
    writeTree(userData, {
      'settings.json': JSON.stringify({ destinationFolder: 'D:\\Jeux', language: 'en' }),
      'cache.json': JSON.stringify({ RJ01000001: { work_name: 'A', rating: 4 } })
    });
    await jsonStoresToNedb.run(migrationContext(root));
    expect(await docs('settings.db')).toEqual({ destinationFolder: 'D:\\Jeux', language: 'en' });
    expect(await docs('cache.db')).toEqual({ RJ01000001: { work_name: 'A', rating: 4 } });
    expect(fs.existsSync(path.join(userData, 'settings.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'cache.json.migrated'), 'utf8'))).toEqual({
      RJ01000001: { work_name: 'A', rating: 4 }
    });
  });

  it("n'écrase pas un store NeDB déjà rempli", async () => {
    const db = await openDataFile(path.join(userData, 'cache.db'));
    await db.insertAsync({ _id: 'RJ01000002', value: { work_name: 'B' } });
    await db.compactDatafileAsync();
    writeTree(userData, { 'cache.json': JSON.stringify({ RJ01000001: { work_name: 'A' } }) });
    await jsonStoresToNedb.run(migrationContext(root));
    expect(await docs('cache.db')).toEqual({ RJ01000002: { work_name: 'B' } });
    expect(fs.existsSync(path.join(userData, 'cache.json'))).toBe(true);
  });

  it('laisse un fichier illisible tel quel, sans échouer', async () => {
    writeTree(userData, { 'cache.json': '{ tronqué' });
    const logs: string[] = [];
    await jsonStoresToNedb.run(migrationContext(root, logs));
    expect(fs.readFileSync(path.join(userData, 'cache.json'), 'utf8')).toBe('{ tronqué');
    expect(logs.some(l => l.includes('illisible'))).toBe(true);
  });

  it('ne fait rien sans ancien fichier', async () => {
    await jsonStoresToNedb.run(migrationContext(root));
    expect(fs.existsSync(path.join(userData, 'cache.db'))).toBe(false);
  });
});
