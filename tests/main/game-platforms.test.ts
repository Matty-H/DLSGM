import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';
import { detectPlatforms, platformOfEntry } from '../../src/main/game-platforms';
import { hostPlatform } from '../../src/shared/platforms';

let dir: string;
beforeEach(() => {
  dir = makeTempDir();
});
afterEach(() => removeTempDir(dir));

describe('platformOfEntry', () => {
  it('reconnaît exe, app, dmg et apk, sans les redistribuables', () => {
    expect(platformOfEntry('Game.EXE', false)).toBe('windows');
    expect(platformOfEntry('unins000.exe', false)).toBeNull();
    expect(platformOfEntry('vc_redist.x64.exe', false)).toBeNull();
    expect(platformOfEntry('Game.app', true)).toBe('mac');
    expect(platformOfEntry('Game_mac.dmg', false)).toBe('mac');
    expect(platformOfEntry('game.apk', false)).toBe('android');
    expect(platformOfEntry('readme.txt', false)).toBeNull();
    expect(platformOfEntry('www', true)).toBeNull();
  });
});

describe('detectPlatforms', () => {
  it('trouve les versions présentes, y compris dans des sous-dossiers', async () => {
    writeTree(dir, {
      'Windows/Game/Game.exe': '',
      'Mac/Game.dmg': '',
      'Android/v1/game.apk': ''
    });
    expect(await detectPlatforms(dir)).toEqual(['windows', 'mac', 'android']);
  });

  it("n'explore ni l'intérieur d'un .app, ni .dlsgm, ni BepInEx", async () => {
    writeTree(dir, {
      'Game.app/Contents/Resources/helper.exe': '',
      '.dlsgm/backup/1/tool.exe': '',
      'BepInEx/tools/x.exe': ''
    });
    expect(await detectPlatforms(dir)).toEqual(['mac']);
  });

  it("s'arrête à la profondeur maximale", async () => {
    writeTree(dir, { 'a/b/c/d/Game.exe': '' });
    expect(await detectPlatforms(dir)).toEqual([]);
    writeTree(dir, { 'a/b/c/Game.exe': '' });
    expect(await detectPlatforms(dir)).toEqual(['windows']);
  });

  it('rend une liste vide pour un dossier absent ou sans jeu', async () => {
    expect(await detectPlatforms(path.join(dir, 'absent'))).toEqual([]);
    fs.writeFileSync(path.join(dir, 'notes.txt'), '');
    expect(await detectPlatforms(dir)).toEqual([]);
  });
});

describe('hostPlatform', () => {
  it('Windows et Mac seulement', () => {
    expect(hostPlatform('win32')).toBe('windows');
    expect(hostPlatform('darwin')).toBe('mac');
    expect(hostPlatform('linux')).toBeNull();
  });
});
