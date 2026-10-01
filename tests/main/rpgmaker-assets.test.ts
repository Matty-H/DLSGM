import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listTree, makeTempDir, removeTempDir } from '../helpers';
import { chooseKey, decryptAsset, decryptedName, extractRpgMakerAssets, keyFromEncryptedPng, listEncryptedAssets } from '../../src/main/rpgmaker-assets';

// Clé et en-tête relevés sur un vrai jeu RPG Maker MV (System.json / Absorb.rpgmvp).
const KEY = Buffer.from('f05da1b7948705812a3812af1bab7eef', 'hex');
const HEADER = Buffer.from('5250474d560000000003010000000000', 'hex');
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.from('000003c0000003c00803000000cd08e0', 'hex'), Buffer.from('reste du fichier')]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40, 7)]);

/** Chiffre comme RPG Maker MV : en-tête, puis 16 premiers octets XOR la clé. */
function encrypt(data: Buffer, key = KEY): Buffer {
  const body = Buffer.from(data);
  for (let i = 0; i < 16; i++) body[i] ^= key[i];
  return Buffer.concat([HEADER, body]);
}

let root: string;
let web: string;
beforeEach(() => {
  root = makeTempDir();
  web = path.join(root, 'www');
  fs.mkdirSync(path.join(web, 'data'), { recursive: true });
});
afterEach(() => removeTempDir(root));

const put = (rel: string, data: Buffer | string) => {
  fs.mkdirSync(path.dirname(path.join(web, rel)), { recursive: true });
  fs.writeFileSync(path.join(web, rel), data);
};

describe('ressources RPG Maker MV/MZ', () => {
  it('déchiffre l’échantillon réel : les 16 premiers octets redonnent l’en-tête PNG', () => {
    const real = Buffer.from('5250474d5600000000030100000000007' + '90deff0998d1f8b2a3812a252e33abd', 'hex');
    expect(decryptAsset(real, KEY).toString('hex')).toBe('89504e470d0a1a0a0000000d49484452');
    expect(keyFromEncryptedPng(real)).toEqual(KEY);
  });

  it('noms et fichiers repérés (MV et MZ), sans les sauvegardes', () => {
    expect(decryptedName('img/faces/Actor1.rpgmvp')).toBe('img/faces/Actor1.png');
    expect(decryptedName('audio/bgm/Theme.ogg_')).toBe('audio/bgm/Theme.ogg');
    expect(decryptedName('audio/se/Cursor.RPGMVM')).toBe('audio/se/Cursor.m4a');
    put('img/a.rpgmvp', encrypt(PNG));
    put('img/b.png', PNG);
    put('save/file1.rpgsave', 'x');
    put('save/odd.png_', encrypt(PNG));
    expect(listEncryptedAssets(web)).toEqual([path.join('img', 'a.rpgmvp')]);
  });

  it('extrait images et sons dans le dossier de sortie, clé de System.json', async () => {
    fs.writeFileSync(path.join(web, 'data', 'System.json'), JSON.stringify({ encryptionKey: KEY.toString('hex'), hasEncryptedImages: true }));
    put('img/pictures/a1.rpgmvp', encrypt(PNG));
    put('audio/bgm/Theme.ogg_', encrypt(OGG));
    const out = path.join(root, 'out');
    const progress: number[] = [];
    const result = await extractRpgMakerAssets(web, out, done => progress.push(done));
    expect(result).toEqual({ files: 2, keySource: 'system', failed: [] });
    expect(listTree(out)).toEqual(['audio/bgm/Theme.ogg', 'img/pictures/a1.png']);
    expect(fs.readFileSync(path.join(out, 'img/pictures/a1.png'))).toEqual(PNG);
    expect(fs.readFileSync(path.join(out, 'audio/bgm/Theme.ogg'))).toEqual(OGG);
    expect(progress.at(-1)).toBe(2);
    // Le jeu n'est pas touché.
    expect(fs.existsSync(path.join(web, 'img/pictures/a1.rpgmvp'))).toBe(true);
  });

  it('clé factice ou absente dans System.json : déduite d’une image', () => {
    put('img/a.rpgmvp', encrypt(PNG));
    fs.writeFileSync(path.join(web, 'data', 'System.json'), JSON.stringify({ encryptionKey: '00'.repeat(16) }));
    expect(chooseKey(web, listEncryptedAssets(web))).toEqual({ key: KEY, source: 'image' });
    fs.writeFileSync(path.join(web, 'data', 'System.json'), '{}');
    expect(chooseKey(web, listEncryptedAssets(web))).toEqual({ key: KEY, source: 'image' });
  });

  it('un fichier mal formé est compté en échec sans arrêter les autres', async () => {
    put('img/a.rpgmvp', encrypt(PNG));
    put('img/broken.rpgmvp', 'pas RPGMV du tout');
    const result = await extractRpgMakerAssets(web, path.join(root, 'out'));
    expect(result.files).toBe(1);
    expect(result.failed).toEqual([path.join('img', 'broken.rpgmvp')]);
  });

  it('rien de chiffré : message clair', async () => {
    put('img/plain.png', PNG);
    await expect(extractRpgMakerAssets(web, path.join(root, 'out'))).rejects.toThrow(/Aucune ressource chiffrée/);
  });
});
