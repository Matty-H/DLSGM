import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listTree, makeTempDir, removeTempDir } from '../helpers';
import { findMisnamedFolders, renameMisnamedFolders } from '../../src/main/folder-rename';
import { isAddressOnlyText, isSiteFileName, mergeReleaseNames, parseReleaseName, passwordsFromArchiveName, siteNames, passwordsFromFolder, passwordsFromText, readInstallInfo, writeInstallInfo } from '../../src/main/release-names';

let library: string;

beforeEach(() => {
  library = makeTempDir();
});

afterEach(() => removeTempDir(library));

const mkdir = (name: string, file = 'Game.exe') => {
  fs.mkdirSync(path.join(library, name), { recursive: true });
  fs.writeFileSync(path.join(library, name, file), name);
};

describe('parseReleaseName', () => {
  it.each([
    ['[RJ01234567] Titre v1.2', { gameId: 'RJ01234567', version: '1.2', dlc: false }],
    ['site.com_RJ01234567_Ver1.03.rar', { gameId: 'RJ01234567', version: '1.03', dlc: false }],
    ['RJ01234567 ver.2.0.1 (DLC込み)', { gameId: 'RJ01234567', version: '2.0.1', dlc: true }],
    ['RJ01234567_v1_02_DLC.part1.exe', { gameId: 'RJ01234567', version: '1.02', dlc: true }],
    ['RJ01234567_fixed', { gameId: 'RJ01234567', version: null, dlc: false }],
    ['RJ01234567 version 3', { gameId: 'RJ01234567', version: '3', dlc: false }],
    // « dlc » dans un mot, « v » dans un mot ou partie de volume : rien.
    ['RJ01234567 Saved Valley.part2.rar', { gameId: 'RJ01234567', version: null, dlc: false }],
    ['RJ01234567_dlcfree_rev2', { gameId: 'RJ01234567', version: null, dlc: false }],
    ['Mon Jeu', { gameId: null, version: null, dlc: false }]
  ])('%s', (name, expected) => {
    expect(parseReleaseName(name)).toEqual(expected);
  });

  it("garde la première version trouvée, DLC si l'un des noms le dit", () => {
    expect(mergeReleaseNames(['RJ01234567.zip', 'Game v1.1', 'RJ01234567 v1.2 DLC同梱'])).toEqual({ version: '1.1', dlc: true });
  });
});

describe('mots de passe probables', () => {
  it("le site en tête du nom de l'archive", () => {
    expect(passwordsFromArchiveName('[www.example.com]_RJ01234567_v1.rar')).toEqual(['www.example.com', 'example.com']);
    expect(passwordsFromArchiveName('example.net_RJ01234567.7z')).toEqual(['example.net']);
    expect(passwordsFromArchiveName('RJ01234567.rar')).toEqual([]);
  });

  it("le site sans ID dans le nom, ou en étiquette entre crochets (minuscules, .com)", () => {
    expect(passwordsFromArchiveName('otomi-games.com_VNZYK7UFN.rar')).toEqual(['otomi-games.com']);
    expect(passwordsFromArchiveName('OTOMI-GAMES.COM_VNZYK7UFN.rar')).toEqual(['OTOMI-GAMES.COM', 'otomi-games.com']);
    expect(passwordsFromArchiveName('[RYuugames] RY-RJ01646610.rar')).toEqual(['RYuugames', 'ryuugames', 'ryuugames.com']);
    expect(passwordsFromArchiveName('【site.net】RJ01234567.7z')).toEqual(['site.net']);
    // ID, version, DLC ou titre entre crochets : pas des sites.
    expect(passwordsFromArchiveName('[RJ01234567] Titre [v1.2] [DLC] [Mon titre].rar')).toEqual([]);
  });
});

describe('publicités des sites de diffusion', () => {
  it('noms des sites tirés des noms rencontrés', () => {
    expect(siteNames(['[RYuugames] RY-RJ01646610.rar', 'otomi-games.com_VNZYK7UFN', 'www.Example.org_RJ01234567.zip', 'RJ01234567 v1.2'])).toEqual(['ryuugames', 'otomi-games', 'example']);
    expect(isSiteFileName('OTOMI-GAMES.COM.url', ['otomi-games'])).toBe(true);
    expect(isSiteFileName('ryuugames.txt', ['ryuugames'])).toBe(true);
    expect(isSiteFileName('ryuugames_save.txt', ['ryuugames'])).toBe(false);
  });

  it("un texte qui n'est que des adresses", () => {
    expect(isAddressOnlyText('ryuugames.com\r\n\r\ndiscord.gg/eroge\r\n')).toBe(true);
    expect(isAddressOnlyText('https://example.com/page?x=1')).toBe(true);
    expect(isAddressOnlyText('Merci !\nhttps://ci-en.dlsite.com/creator/1')).toBe(false);
    expect(isAddressOnlyText('Ver.1.02')).toBe(false);
    expect(isAddressOnlyText('')).toBe(false);
  });

  it('dans un texte (anglais, japonais, chinois)', () => {
    expect(passwordsFromText('Download\nPassword: abc123\n解凍パスワード：日本語pass\n密码=xyz')).toEqual(['abc123', '日本語pass', 'xyz']);
    expect(passwordsFromText('pass : "quoted"')).toEqual(['quoted']);
  });

  it('dans les petits .txt du dossier, y compris un pass.txt à une seule ligne, en Shift-JIS', () => {
    fs.writeFileSync(path.join(library, 'pass.txt'), 'onlyline\n');
    fs.writeFileSync(path.join(library, 'readme.txt'), Buffer.from([0x83, 0x70, 0x83, 0x58, 0x83, 0x8f, 0x81, 0x5b, 0x83, 0x68, 0x81, 0x46, 0x73, 0x6a, 0x69, 0x73]));
    fs.writeFileSync(path.join(library, 'Game.exe'), 'password: nope');
    expect(passwordsFromFolder(library).sort()).toEqual(['onlyline', 'sjis']);
  });
});

describe('assistant de renommage', () => {
  it('propose les dossiers qui contiennent un ID, avec version et DLC, et signale les conflits', () => {
    mkdir('[RJ01234567] Titre v1.2');
    mkdir('RJ02222222_fixed');
    mkdir('RJ02222222 (DLC)');
    mkdir('RJ03333333');
    mkdir('RJ03333333 v2');
    mkdir('rj04444444');
    mkdir('Sans ID');
    mkdir('.dlsgm-import/RJ05555555 v1');
    fs.writeFileSync(path.join(library, 'RJ06666666 v1.zip'), '');
    expect(findMisnamedFolders(library)).toEqual([
      { folder: '[RJ01234567] Titre v1.2', root: library, gameId: 'RJ01234567', version: '1.2', dlc: false },
      { folder: 'RJ02222222 (DLC)', root: library, gameId: 'RJ02222222', version: null, dlc: true, conflict: 'duplicate' },
      { folder: 'RJ02222222_fixed', root: library, gameId: 'RJ02222222', version: null, dlc: false, conflict: 'duplicate' },
      { folder: 'RJ03333333 v2', root: library, gameId: 'RJ03333333', version: '2', dlc: false, conflict: 'exists' },
      { folder: 'rj04444444', root: library, gameId: 'RJ04444444', version: null, dlc: false }
    ]);
  });

  it('signale un conflit avec un jeu d’un autre dossier de bibliothèque, et ne le renomme pas', () => {
    mkdir('[RJ01234567] Titre v1.2');
    expect(findMisnamedFolders(library, ['RJ01234567'])[0].conflict).toBe('exists');
    expect(renameMisnamedFolders(library, ['[RJ01234567] Titre v1.2'], ['RJ01234567'])[0].gameId).toBeUndefined();
    expect(fs.existsSync(path.join(library, 'RJ01234567'))).toBe(false);
  });

  it('renomme seulement ce qui est demandé et sans conflit, sans jamais écraser, et garde l’ancien nom', () => {
    mkdir('[RJ01234567] Titre v1.2');
    mkdir('RJ03333333');
    mkdir('RJ03333333 v2', 'other.exe');
    mkdir('RJ07777777_fixed');
    const results = renameMisnamedFolders(library, ['[RJ01234567] Titre v1.2', 'RJ03333333 v2', 'inexistant']);
    expect(results).toEqual([
      { folder: '[RJ01234567] Titre v1.2', gameId: 'RJ01234567' },
      { folder: 'RJ03333333 v2', error: expect.stringMatching(/existe déjà/) },
      { folder: 'inexistant', error: expect.any(String) }
    ]);
    expect(fs.readdirSync(library).sort()).toEqual(['RJ01234567', 'RJ03333333', 'RJ03333333 v2', 'RJ07777777_fixed']);
    expect(listTree(path.join(library, 'RJ03333333'))).toEqual(['Game.exe']);
    expect(readInstallInfo(path.join(library, 'RJ01234567'))).toMatchObject({ source: '[RJ01234567] Titre v1.2', version: '1.2', dlc: false });
  });

  it('renomme un dossier qui ne diffère que par la casse', () => {
    mkdir('rj04444444');
    expect(renameMisnamedFolders(library, ['rj04444444'])).toEqual([{ folder: 'rj04444444', gameId: 'RJ04444444' }]);
    expect(fs.readdirSync(library)).toEqual(['RJ04444444']);
  });

  it("garde l'origine d'un import d'archive au lieu de l'ancien nom du dossier", () => {
    mkdir('RJ01234567 copie');
    writeInstallInfo(path.join(library, 'RJ01234567 copie'), { source: 'RJ01234567_v3.rar', version: '3', dlc: false, date: 'x' });
    renameMisnamedFolders(library, ['RJ01234567 copie']);
    expect(readInstallInfo(path.join(library, 'RJ01234567'))?.source).toBe('RJ01234567_v3.rar');
  });
});
