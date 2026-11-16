import { afterEach, describe, expect, it, vi } from 'vitest';
import { importPercent } from '../../src/renderer/src/lib/importProgress';
import { scanGames } from '../../src/renderer/src/lib/gameScanner';

describe('importPercent', () => {
  it.each([
    [{ index: 1, total: 1, percent: 0 }, 0],
    [{ index: 1, total: 1, percent: 42 }, 42],
    [{ index: 1, total: 2, percent: 100 }, 50],
    [{ index: 2, total: 2, percent: 50 }, 75],
    [{ index: 3, total: 3, percent: 100 }, 100],
    // Valeurs incohérentes : jamais hors de 0–100.
    [{ index: 5, total: 2, percent: 250 }, 100],
    [{ index: 1, total: 0, percent: 50 }, 0],
    [{ index: 1, total: 1, percent: Number.NaN }, 0]
  ])('%o → %i', (progress, expected) => {
    expect(importPercent({ file: 'a.zip', ...progress })).toBe(expected);
  });
});

describe('scanGames (affichage au fil du scan)', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("annonce les dossiers avant tout fetch, puis chaque fiche dès qu'elle est écrite — avant ses images", async () => {
    const cache: Record<string, Record<string, unknown>> = { RJ000001: { work_name: 'Déjà là', imagesComplete: true } };
    const events: string[] = [];
    (globalThis as unknown as { window: unknown }).window = {
      electronAPI: {
        listGameFolders: vi.fn(async () => ['RJ000001', 'RJ000002']),
        getCache: vi.fn(async () => structuredClone(cache)),
        fetchGameMetadata: vi.fn(async (gameId: string) => {
          events.push(`fetch ${gameId}`);
          return { work_name: 'Nouveau' };
        }),
        replaceCacheEntry: vi.fn(async (gameId: string, data: Record<string, unknown>) => {
          cache[gameId] = data;
        }),
        updateCacheEntry: vi.fn(async (gameId: string, patch: Record<string, unknown>) => {
          cache[gameId] = { ...cache[gameId], ...patch };
          return true;
        }),
        downloadGameImages: vi.fn(async (gameId: string) => {
          events.push(`images ${gameId}`);
          return true;
        })
      }
    };

    const result = await scanGames({
      onFolders: folders => void events.push(`folders ${folders.join(',')}`),
      // L'état du cache au moment du rappel : c'est ce que l'interface relit.
      onEntryChanged: gameId => void events.push(`changed ${gameId} images=${cache[gameId]?.imagesComplete === true}`)
    });

    expect(result).toEqual({ status: 'ok', gameFolders: ['RJ000001', 'RJ000002'] });
    expect(events).toEqual([
      'folders RJ000001,RJ000002',
      'fetch RJ000002',
      'changed RJ000002 images=false',
      'images RJ000002',
      'changed RJ000002 images=true'
    ]);
  });
});
