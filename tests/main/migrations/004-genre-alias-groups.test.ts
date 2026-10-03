import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from '../../helpers';
import { genreAliasGroups, pairsFromAliasGroups } from '../../../src/main/migrations/004-genre-alias-groups';
import { openDataFile } from '../../../src/main/migrations/nedb';
import { migrationContext } from './context';

let root: string;
let userData: string;

beforeEach(() => {
  root = makeTempDir();
  userData = path.join(root, 'userData');
});

afterEach(() => removeTempDir(root));

describe('004 — anciens « genres liés »', () => {
  it('reprend les paires (anglais d’abord ou japonais d’abord)', () => {
    expect(pairsFromAliasGroups([['Anal', 'アナル'], ['巨乳/爆乳', 'Big Breasts'], ['A', 'B'], 'bruit'])).toEqual({
      'アナル': 'Anal',
      '巨乳/爆乳': 'Big Breasts'
    });
    expect(pairsFromAliasGroups(undefined)).toEqual({});
  });

  it('ajoute les paires au dictionnaire sans écraser une traduction existante, puis retire le réglage', async () => {
    const settings = await openDataFile(path.join(userData, 'settings.db'));
    await settings.insertAsync([
      { _id: 'genreAliasGroups', value: [['Anal', 'アナル'], ['Big Breasts', '巨乳']] },
      { _id: 'language', value: 'en' }
    ]);
    await settings.compactDatafileAsync();
    const translations = await openDataFile(path.join(userData, 'translations.db'));
    await translations.insertAsync({ _id: '巨乳', value: { en: 'Large Breasts', manual: true } });
    await translations.compactDatafileAsync();

    await genreAliasGroups.run(migrationContext(root));

    const dict = Object.fromEntries(
      (await (await openDataFile(path.join(userData, 'translations.db'))).findAsync({})).map(d => [d._id, d.value])
    );
    expect(dict).toEqual({ 'アナル': { en: 'Anal' }, '巨乳': { en: 'Large Breasts', manual: true } });
    const left = (await (await openDataFile(path.join(userData, 'settings.db'))).findAsync({})).map(d => d._id);
    expect(left).toEqual(['language']);
  });

  it('ne fait rien sans réglage à reprendre', async () => {
    await genreAliasGroups.run(migrationContext(root));
    expect(fs.existsSync(path.join(userData, 'translations.db'))).toBe(false);
  });
});
