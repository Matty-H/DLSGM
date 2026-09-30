import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listTree, makeTempDir, makeZip, removeTempDir } from '../helpers';

// L'extraction 7-Zip passe par un processus utilitaire Electron : seul le
// chemin .zip (extracteur interne) est testé ici.
vi.mock('electron', () => ({ utilityProcess: { fork: () => { throw new Error('non disponible en test'); } } }));

import { archiveVolumes, decodeZipName, firstVolume, gameIdFromName, importArchive } from '../../src/main/archive-import';

let root: string;
let library: string;

beforeEach(() => {
  root = makeTempDir();
  library = path.join(root, 'library');
  fs.mkdirSync(library);
});

afterEach(() => removeTempDir(root));

const writeZip = (name: string, entries: Parameters<typeof makeZip>[0]) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, makeZip(entries));
  return file;
};

describe('gameIdFromName', () => {
  it.each([
    ['RJ01234567.zip', 'RJ01234567'],
    ['rj123456 (v1.2).rar', 'RJ123456'],
    ['[Cercle] RJ01234567 Titre.part1.exe', 'RJ01234567'],
    ['MonJeu.zip', null],
    ['XRJ01234567.zip', null]
  ])('%s → %s', (name, expected) => {
    expect(gameIdFromName(name)).toBe(expected);
  });
});

describe('decodeZipName', () => {
  it('décode le Shift-JIS des zips japonais sans drapeau UTF-8', () => {
    expect(decodeZipName(Buffer.from([0x83, 0x66, 0x81, 0x5b, 0x83, 0x5e]), false)).toBe('データ');
  });
  it("respecte le drapeau UTF-8, et reconnaît l'UTF-8 sans drapeau", () => {
    expect(decodeZipName(Buffer.from('セーブ', 'utf8'), true)).toBe('セーブ');
    expect(decodeZipName(Buffer.from('セーブ', 'utf8'), false)).toBe('セーブ');
  });
});

describe('firstVolume', () => {
  it("retrouve la partie 1 quand on choisit une autre partie d'un RAR multi-volumes", () => {
    for (const part of ['RJ01234567.part1.exe', 'RJ01234567.part2.rar', 'RJ01234567.part3.rar']) {
      fs.writeFileSync(path.join(root, part), '');
    }
    expect(firstVolume(path.join(root, 'RJ01234567.part3.rar'))).toBe(path.join(root, 'RJ01234567.part1.exe'));
    expect(firstVolume(path.join(root, 'RJ01234567.part1.exe'))).toBe(path.join(root, 'RJ01234567.part1.exe'));
  });

  it('échoue clairement si la partie 1 manque', () => {
    fs.writeFileSync(path.join(root, 'RJ01234567.part2.rar'), '');
    expect(() => firstVolume(path.join(root, 'RJ01234567.part2.rar'))).toThrow(/Première partie/);
  });
});

describe('archiveVolumes', () => {
  it("rend toutes les parties d'un RAR multi-volumes, et seulement elles", () => {
    for (const name of ['RJ01234567.part1.exe', 'RJ01234567.part2.rar', 'RJ01234567.part03.rar', 'RJ07654321.part1.rar', 'RJ01234567.zip']) {
      fs.writeFileSync(path.join(root, name), '');
    }
    expect(archiveVolumes(path.join(root, 'RJ01234567.part2.rar')).sort()).toEqual(
      ['RJ01234567.part03.rar', 'RJ01234567.part1.exe', 'RJ01234567.part2.rar'].map(n => path.join(root, n))
    );
  });

  it('rend le fichier seul pour une archive en un morceau', () => {
    fs.writeFileSync(path.join(root, 'RJ01234567.zip'), '');
    fs.writeFileSync(path.join(root, 'RJ01234567.part1.rar'), '');
    expect(archiveVolumes(path.join(root, 'RJ01234567.zip'))).toEqual([path.join(root, 'RJ01234567.zip')]);
  });
});

describe('importArchive (.zip)', () => {
  it("range le jeu sous son ID, sans le dossier enveloppe, avec les noms japonais corrects", async () => {
    const sjisName = Buffer.concat([Buffer.from('RJ01111111/'), Buffer.from([0x83, 0x66, 0x81, 0x5b, 0x83, 0x5e]), Buffer.from('.txt')]);
    const zip = writeZip('archive.zip', [
      { name: 'RJ01111111/', data: '' },
      { name: 'RJ01111111/Game.exe', data: 'exe' },
      { name: sjisName, data: 'data' }
    ]);
    expect(await importArchive(zip, library)).toEqual({ gameId: 'RJ01111111' });
    expect(listTree(path.join(library, 'RJ01111111'))).toEqual(['Game.exe', 'データ.txt']);
    expect(fs.existsSync(path.join(library, '.dlsgm-import'))).toBe(false);
  });

  it("prend l'ID dans le nom de l'archive et retire un dossier titre", async () => {
    const zip = writeZip('RJ03333333 (v1.2).zip', [
      { name: 'Titre du jeu/Game.exe', data: 'x' },
      { name: 'Titre du jeu/data/a.txt', data: 'a' }
    ]);
    expect(await importArchive(zip, library)).toEqual({ gameId: 'RJ03333333' });
    expect(listTree(path.join(library, 'RJ03333333'))).toEqual(['Game.exe', 'data/a.txt']);
  });

  it("n'écrase jamais un jeu déjà présent", async () => {
    fs.mkdirSync(path.join(library, 'RJ01234567'));
    fs.writeFileSync(path.join(library, 'RJ01234567', 'mine.txt'), 'keep');
    const zip = writeZip('RJ01234567.zip', [{ name: 'Game.exe', data: 'new' }]);
    await expect(importArchive(zip, library)).rejects.toThrow(/déjà dans la bibliothèque/);
    expect(listTree(path.join(library, 'RJ01234567'))).toEqual(['mine.txt']);
  });

  it("refuse une archive qui écrirait hors du dossier (../), sans rien importer", async () => {
    const zip = writeZip('slip.zip', [
      { name: 'RJ02222222/ok.txt', data: 'ok' },
      { name: '../evil.txt', data: 'evil' }
    ]);
    await expect(importArchive(zip, library)).rejects.toThrow(/Chemin refusé/);
    expect(fs.existsSync(path.join(root, 'evil.txt'))).toBe(false);
    expect(fs.readdirSync(library)).toEqual([]);
  });

  it("échoue avec un message utile quand l'ID est introuvable", async () => {
    const zip = writeZip('MonJeu.zip', [{ name: 'MonJeu/Game.exe', data: 'x' }]);
    await expect(importArchive(zip, library)).rejects.toThrow(/ID DLsite introuvable/);
    expect(fs.readdirSync(library)).toEqual([]);
  });
});
