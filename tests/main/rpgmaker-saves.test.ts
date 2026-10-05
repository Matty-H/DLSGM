import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import LZString from 'lz-string';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir, writeTree } from '../helpers';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

import { applySavePatch, decodeSave, encodeSave, listSaveSlots, readSave, saveFormat, writeSave } from '../../src/main/rpgmaker-saves';

let web: string;
let saveDir: string;

beforeEach(() => {
  web = makeTempDir();
  saveDir = path.join(web, 'save');
  writeTree(web, {
    'data/Items.json': JSON.stringify([null, { id: 1, name: 'Potion' }, { id: 2, name: '' }, { id: 3, name: 'Clé' }]),
    'data/Weapons.json': JSON.stringify([null, { id: 1, name: 'Épée' }]),
    'data/Armors.json': JSON.stringify([null]),
    'data/System.json': JSON.stringify({ variables: ['', 'Argent caché', 'Chapitre'], switches: ['', 'Porte ouverte'] })
  });
});

afterEach(() => removeTempDir(web));

/** Sauvegarde MV telle que l'écrit JsonEx : tableaux enveloppés `@a`, références `@c`. */
const mvSave = () => ({
  system: { '@c': 2, '@': 'Game_System' },
  switches: { _data: { '@c': 4, '@a': [null, false] }, '@c': 3, '@': 'Game_Switches' },
  variables: { _data: { '@c': 6, '@a': [null, 0, 'Ch.1'] }, '@c': 5, '@': 'Game_Variables' },
  party: { _gold: 500, _items: { '1': 3, '@c': 8 }, _weapons: { '@c': 9 }, _armors: { '@c': 10 }, '@c': 7, '@': 'Game_Party' },
  '@c': 1
});

/** Sauvegarde MZ : tableaux simples, pas de `@c`. */
const mzSave = () => ({
  switches: { _data: [null, true], '@': 'Game_Switches' },
  variables: { _data: [null, 12], '@': 'Game_Variables' },
  party: { _gold: 0, _items: { '3': 1 }, _weapons: {}, _armors: {}, '@': 'Game_Party' }
});

/** Fichier MZ écrit comme le fait le jeu : chaîne binaire de pako, enregistrée en UTF-8. */
const writeMz = (file: string, data: unknown) => {
  const binary = zlib.deflateSync(Buffer.from(JSON.stringify(data), 'utf8')).toString('latin1');
  writeTree(saveDir, { [file]: '' });
  fs.writeFileSync(path.join(saveDir, file), binary);
};

describe('rpgmaker saves', () => {
  it('recognizes only numbered slot files', () => {
    expect(saveFormat('file1.rpgsave')).toBe('mv');
    expect(saveFormat('file12.rmmzsave')).toBe('mz');
    expect(saveFormat('global.rpgsave')).toBeNull();
    expect(saveFormat('../file1.rpgsave')).toBeNull();
  });

  it('decodes MV (LZString base64) and MZ (deflate stored as UTF-8) and round-trips', () => {
    const mv = Buffer.from(LZString.compressToBase64(JSON.stringify(mvSave())), 'utf8');
    expect(decodeSave(mv, 'mv')).toEqual(mvSave());
    expect(decodeSave(encodeSave(mvSave(), 'mv'), 'mv')).toEqual(mvSave());

    writeMz('file1.rmmzsave', mzSave());
    // Octets ≥ 0x80 du flux zlib : écrits en deux octets UTF-8, ce que decodeSave doit défaire.
    expect(decodeSave(fs.readFileSync(path.join(saveDir, 'file1.rmmzsave')), 'mz')).toEqual(mzSave());
    expect(decodeSave(encodeSave(mzSave(), 'mz'), 'mz')).toEqual(mzSave());
  });

  it('describes a save with the database names, listing owned and named entries', () => {
    writeTree(saveDir, { 'file1.rpgsave': LZString.compressToBase64(JSON.stringify(mvSave())) });
    const data = readSave(saveDir, web, 'file1.rpgsave');
    expect(data.gold).toBe(500);
    expect(data.items).toEqual([
      { id: 1, name: 'Potion', value: 3 },
      { id: 3, name: 'Clé', value: 0 }
    ]);
    expect(data.weapons).toEqual([{ id: 1, name: 'Épée', value: 0 }]);
    expect(data.variables).toEqual([
      { id: 1, name: 'Argent caché', value: 0 },
      { id: 2, name: 'Chapitre', value: 'Ch.1' }
    ]);
    expect(data.switches).toEqual([{ id: 1, name: 'Porte ouverte', value: false }]);
  });

  it('edits values in place, keeping JsonEx metadata, and removes items set to 0', () => {
    const data = mvSave();
    applySavePatch(data, { gold: 1e12, items: { '1': 0, '3': 5 }, weapons: { '1': 2 }, variables: { '1': 42, '5': 'x' }, switches: { '1': true } });
    expect(data.party).toEqual({ _gold: 999_999_999, _items: { '3': 5, '@c': 8 }, _weapons: { '1': 2, '@c': 9 }, _armors: { '@c': 10 }, '@c': 7, '@': 'Game_Party' });
    expect(data.variables._data).toEqual({ '@c': 6, '@a': [null, 42, 'Ch.1', null, null, 'x'] });
    expect(data.switches._data).toEqual({ '@c': 4, '@a': [null, true] });
  });

  it('rejects invalid ids, values and shared references', () => {
    expect(() => applySavePatch(mvSave(), { items: { '-1': 2 } })).toThrow();
    expect(() => applySavePatch(mvSave(), { switches: { '1': 'oui' as unknown as boolean } })).toThrow();
    const shared = mvSave();
    (shared.party as Record<string, unknown>)._items = { '@r': 8 };
    expect(() => applySavePatch(shared, { items: { '1': 2 } })).toThrow();
    expect(() => applySavePatch({ foo: 1 }, { gold: 1 })).toThrow();
  });

  it('writes an MZ save the game can read back, and lists slots', () => {
    writeMz('file1.rmmzsave', mzSave());
    writeMz('file0.rmmzsave', mzSave());
    writeTree(saveDir, { 'global.rmmzsave': 'x' });
    const result = writeSave(saveDir, web, 'file1.rmmzsave', { gold: 77, switches: { '1': false } });
    expect(result.gold).toBe(77);
    const back = decodeSave(fs.readFileSync(path.join(saveDir, 'file1.rmmzsave')), 'mz') as ReturnType<typeof mzSave>;
    expect(back.party._gold).toBe(77);
    expect(back.switches._data).toEqual([null, false]);
    expect(fs.existsSync(path.join(saveDir, 'file1.rmmzsave.tmp'))).toBe(false);
    expect(listSaveSlots(saveDir).map(s => s.file).sort()).toEqual(['file0.rmmzsave', 'file1.rmmzsave']);
  });

  it('refuses a file outside the save folder', () => {
    expect(() => readSave(saveDir, web, '..\\file1.rpgsave')).toThrow();
  });
});
