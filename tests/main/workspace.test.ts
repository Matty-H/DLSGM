import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';
import { defaultWorkspaceRoot, describeWorkspace, workspaceRoot } from '../../src/main/workspace';

let root: string;

beforeEach(() => {
  root = makeTempDir();
});

afterEach(() => removeTempDir(root));

describe('workspaceRoot', () => {
  it('utilise le dossier des paramètres, sinon Documents/DLSGM/Travaux', () => {
    const docs = path.join(root, 'Documents');
    expect(workspaceRoot('', docs)).toBe(path.join(docs, 'DLSGM', 'Travaux'));
    expect(workspaceRoot(root, docs)).toBe(root);
    // Un chemin relatif ne doit pas dépendre du dossier courant de l'app.
    expect(workspaceRoot('relatif', docs)).toBe(defaultWorkspaceRoot(docs));
  });
});

describe('describeWorkspace', () => {
  it("signale un dossier pas encore créé, sans le créer", async () => {
    const dir = path.join(root, 'RJ01000001');
    expect(await describeWorkspace(dir)).toMatchObject({ exists: false, entries: [], totalFiles: 0 });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('résume le contenu : totaux récursifs, entrées de premier niveau, plus récentes en premier', async () => {
    const dir = path.join(root, 'RJ01000001');
    writeTree(dir, { 'notes.md': 'abc', 'extract/img/a.png': '12345', 'extract/b.txt': '12' });
    fs.utimesSync(path.join(dir, 'notes.md'), new Date('2020-01-01'), new Date('2020-01-01'));
    fs.utimesSync(path.join(dir, 'extract'), new Date('2026-01-01'), new Date('2026-01-01'));

    const info = await describeWorkspace(dir);
    expect(info).toMatchObject({ exists: true, totalFiles: 3, totalBytes: 10, truncated: false });
    expect(info.entries.map(e => [e.name, e.isDirectory, e.size])).toEqual([
      ['extract', true, 7],
      ['notes.md', false, 3]
    ]);
  });
});
