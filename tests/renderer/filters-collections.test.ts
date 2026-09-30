import { describe, expect, it } from 'vitest';
import { compareGames, creatorValues, matchesFilters, type GameFilters } from '../../src/renderer/src/lib/filterManager';
import {
  ALL_COLLECTIONS,
  addCollection,
  buildShelves,
  matchesCollectionFilter,
  matchesSmartCollection,
  moveCollection,
  normalizeCollectionFilter,
  removeCollection,
  renameCollection,
  smartFilter,
  toggleGameCollection,
  userFilter
} from '../../src/renderer/src/lib/collections';
import type { GameCacheEntry } from '../../src/renderer/src/lib/cacheManager';
import { IDENTITY_GENRE_NAMES, makeGenreNames } from '../../src/renderer/src/lib/genreNames';

const game = (fields: Partial<GameCacheEntry> & Record<string, unknown>): GameCacheEntry =>
  ({ work_name: 'Jeu', genre: [], category: 'RPG', ...fields }) as GameCacheEntry;

const noFilters: GameFilters = {
  selectedCategoryCode: 'all',
  searchTerm: '',
  selectedGenres: [],
  selectedRating: 0,
  genreNames: IDENTITY_GENRE_NAMES,
  creatorFilter: null,
  collectionFilter: ALL_COLLECTIONS
};

describe('matchesFilters', () => {
  it('filtre par cercle / auteur en correspondance exacte (chaîne ou liste)', () => {
    const g = game({ circle: '猫3', author: ['Auteur Un', 'Auteur Deux'] });
    expect(matchesFilters(g, { ...noFilters, creatorFilter: { field: 'circle', value: '猫3' } })).toBe(true);
    expect(matchesFilters(g, { ...noFilters, creatorFilter: { field: 'circle', value: '猫' } })).toBe(false);
    expect(matchesFilters(g, { ...noFilters, creatorFilter: { field: 'author', value: 'Auteur Deux' } })).toBe(true);
    expect(matchesFilters(g, { ...noFilters, creatorFilter: { field: 'series', value: 'x' } })).toBe(false);
  });

  it('filtre sur la clé japonaise, y compris pour une ancienne fiche aux genres anglais', () => {
    const genreNames = makeGenreNames({ 'アナル': { en: 'Anal', manual: false } }, 'en_US');
    const japanese = game({ genre: ['アナル'] });
    const legacyEnglish = game({ genre: ['Anal'] });
    for (const g of [japanese, legacyEnglish]) {
      expect(matchesFilters(g, { ...noFilters, selectedGenres: ['アナル'], genreNames })).toBe(true);
    }
    // Sans dictionnaire, l'ancien genre anglais n'est pas rapproché.
    expect(matchesFilters(legacyEnglish, { ...noFilters, selectedGenres: ['アナル'] })).toBe(false);
  });

  it('la recherche trouve aussi le titre et le cercle anglais', () => {
    const g = game({ work_name: '亜人檻', work_name_en: 'Demi-Cage', circle: '猫3', circle_en: 'cat 3' });
    expect(matchesFilters(g, { ...noFilters, searchTerm: 'demi' })).toBe(true);
    expect(matchesFilters(g, { ...noFilters, searchTerm: 'cat 3' })).toBe(true);
  });

  it('cherche dans le titre, le cercle, les auteurs et les tags', () => {
    const g = game({ work_name: 'Grande Aventure', circle: 'Alpha', customTags: ['favori'] });
    for (const term of ['aventure', 'alpha', 'favori']) expect(matchesFilters(g, { ...noFilters, searchTerm: term })).toBe(true);
    expect(matchesFilters(g, { ...noFilters, searchTerm: 'zzz' })).toBe(false);
  });

  it('applique le filtre de collection', () => {
    const g = game({ collections: ['c1'] });
    expect(matchesFilters(g, { ...noFilters, collectionFilter: userFilter('c1') })).toBe(true);
    expect(matchesFilters(g, { ...noFilters, collectionFilter: userFilter('c2') })).toBe(false);
  });
});

describe('creatorValues', () => {
  it('ignore les valeurs vides', () => {
    expect(creatorValues(game({ author: ['A', '', ' '] }), 'author')).toEqual(['A']);
    expect(creatorValues(game({ circle: null }), 'circle')).toEqual([]);
  });
});

describe('compareGames', () => {
  const a = { id: 'RJ1', data: game({ work_name: 'Alpha', lastPlayed: '2026-01-02', totalPlayTime: 10 }) };
  const b = { id: 'RJ2', data: game({ work_name: 'Beta', lastPlayed: '2026-01-05', totalPlayTime: 50 }) };
  it.each([
    ['name_asc', ['RJ1', 'RJ2']],
    ['name_desc', ['RJ2', 'RJ1']],
    ['last_played', ['RJ2', 'RJ1']],
    ['playtime_desc', ['RJ2', 'RJ1']]
  ])('%s', (sort, expected) => {
    expect([a, b].sort((x, y) => compareGames(x, y, sort)).map(g => g.id)).toEqual(expected);
  });
});

describe('collections automatiques', () => {
  it("« À finir » = du temps de jeu et pas fini ; un lancement non suivi n'est pas « jamais lancé »", () => {
    expect(matchesSmartCollection(game({ totalPlayTime: 60 }), 'to-finish')).toBe(true);
    expect(matchesSmartCollection(game({ totalPlayTime: 60, completed: true }), 'to-finish')).toBe(false);
    expect(matchesSmartCollection(game({}), 'to-finish')).toBe(false);
    expect(matchesSmartCollection(game({}), 'unplayed')).toBe(true);
    expect(matchesSmartCollection(game({ lastPlayed: '2026-01-01', totalPlayTime: 0 }), 'unplayed')).toBe(false);
    expect(matchesCollectionFilter(game({ completed: true }), smartFilter('completed'))).toBe(true);
  });
});

describe('gestion des collections', () => {
  it('refuse un nom vide ou en double (sans tenir compte de la casse)', () => {
    const first = addCollection([], '  Favoris  ')!;
    expect(first.created.name).toBe('Favoris');
    expect(addCollection(first.collections, 'favoris')).toBeNull();
    expect(addCollection(first.collections, '   ')).toBeNull();
    expect(renameCollection(first.collections, first.created.id, '')).toBeNull();
  });

  it('déplace et supprime', () => {
    const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(moveCollection(list, 'b', -1).map(c => c.id)).toEqual(['b', 'a']);
    expect(moveCollection(list, 'a', -1)).toBe(list);
    expect(removeCollection(list, 'a')).toEqual([{ id: 'b', name: 'B' }]);
  });

  it('un filtre vers une collection supprimée retombe sur « toutes »', () => {
    expect(normalizeCollectionFilter(userFilter('gone'), [])).toBe(ALL_COLLECTIONS);
    expect(normalizeCollectionFilter(userFilter('a'), [{ id: 'a', name: 'A' }])).toBe(userFilter('a'));
    expect(normalizeCollectionFilter(smartFilter('to-finish'), [])).toBe(smartFilter('to-finish'));
  });

  it('bascule un jeu dans une collection', () => {
    expect(toggleGameCollection(game({ collections: ['a'] }), 'a')).toEqual([]);
    expect(toggleGameCollection(game({}), 'a')).toEqual(['a']);
  });
});

describe('buildShelves', () => {
  const games = [
    { id: 'RJ1', data: game({ work_name: 'Joué', lastPlayed: '2026-01-05', totalPlayTime: 100, addedDate: '2026-01-01' }) },
    { id: 'RJ2', data: game({ work_name: 'Neuf', addedDate: '2026-01-10', collections: ['c1'] }) }
  ];

  it('omet les étagères automatiques vides, garde les collections vides', () => {
    const shelves = buildShelves(games, [{ id: 'c1', name: 'Favoris' }, { id: 'c2', name: 'Vide' }]);
    expect(shelves.map(s => s.key)).toEqual(['recent', 'to-finish', 'added', 'unplayed', 'user:c1', 'user:c2']);
    expect(shelves.find(s => s.key === 'added')!.games.map(g => g.id)).toEqual(['RJ2', 'RJ1']);
    expect(shelves.find(s => s.key === 'user:c2')!.total).toBe(0);
  });

  it('limite le nombre de jeux par étagère', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `RJ${i}`, data: game({ addedDate: `2026-01-${String(i + 1).padStart(2, '0')}` }) }));
    const added = buildShelves(many, [], 12).find(s => s.key === 'added')!;
    expect(added.games).toHaveLength(12);
    expect(added.total).toBe(20);
  });
});
