import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listTree, makeTempDir, removeTempDir, writeTree } from '../helpers';
import { libraryRoots, locateGame, rootOf, sanitizeExtraFolders, scanLibraryRoots } from '../../src/main/library-folders';
import { moveLibrary } from '../../src/main/library-move';

let root: string;
let main: string;
let second: string;

beforeEach(() => {
  root = makeTempDir();
  main = path.join(root, 'main');
  second = path.join(root, 'second');
  fs.mkdirSync(main);
  fs.mkdirSync(second);
});

afterEach(() => removeTempDir(root));

describe('library folders', () => {
  it('keeps only absolute, distinct, non-nested extra folders', () => {
    const extras = sanitizeExtraFolders(main, [second, second, path.join(main, 'sub'), root, 'relative', 42, path.join(root, 'third')]);
    expect(extras).toEqual([second, path.join(root, 'third')]);
    expect(libraryRoots({ destinationFolder: main, extraLibraryFolders: [second] })).toEqual([main, second]);
    expect(libraryRoots({ destinationFolder: '', extraLibraryFolders: [second] })).toEqual([second]);
  });

  it('finds games in every folder, the first folder winning a duplicate', () => {
    writeTree(main, { 'RJ01000001/a.exe': 'x', 'notes/x.txt': 'x' });
    writeTree(second, { 'RJ01000001/a.exe': 'x', 'RJ01000002/b.exe': 'x' });
    const scan = scanLibraryRoots([main, second, path.join(root, 'gone')]);
    expect([...scan.games.entries()]).toEqual([['RJ01000001', main], ['RJ01000002', second]]);
    expect(scan.duplicates).toEqual([{ gameId: 'RJ01000001', roots: [main, second] }]);
    expect(scan.missingRoots).toEqual([path.join(root, 'gone')]);
    expect(locateGame([main, second], 'RJ01000002')).toBe(path.join(second, 'RJ01000002'));
    expect(locateGame([main, second], 'RJ09999999')).toBeNull();
    expect(rootOf([main, second], path.join(second, 'RJ01000002'))).toBe(second);
  });

  it('moves one game to another folder, by copy, leaving the others', async () => {
    writeTree(main, { 'RJ01000001/data/a.bin': 'abc', 'RJ01000002/b.exe': 'x' });
    const result = await moveLibrary(main, second, { only: ['RJ01000001'], forceCopy: true });
    expect(result).toEqual({ moved: ['RJ01000001'], leftovers: [], copied: true });
    expect(listTree(main)).toEqual(['RJ01000002/b.exe']);
    expect(listTree(second)).toEqual(['RJ01000001/data/a.bin']);
  });

  it('never overwrites a game already in the target folder', async () => {
    writeTree(main, { 'RJ01000001/a.exe': 'new' });
    writeTree(second, { 'RJ01000001/a.exe': 'old' });
    await expect(moveLibrary(main, second, { only: ['RJ01000001'] })).rejects.toThrow('conflicts');
    expect(fs.readFileSync(path.join(second, 'RJ01000001', 'a.exe'), 'utf8')).toBe('old');
  });
});
