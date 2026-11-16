import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cheatTablePath, findCheatEngine, freeTableName, importCheatTables, isCheatTableName, listCheatTables, resolveCheatEngine } from '../../src/main/cheat-engine';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';

let root: string;
beforeEach(() => {
  root = makeTempDir();
});
afterEach(() => removeTempDir(root));

describe('isCheatTableName', () => {
  it('accepte un simple nom en .CT, japonais compris', () => {
    expect(isCheatTableName('Game.CT')).toBe(true);
    expect(isCheatTableName('ゲーム v1.2.ct')).toBe(true);
  });

  it('refuse chemins, autres extensions et noms réservés', () => {
    for (const name of ['../evil.CT', '..\\evil.CT', 'C:\\x.CT', 'sub/x.CT', 'x.exe', 'x.CT.exe', 'CON.CT', '.CT', 'x.CT ', '', 42, null]) {
      expect(isCheatTableName(name)).toBe(false);
    }
  });
});

describe('findCheatEngine', () => {
  it('préfère le lanceur, sinon un binaire de Cheat Engine', () => {
    writeTree(root, { 'cheatengine-x86_64.exe': '' });
    expect(findCheatEngine(root)).toBe(path.join(root, 'cheatengine-x86_64.exe'));
    writeTree(root, { 'Cheat Engine.exe': '' });
    expect(findCheatEngine(root)).toBe(path.join(root, 'Cheat Engine.exe'));
  });

  it('rien pour un dossier vide, relatif ou non configuré', () => {
    expect(findCheatEngine(root)).toBeNull();
    expect(findCheatEngine('')).toBeNull();
    expect(findCheatEngine('Cheat Engine')).toBeNull();
  });
});

describe('resolveCheatEngine', () => {
  it('sans dossier choisi, trouve l’installation habituelle, la version la plus récente d’abord', () => {
    const pf = path.join(root, 'Program Files');
    const pf86 = path.join(root, 'Program Files (x86)');
    writeTree(pf, { 'Cheat Engine 7.4/Cheat Engine.exe': '', 'Cheat Engine 7.10/Cheat Engine.exe': '', 'Other/Cheat Engine.exe': '' });
    writeTree(pf86, { 'Cheat Engine/cheatengine-i386.exe': '' });
    const env = { ProgramW6432: pf, ProgramFiles: pf, 'ProgramFiles(x86)': pf86 };
    expect(resolveCheatEngine('', env)).toBe(path.join(pf, 'Cheat Engine 7.10', 'Cheat Engine.exe'));
    expect(resolveCheatEngine('', { 'ProgramFiles(x86)': pf86 })).toBe(path.join(pf86, 'Cheat Engine', 'cheatengine-i386.exe'));
    expect(resolveCheatEngine('', {})).toBeNull();
  });

  it('un dossier choisi prime, sans repli s’il est vide', () => {
    const pf = path.join(root, 'pf');
    writeTree(pf, { 'Cheat Engine/Cheat Engine.exe': '' });
    expect(resolveCheatEngine(path.join(root, 'empty'), { ProgramFiles: pf })).toBeNull();
  });
});

describe('freeTableName', () => {
  it('ne réutilise jamais un nom pris, sans tenir compte de la casse', () => {
    expect(freeTableName(new Set(), 'a.CT')).toBe('a.CT');
    expect(freeTableName(new Set(['a.ct']), 'a.CT')).toBe('a (2).CT');
    expect(freeTableName(new Set(['a.ct', 'a (2).ct']), 'a.CT')).toBe('a (3).CT');
  });
});

describe('importCheatTables', () => {
  it('copie les tables sans écraser, ignore le reste', async () => {
    const src = path.join(root, 'src');
    const dir = path.join(root, 'work', 'RJ01234567', 'cheat-tables');
    writeTree(src, { 'Game.CT': '<CheatTable/>', 'other/Game.CT': '<CheatTable v2/>', 'trainer.exe': 'MZ' });
    writeTree(dir, { 'Game.CT': 'existing' });

    const result = await importCheatTables(dir, [path.join(src, 'Game.CT'), path.join(src, 'other', 'Game.CT'), path.join(src, 'trainer.exe'), path.join(src, 'missing.CT')]);

    expect(result.imported).toEqual(['Game (2).CT', 'Game (3).CT']);
    expect(result.skipped).toEqual(['trainer.exe', 'missing.CT']);
    expect(fs.readFileSync(path.join(dir, 'Game.CT'), 'utf8')).toBe('existing');
    expect(fs.readFileSync(path.join(dir, 'Game (3).CT'), 'utf8')).toBe('<CheatTable v2/>');
    expect(fs.readdirSync(dir).some(name => name.endsWith('.tmp'))).toBe(false);
  });
});

describe('listCheatTables / cheatTablePath', () => {
  it('liste seulement les tables, et ne résout jamais hors du dossier', async () => {
    const dir = path.join(root, 'cheat-tables');
    writeTree(root, { 'outside.CT': 'x' });
    writeTree(dir, { 'a.CT': 'a', 'notes.txt': 'n', 'sub/b.CT': 'b' });

    expect((await listCheatTables(dir)).map(table => table.name)).toEqual(['a.CT']);
    expect(await listCheatTables(path.join(root, 'absent'))).toEqual([]);
    expect(cheatTablePath(dir, 'a.CT')).toBe(path.join(dir, 'a.CT'));
    expect(cheatTablePath(dir, '../outside.CT')).toBeNull();
    expect(cheatTablePath(dir, 'missing.CT')).toBeNull();
    expect(cheatTablePath(dir, 'notes.txt')).toBeNull();
  });
});
