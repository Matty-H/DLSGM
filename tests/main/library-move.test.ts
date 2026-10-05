import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listTree, makeTempDir, removeTempDir, writeTree } from '../helpers';
import { LibraryMoveError, moveLibrary, planLibraryMove } from '../../src/main/library-move';

let root: string;
let source: string;
let target: string;

beforeEach(() => {
  root = makeTempDir();
  source = path.join(root, 'Games');
  target = path.join(root, 'NewLibrary');
  writeTree(source, {
    'RJ01000001/Game.exe': 'exe',
    'RJ01000001/www/save/file1.rpgsave': 'save',
    'RJ01000001/.dlsgm/install.json': '{}',
    'RJ01000002/ゲーム.exe': 'jp',
    'notes.txt': 'mes notes',
    '.dlsgm-import/123/partial.bin': 'tmp',
    '.dlsgm-incoming/abc/partial.bin': 'tmp'
  });
  fs.mkdirSync(target);
});

afterEach(() => {
  vi.restoreAllMocks();
  removeTempDir(root);
});

const moved = () => ['RJ01000001/.dlsgm/install.json', 'RJ01000001/Game.exe', 'RJ01000001/www/save/file1.rpgsave', 'RJ01000002/ゲーム.exe', 'notes.txt'];

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof LibraryMoveError ? error.code : String(error);
  }
}

describe('planLibraryMove', () => {
  it('décrit le déplacement sans les dossiers temporaires de DLSGM', async () => {
    const plan = await planLibraryMove(source, target);
    expect(plan.entries).toEqual(['RJ01000001', 'RJ01000002', 'notes.txt']);
    expect(plan.gameCount).toBe(2);
    expect(plan.bytes).toBe('exe'.length + 'save'.length + '{}'.length + 'jp'.length + 'mes notes'.length);
    expect(plan.sameVolume).toBe(true);
  });

  it('refuse les cas dangereux', async () => {
    expect(await codeOf(planLibraryMove(source, source))).toBe('same-folder');
    expect(await codeOf(planLibraryMove(source, path.join(source, 'RJ01000001')))).toBe('target-inside-source');
    expect(await codeOf(planLibraryMove(source, path.join(root, 'absent')))).toBe('target-missing');
    expect(await codeOf(planLibraryMove(path.join(root, 'absent'), target))).toBe('source-missing');
  });

  it("refuse d'écraser quoi que ce soit dans la cible (sans tenir compte de la casse)", async () => {
    fs.mkdirSync(path.join(target, 'rj01000002'));
    const error = await planLibraryMove(source, target).catch(e => e);
    expect(error).toBeInstanceOf(LibraryMoveError);
    expect(error.code).toBe('conflicts');
    expect(error.detail).toEqual(['RJ01000002']);
  });
});

describe('moveLibrary', () => {
  it('même disque : renomme tout, laisse les temporaires', async () => {
    const result = await moveLibrary(source, target);
    expect(result).toEqual({ moved: ['RJ01000001', 'RJ01000002', 'notes.txt'], leftovers: [], copied: false });
    expect(listTree(target)).toEqual(moved());
    expect(listTree(source)).toEqual(['.dlsgm-import/123/partial.bin', '.dlsgm-incoming/abc/partial.bin']);
  });

  it('copie : tout copié et vérifié avant de supprimer les originaux', async () => {
    const progress: number[] = [];
    const result = await moveLibrary(source, target, { forceCopy: true, onProgress: p => progress.push(p.done) });
    expect(result.copied).toBe(true);
    expect(result.leftovers).toEqual([]);
    expect(listTree(target)).toEqual(moved());
    expect(fs.readFileSync(path.join(target, 'RJ01000002', 'ゲーム.exe'), 'utf8')).toBe('jp');
    expect(listTree(source)).toEqual(['.dlsgm-import/123/partial.bin', '.dlsgm-incoming/abc/partial.bin']);
    expect(progress.at(-1)).toBe(20);
    // Pas de dossier de transit oublié.
    expect(fs.readdirSync(target).some(name => name.startsWith('.dlsgm-moving-'))).toBe(false);
  });

  it("copie en échec : la copie partielle est supprimée, la bibliothèque n'a pas bougé", async () => {
    const realCopy = fs.promises.copyFile;
    vi.spyOn(fs.promises, 'copyFile').mockImplementation(async (from, to, mode) => {
      if (String(from).endsWith('ゲーム.exe')) throw new Error('disque plein');
      return realCopy(from, to, mode);
    });
    expect(await codeOf(moveLibrary(source, target, { forceCopy: true }))).toContain('disque plein');
    expect(fs.readdirSync(target)).toEqual([]);
    expect(listTree(source)).toEqual([...moved().slice(0, 4), 'notes.txt', '.dlsgm-import/123/partial.bin', '.dlsgm-incoming/abc/partial.bin'].sort());
  });

  it('renommage en échec : ce qui a bougé revient à sa place', async () => {
    const realRename = fs.promises.rename;
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(from).endsWith('RJ01000002')) throw Object.assign(new Error('fichier ouvert'), { code: 'EBUSY' });
      return realRename(from, to);
    });
    expect(await codeOf(moveLibrary(source, target))).toContain('fichier ouvert');
    expect(fs.readdirSync(target)).toEqual([]);
    expect(fs.existsSync(path.join(source, 'RJ01000001', 'Game.exe'))).toBe(true);
  });
});
