import { describe, expect, it } from 'vitest';
import { formatClock, formatInterval, formatRate, joinInterval, MIN_INTERVAL_MS, splitInterval, stepInterval } from '../../src/renderer/src/lib/autoClicker';
import { matchesFilters, type GameFilters } from '../../src/renderer/src/lib/filterManager';
import { ALL_COLLECTIONS, smartFilter } from '../../src/renderer/src/lib/collections';
import { IDENTITY_GENRE_NAMES } from '../../src/renderer/src/lib/genreNames';
import type { GameCacheEntry } from '../../src/renderer/src/lib/cacheManager';

describe('intervalle façon OP Auto Clicker', () => {
  it('découpe et recompose h / min / s / ms', () => {
    const parts = splitInterval(3_723_045);
    expect(parts).toEqual({ hours: 1, minutes: 2, seconds: 3, ms: 45 });
    expect(joinInterval(parts)).toBe(3_723_045);
  });

  it('jamais sous le minimum', () => {
    expect(joinInterval({ hours: 0, minutes: 0, seconds: 0, ms: 0 })).toBe(MIN_INTERVAL_MS);
    expect(joinInterval({ hours: -1, minutes: Number.NaN, seconds: 0, ms: 3 })).toBe(MIN_INTERVAL_MS);
  });

  it('résumé lisible', () => {
    expect(formatInterval(90_000)).toBe('1 min 30 s');
  });

  it('rythme du témoin', () => {
    expect(formatRate({ intervalMs: 100, double: false })).toBe('100 ms · 10/s');
    expect(formatRate({ intervalMs: 300, double: true })).toBe('300 ms · 6,7/s');
    expect(formatRate({ intervalMs: 2000, double: false })).toBe('2 s · 30/min');
    expect(formatRate({ intervalMs: 3_600_000, double: false })).toBe('1 h');
  });

  it('pas de −/+ du témoin, jamais sous le minimum', () => {
    expect(stepInterval(100, 1)).toBe(125);
    expect(stepInterval(100, -1)).toBe(95);
    expect(stepInterval(1000, 1)).toBe(1250);
    expect(stepInterval(10, -1)).toBe(MIN_INTERVAL_MS);
  });

  it('compteur de session', () => {
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('masquer les jeux finis', () => {
  const filters: GameFilters = {
    selectedCategoryCode: 'all',
    searchTerm: '',
    selectedGenres: [],
    selectedRating: 0,
    genreNames: IDENTITY_GENRE_NAMES,
    creatorFilter: null,
    collectionFilter: ALL_COLLECTIONS,
    collections: [],
    hideCompleted: true
  };
  const done = { work_name: 'Fini', genre: [], completed: true } as unknown as GameCacheEntry;
  const ongoing = { work_name: 'En cours', genre: [] } as unknown as GameCacheEntry;

  it('masque les finis, sauf dans la collection « Finis »', () => {
    expect(matchesFilters(done, filters)).toBe(false);
    expect(matchesFilters(ongoing, filters)).toBe(true);
    expect(matchesFilters(done, { ...filters, collectionFilter: smartFilter('completed') })).toBe(true);
    expect(matchesFilters(done, { ...filters, hideCompleted: false })).toBe(true);
  });
});
