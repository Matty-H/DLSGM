import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

import Store from '../../src/main/store';
import { GenreTranslations, pairsFromAliasGroups } from '../../src/main/genre-translations';

let translations: GenreTranslations;

beforeEach(async () => {
  electron.userData = makeTempDir();
  const store = new Store('translations.db', {});
  await store.getAll(); // chargement terminé avant le test
  translations = new GenreTranslations(store);
});

afterEach(() => removeTempDir(electron.userData));

describe('GenreTranslations', () => {
  it('apprend les traductions de DLsite et les met à jour', async () => {
    await translations.learn({ '3D作品': '3D Work' });
    await translations.learn({ '3D作品': '3D Works', 'アナル': 'Anal' });
    expect(await translations.all()).toEqual({
      '3D作品': { en: '3D Works', manual: false },
      'アナル': { en: 'Anal', manual: false }
    });
  });

  it("ne remplace jamais une traduction manuelle, jusqu'à ce qu'on la retire", async () => {
    await translations.setManual('中出し', 'Creampie');
    await translations.learn({ '中出し': 'Internal Cumshot' });
    expect((await translations.all())['中出し']).toEqual({ en: 'Creampie', manual: true });

    await translations.setManual('中出し', null);
    await translations.learn({ '中出し': 'Internal Cumshot' });
    expect((await translations.all())['中出し']).toEqual({ en: 'Internal Cumshot', manual: false });
  });

  it("l'amorçage n'écrase rien d'existant", async () => {
    await translations.setManual('処女', 'Virgin');
    await translations.seed({ '処女': 'Virgin Female', 'おさわり': 'Touch / Feel' });
    expect(await translations.all()).toEqual({
      '処女': { en: 'Virgin', manual: true },
      'おさわり': { en: 'Touch / Feel', manual: false }
    });
  });
});

describe('pairsFromAliasGroups', () => {
  it('reprend les anciens genres liés (anglais d’abord ou japonais d’abord)', () => {
    expect(pairsFromAliasGroups([['Anal', 'アナル'], ['巨乳/爆乳', 'Big Breasts'], ['A', 'B'], 'bruit'])).toEqual({
      'アナル': 'Anal',
      '巨乳/爆乳': 'Big Breasts'
    });
    expect(pairsFromAliasGroups(undefined)).toEqual({});
  });
});
