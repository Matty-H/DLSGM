import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listTree, makeTempDir, makeZip, removeTempDir } from '../helpers';

// L'extraction 7-Zip passe par un processus utilitaire Electron : seul le
// chemin .zip (extracteur interne) est testé ici.
vi.mock('electron', () => ({ utilityProcess: { fork: () => { throw new Error('non disponible en test'); } } }));

import { ArchivePasswordError, archiveVolumes, decodeZipName, firstVolume, gameIdFromName, importArchive, nestedArchive } from '../../src/main/archive-import';
import { run7z } from '../../src/main/archive-7z';
import { readInstallInfo } from '../../src/main/release-names';
import SevenZip from '7z-wasm';

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
    expect(await importArchive(zip, library)).toEqual({ gameId: 'RJ01111111', version: null, dlc: false });
    expect(listTree(path.join(library, 'RJ01111111'))).toEqual(['.dlsgm/install.json', 'Game.exe', 'データ.txt']);
    expect(fs.existsSync(path.join(library, '.dlsgm-import'))).toBe(false);
  });

  it("prend l'ID dans le nom de l'archive et retire un dossier titre", async () => {
    const zip = writeZip('RJ03333333 (v1.2).zip', [
      { name: 'Titre du jeu/Game.exe', data: 'x' },
      { name: 'Titre du jeu/data/a.txt', data: 'a' }
    ]);
    expect(await importArchive(zip, library)).toEqual({ gameId: 'RJ03333333', version: '1.2', dlc: false });
    expect(listTree(path.join(library, 'RJ03333333'))).toEqual(['.dlsgm/install.json', 'Game.exe', 'data/a.txt']);
    expect(readInstallInfo(path.join(library, 'RJ03333333'))).toMatchObject({ source: 'RJ03333333 (v1.2).zip', version: '1.2', dlc: false });
  });

  it("n'écrase jamais un jeu déjà présent", async () => {
    fs.mkdirSync(path.join(library, 'RJ01234567'));
    fs.writeFileSync(path.join(library, 'RJ01234567', 'mine.txt'), 'keep');
    const zip = writeZip('RJ01234567.zip', [{ name: 'Game.exe', data: 'new' }]);
    await expect(importArchive(zip, library)).rejects.toThrow(/déjà dans la bibliothèque/);
    expect(listTree(path.join(library, 'RJ01234567'))).toEqual(['mine.txt']);
  });

  it("refuse un jeu déjà présent dans un autre dossier de bibliothèque (ID dans le nom ou trouvé dedans)", async () => {
    const elsewhere = new Set(['RJ01234567', 'RJ02222222']);
    const isInLibrary = (id: string) => elsewhere.has(id);
    await expect(importArchive(writeZip('RJ01234567.zip', [{ name: 'Game.exe', data: 'x' }]), library, { isInLibrary })).rejects.toThrow(/déjà dans la bibliothèque/);
    await expect(importArchive(writeZip('jeu.zip', [{ name: 'RJ02222222/Game.exe', data: 'x' }]), library, { isInLibrary })).rejects.toThrow(/déjà dans la bibliothèque/);
    expect(fs.existsSync(path.join(library, 'RJ01234567'))).toBe(false);
    expect(fs.existsSync(path.join(library, 'RJ02222222'))).toBe(false);
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

  it("trouve l'ID dans l'arborescence quand ni l'archive ni l'enveloppe ne le portent", async () => {
    const zip = writeZip('download.zip', [
      { name: 'Game/Game.exe', data: 'x' },
      { name: 'Game/RJ01212121_readme.txt', data: 'r' }
    ]);
    expect((await importArchive(zip, library)).gameId).toBe('RJ01212121');
  });

  it('retire les publicités du site de diffusion et le dossier enveloppe qu’elles accompagnaient', async () => {
    const archive = writeZip('[RYuugames] RY-RJ01646610.zip', [
      { name: 'ryuugames.txt', data: 'ryuugames.com\r\n\r\ndiscord.gg/eroge\r\n' },
      { name: 'Visit us.url', data: '[InternetShortcut]\r\nURL=https://example.com/\r\n' },
      { name: 'game1.0/Game.exe', data: 'x' },
      { name: 'game1.0/＜ヒント＞エンド分岐条件.txt', data: 'エンド分岐のヒント' },
      { name: 'game1.0/readme.txt', data: '作者より\r\nhttps://ci-en.dlsite.com/creator/1\r\n' },
      { name: 'game1.0/www/data/links.txt', data: 'https://example.com' }
    ]);
    expect((await importArchive(archive, library)).gameId).toBe('RJ01646610');
    expect(listTree(path.join(library, 'RJ01646610'))).toEqual([
      '.dlsgm/install.json',
      'Game.exe',
      'readme.txt',
      'www/data/links.txt',
      '＜ヒント＞エンド分岐条件.txt'
    ]);
  });

  it("archive dans l'archive : publicités au nom du site retirées à chaque niveau", async () => {
    const inner = makeZip([
      { name: 'Game.exe', data: 'x' },
      { name: 'read me.txt', data: 'Thank you for playing!' },
      { name: 'otomi-games.com.png', data: 'banner' }
    ]);
    const archive = writeZip('otomi-games.com_VNZYK7UFN.zip', [
      { name: 'otomi-games.com_VNZYK7UFN/', data: '' },
      { name: 'otomi-games.com_VNZYK7UFN/OTOMI-GAMES.COM.url', data: '[InternetShortcut]' },
      { name: 'otomi-games.com_VNZYK7UFN/RJ01705944.zip', data: inner }
    ]);
    expect((await importArchive(archive, library)).gameId).toBe('RJ01705944');
    expect(listTree(path.join(library, 'RJ01705944'))).toEqual(['.dlsgm/install.json', 'Game.exe', 'read me.txt']);
  });

  it("refuse de deviner quand l'arborescence contient plusieurs IDs", async () => {
    const zip = writeZip('download.zip', [
      { name: 'Game/Game.exe', data: 'x' },
      { name: 'Game/RJ01212121.txt', data: 'r' },
      { name: 'Game/RJ03434343.txt', data: 'r' }
    ]);
    await expect(importArchive(zip, library)).rejects.toThrow(/ID DLsite introuvable/);
  });
});

/** Crée `<dir>/<name>` avec 7-Zip/WASM (chemin relatif → contenu ; `args` : -p, -mhe=on...). */
async function make7z(dir: string, name: string, files: Record<string, string>, args: string[] = []): Promise<string> {
  const src = fs.mkdtempSync(path.join(dir, 'src-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
    fs.writeFileSync(path.join(src, rel), content);
  }
  const sevenZip = await SevenZip({ print: () => undefined, printErr: () => undefined });
  sevenZip.FS.mkdir('/w');
  sevenZip.FS.mount(sevenZip.NODEFS, { root: dir }, '/w');
  sevenZip.FS.chdir(`/w/${path.basename(src)}`);
  sevenZip.callMain(['a', `/w/${name}`, '*', ...args]);
  fs.rmSync(src, { recursive: true, force: true });
  return path.join(dir, name);
}

describe('importArchive (7-Zip, mots de passe, archives imbriquées)', () => {
  const tried: (string | undefined)[] = [];
  const extract7z: typeof run7z = request => {
    tried.push(request.password);
    return run7z(request);
  };
  beforeEach(() => {
    tried.length = 0;
  });

  it('importe un 7z sans mot de passe, version lue dans le nom', async () => {
    const archive = await make7z(root, 'RJ04444444_v1.03.7z', { 'Game.exe': 'x' });
    expect(await importArchive(archive, library, { extract7z })).toEqual({ gameId: 'RJ04444444', version: '1.03', dlc: false });
    expect(listTree(path.join(library, 'RJ04444444'))).toEqual(['.dlsgm/install.json', 'Game.exe']);
    expect(tried).toEqual([undefined]);
  });

  it('ouvre un 7z à en-têtes chiffrés avec un mot de passe mémorisé', async () => {
    const archive = await make7z(root, 'RJ05555555.7z', { 'Game.exe': 'x' }, ['-pSECRET', '-mhe=on']);
    expect((await importArchive(archive, library, { extract7z, passwords: ['faux', 'SECRET'] })).gameId).toBe('RJ05555555');
    expect(tried).toEqual([undefined, 'faux', 'SECRET']);
    expect(fs.readFileSync(path.join(library, 'RJ05555555', 'Game.exe'), 'utf8')).toBe('x');
  });

  it("essaie le nom du site en tête du nom de l'archive", async () => {
    const archive = await make7z(root, '[example.com]_RJ06666666_v2.7z', { 'Game.exe': 'x' }, ['-pexample.com', '-mhe=on']);
    expect(await importArchive(archive, library, { extract7z })).toMatchObject({ gameId: 'RJ06666666', version: '2' });
  });

  it('ordre des essais : saisi, devinés d’après le nom, puis le gestionnaire', async () => {
    const archive = await make7z(root, '[Abc] RJ01010101.7z', { 'Game.exe': 'x' }, ['-pSECRET', '-mhe=on']);
    expect((await importArchive(archive, library, { extract7z, password: 'saisi', passwords: ['SECRET', 'jamais'] })).gameId).toBe('RJ01010101');
    expect(tried).toEqual([undefined, 'saisi', 'Abc', 'abc', 'abc.com', 'SECRET']);
  });

  it("devine le site d'une archive sans ID dans son nom", async () => {
    const archive = await make7z(root, 'otomi-games.com_VNZYK7UFN.7z', { 'RJ02020202/Game.exe': 'x' }, ['-potomi-games.com', '-mhe=on']);
    expect((await importArchive(archive, library, { extract7z })).gameId).toBe('RJ02020202');
  });

  it("lit le mot de passe d'un pass.txt avant de le retirer comme publicité", async () => {
    const inner = await make7z(root, 'RJ03030303.7z', { 'Game.exe': 'x' }, ['-pinner-site.com', '-mhe=on']);
    const outer = writeZip('download.zip', [
      { name: 'RJ03030303.7z', data: fs.readFileSync(inner) },
      { name: 'pass.txt', data: 'inner-site.com' }
    ]);
    expect((await importArchive(outer, library, { extract7z })).gameId).toBe('RJ03030303');
    expect(tried).toContain('inner-site.com');
  });

  it('zip chiffré : passe par 7-Zip avec le mot de passe', async () => {
    const archive = await make7z(root, 'RJ07777777.zip', { 'Game.exe': 'x' }, ['-pZIPPASS']);
    expect((await importArchive(archive, library, { extract7z, passwords: ['ZIPPASS'] })).gameId).toBe('RJ07777777');
    expect(fs.readFileSync(path.join(library, 'RJ07777777', 'Game.exe'), 'utf8')).toBe('x');
  });

  it('sans le bon mot de passe : ArchivePasswordError, et rien dans la bibliothèque', async () => {
    const archive = await make7z(root, 'RJ08888888.7z', { 'Game.exe': 'x' }, ['-pSECRET', '-mhe=on']);
    await expect(importArchive(archive, library, { extract7z, passwords: ['faux'] })).rejects.toBeInstanceOf(ArchivePasswordError);
    expect(fs.readdirSync(library)).toEqual([]);
  });

  it("extrait l'archive interne chiffrée avec le mot de passe du .txt voisin ; ID, version et DLC pris sur l'interne", async () => {
    const innerName = 'site_RJ09999999_Ver1.2_DLC同梱.7z';
    const inner = await make7z(root, innerName, { 'Game/Game.exe': 'x', 'Game/www/data.json': '{}' }, ['-pinner-pass', '-mhe=on']);
    const outer = writeZip('download.zip', [
      { name: 'pack/', data: '' },
      { name: `pack/${innerName}`, data: fs.readFileSync(inner) },
      { name: 'pack/readme.txt', data: '解凍パスワード：inner-pass\r\n' }
    ]);
    expect(await importArchive(outer, library, { extract7z })).toEqual({ gameId: 'RJ09999999', version: '1.2', dlc: true });
    expect(listTree(path.join(library, 'RJ09999999'))).toEqual(['.dlsgm/install.json', 'Game.exe', 'www/data.json']);
    expect(tried).toContain('inner-pass');
    expect(fs.existsSync(path.join(library, '.dlsgm-import'))).toBe(false);
  });
});

describe('nestedArchive', () => {
  it('ne prend pas un jeu pour une archive (exe ou dossier à côté)', () => {
    expect(nestedArchive(library)).toBeNull();
    fs.writeFileSync(path.join(root, 'x.zip'), '');
    // `library` (un dossier) est à côté : ce n'est pas une archive seule.
    expect(nestedArchive(root)).toBeNull();
    fs.rmSync(path.join(root, 'x.zip'));
    fs.rmSync(library, { recursive: true });
    fs.writeFileSync(path.join(root, 'data.7z'), '');
    fs.writeFileSync(path.join(root, 'readme.txt'), '');
    expect(nestedArchive(root)).toBe(path.join(root, 'data.7z'));
    fs.writeFileSync(path.join(root, 'Game.exe'), '');
    expect(nestedArchive(root)).toBeNull();
  });

  it('multi-volumes : la première partie, et rien si deux archives différentes', () => {
    fs.rmSync(library, { recursive: true });
    fs.writeFileSync(path.join(root, 'g.part1.exe'), '');
    fs.writeFileSync(path.join(root, 'g.part2.rar'), '');
    expect(nestedArchive(root)).toBe(path.join(root, 'g.part1.exe'));
    fs.writeFileSync(path.join(root, 'other.zip'), '');
    expect(nestedArchive(root)).toBeNull();
  });
});
