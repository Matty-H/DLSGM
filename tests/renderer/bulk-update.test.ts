import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isManuallyEdited, updateAllMetadata } from '../../src/renderer/src/lib/dataFetcher';
import { matchesCreator } from '../../src/renderer/src/lib/filterManager';
import type { GameCacheEntry } from '../../src/renderer/src/lib/cacheManager';

type Cache = Record<string, Record<string, unknown>>;
let cache: Cache;

// Faux `window.electronAPI` : le cache vit ici, les mises à jour fusionnent
// comme Store.update côté main (jamais de création d'entrée).
function installElectronApi(fetchImpl: (gameId: string) => Promise<Record<string, unknown>>) {
  const api = {
    getSettings: vi.fn(async () => ({ language: 'en_US' })),
    getCache: vi.fn(async () => structuredClone(cache)),
    updateCacheEntry: vi.fn(async (gameId: string, patch: Record<string, unknown>) => {
      if (!cache[gameId]) return false;
      cache[gameId] = { ...cache[gameId], ...patch };
      return true;
    }),
    fetchGameMetadata: vi.fn(fetchImpl)
  };
  (globalThis as unknown as { window: unknown }).window = { electronAPI: api };
  return api;
}

beforeEach(() => {
  cache = {
    RJ1: {
      work_name: '理想のひきこもり生活', circle: '猫3', author: ['猫3'], work_image: '//img/cover.jpg',
      sample_images: ['manual', '//img/2.jpg'], rating: 5, customTags: ['x'], totalPlayTime: 100, collections: ['c1']
    },
    RJ2: { work_name: 'Édité', circle: 'Moi', author: 'Moi' }, // ancien format du formulaire d'édition
    RJ3: { work_name: 'Édité aussi', author: ['A'], manuallyEdited: true },
    RJ4: { work_name: 'RJ4', fetchFailed: true },
    RJ5: { work_name: 'Retiré de DLsite', circle: 'cat 3', author: ['猫3'] }
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('isManuallyEdited', () => {
  it('reconnaît le drapeau et l’ancien format (author en texte)', () => {
    expect(isManuallyEdited(cache.RJ2 as GameCacheEntry)).toBe(true);
    expect(isManuallyEdited(cache.RJ3 as GameCacheEntry)).toBe(true);
    expect(isManuallyEdited(cache.RJ1 as GameCacheEntry)).toBe(false);
  });
});

describe('updateAllMetadata', () => {
  it('met à jour dans la langue choisie sans toucher aux images ni aux données perso', async () => {
    const api = installElectronApi(async gameId => {
      if (gameId === 'RJ5') throw new Error("Error invoking remote method 'fetch-game-metadata': Error: Aucune donnée product-info pour RJ5");
      return { work_name: 'Ideal Shut-in Life', circle: 'cat 3', maker_id: 'RG01001209', author: ['猫3'], work_image: '//img/new.jpg', sample_images: ['//img/a.jpg'] };
    });

    const result = await updateAllMetadata();

    expect(api.fetchGameMetadata).toHaveBeenCalledWith('RJ1');
    expect(result.updated).toEqual(['RJ1']);
    expect(result.skipped.sort()).toEqual(['RJ2', 'RJ3', 'RJ4']);
    expect(result.failed).toEqual([{ gameId: 'RJ5', error: 'Aucune donnée product-info pour RJ5' }]);

    expect(cache.RJ1).toMatchObject({
      work_name: 'Ideal Shut-in Life', circle: 'cat 3', maker_id: 'RG01001209',
      // Images inchangées (éditions manuelles comprises)...
      work_image: '//img/cover.jpg', sample_images: ['manual', '//img/2.jpg'],
      // ...et données personnelles conservées.
      rating: 5, customTags: ['x'], totalPlayTime: 100, collections: ['c1']
    });
    // Fiches ignorées ou en échec : strictement inchangées.
    expect(cache.RJ2).toEqual({ work_name: 'Édité', circle: 'Moi', author: 'Moi' });
    expect(cache.RJ5).toEqual({ work_name: 'Retiré de DLsite', circle: 'cat 3', author: ['猫3'] });
  });

  it("s'arrête proprement quand on l'interrompt", async () => {
    installElectronApi(async () => ({ work_name: 'x' }));
    const result = await updateAllMetadata({ isCancelled: () => true });
    expect(result.cancelled).toBe(true);
    expect(result.updated).toEqual([]);
  });
});

describe('matchesCreator', () => {
  const byId = { field: 'circle' as const, value: '猫3', makerId: 'RG01001209' };
  it('rapproche un même cercle nommé différemment selon la langue', () => {
    expect(matchesCreator({ circle: 'cat 3', maker_id: 'RG01001209' } as GameCacheEntry, byId)).toBe(true);
    expect(matchesCreator({ circle: '猫3', maker_id: 'RG09999999' } as GameCacheEntry, byId)).toBe(false);
  });
  it("retombe sur le nom (japonais ou anglais) quand l'identifiant manque", () => {
    expect(matchesCreator({ circle: '猫3' } as GameCacheEntry, byId)).toBe(true);
    expect(matchesCreator({ circle: 'cat 3' } as GameCacheEntry, byId)).toBe(false);
    // Fiche restreinte en Europe, jamais mise à jour : son nom anglais est celui du cercle cliqué.
    expect(matchesCreator({ circle: 'cat 3' } as GameCacheEntry, { ...byId, otherNames: ['cat 3'] })).toBe(true);
    expect(matchesCreator({ circle: 'Autre', circle_en: '猫3' } as GameCacheEntry, { field: 'circle', value: '猫3' })).toBe(true);
  });
});
