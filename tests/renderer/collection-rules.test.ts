import { describe, expect, it } from 'vitest';
import {
  buildShelves,
  collectRuleValues,
  describeCondition,
  isInCollectionByRulesOnly,
  matchesCollectionFilter,
  matchesRules,
  shelfSize,
  updateShelfPrefs,
  userFilter,
  withRules,
  type CollectionRules
} from '../../src/renderer/src/lib/collections';
import { matchesFilters } from '../../src/renderer/src/lib/filterManager';
import { IDENTITY_GENRE_NAMES, makeGenreNames } from '../../src/renderer/src/lib/genreNames';
import { buildProxyUrl, parseProxyForm, proxyFormError, PASSWORD_MASK } from '../../src/renderer/src/lib/proxyForm';
import type { GameCacheEntry } from '../../src/renderer/src/lib/cacheManager';

const game = (fields: Record<string, unknown>): GameCacheEntry => ({ work_name: 'Jeu', genre: [], category: 'RPG', ...fields }) as unknown as GameCacheEntry;
const names = IDENTITY_GENRE_NAMES;

describe('règles de collection', () => {
  // (tag X ET cercle Y) OU (tag Z), jamais l'auteur A.
  const rules: CollectionRules = {
    groups: [
      [
        { field: 'genre', value: 'X' },
        { field: 'circle', value: 'Y', makerId: 'RG1' }
      ],
      [{ field: 'genre', value: 'Z' }]
    ],
    exclude: [{ field: 'author', value: 'A' }]
  };

  it('OU entre groupes, ET dans un groupe, exclusions globales', () => {
    expect(matchesRules(game({ genre: ['X'], circle: 'Y', maker_id: 'RG1' }), rules, names)).toBe(true);
    expect(matchesRules(game({ genre: ['X'], circle: 'Autre', maker_id: 'RG9' }), rules, names)).toBe(false);
    expect(matchesRules(game({ genre: ['Z'] }), rules, names)).toBe(true);
    expect(matchesRules(game({ genre: ['Z'], author: ['A', 'B'] }), rules, names)).toBe(false);
  });

  it('cercle reconnu par son identifiant DLsite, quelle que soit la langue du nom', () => {
    expect(matchesRules(game({ genre: ['X'], circle: 'cat 3', maker_id: 'RG1' }), rules, names)).toBe(true);
  });

  it('condition « sans » dans un groupe', () => {
    const r: CollectionRules = { groups: [[{ field: 'genre', value: 'X' }, { field: 'customTag', value: 'bof', negate: true }]], exclude: [] };
    expect(matchesRules(game({ genre: ['X'] }), r, names)).toBe(true);
    expect(matchesRules(game({ genre: ['X'], customTags: ['bof'] }), r, names)).toBe(false);
  });

  it('fini / pas fini', () => {
    const finished: CollectionRules = { groups: [[{ field: 'completed', value: 'true' }]], exclude: [] };
    const unfinished: CollectionRules = { groups: [[{ field: 'completed', value: 'true', negate: true }]], exclude: [] };
    expect(matchesRules(game({ completed: true }), finished, names)).toBe(true);
    expect(matchesRules(game({}), finished, names)).toBe(false);
    expect(matchesRules(game({}), unfinished, names)).toBe(true);
    expect(describeCondition({ field: 'completed', value: 'true', negate: true })).toBe('Pas fini');
  });

  it('temps de jeu : au moins N minutes, ou moins de N avec « sans »', () => {
    const atLeast2h: CollectionRules = { groups: [[{ field: 'playTime', value: '120' }]], exclude: [] };
    const under2h: CollectionRules = { groups: [[{ field: 'playTime', value: '120', negate: true }]], exclude: [] };
    expect(matchesRules(game({ totalPlayTime: 7200 }), atLeast2h, names)).toBe(true);
    expect(matchesRules(game({ totalPlayTime: 7199 }), atLeast2h, names)).toBe(false);
    expect(matchesRules(game({}), under2h, names)).toBe(true);
    // Exclusion : « toujours exclure au moins 2 h ».
    const tagButShort: CollectionRules = { groups: [[{ field: 'genre', value: 'X' }]], exclude: [{ field: 'playTime', value: '120' }] };
    expect(matchesRules(game({ genre: ['X'], totalPlayTime: 9000 }), tagButShort, names)).toBe(false);
    expect(describeCondition({ field: 'playTime', value: '90' })).toBe('Temps de jeu ≥ 1 h 30');
    expect(describeCondition({ field: 'playTime', value: '45', negate: true })).toBe('Temps de jeu < 45 min');
    expect(collectRuleValues([game({ totalPlayTime: 10 })], 'playTime', names)).toEqual([]);
  });

  it("sans groupe non vide, les règles n'ajoutent rien (pas toute la bibliothèque)", () => {
    expect(matchesRules(game({}), { groups: [[]], exclude: [{ field: 'author', value: 'A' }] }, names)).toBe(false);
    expect(matchesRules(game({}), undefined, names)).toBe(false);
  });

  it('tags comparés sur la clé japonaise, y compris un ancien genre anglais', () => {
    const genreNames = makeGenreNames({ 'アナル': { en: 'Anal', manual: false } }, 'en_US');
    const r: CollectionRules = { groups: [[{ field: 'genre', value: 'アナル' }]], exclude: [] };
    expect(matchesRules(game({ genre: ['Anal'] }), r, genreNames)).toBe(true);
  });

  it('appartenance = ajout manuel OU règles, dans le filtre de la bibliothèque et les étagères', () => {
    const collection = { id: 'c1', name: 'Z', rules };
    const manual = game({ collections: ['c1'] });
    const byRules = game({ genre: ['Z'] });
    const neither = game({});
    const context = { collections: [collection], genreNames: names };
    expect(matchesCollectionFilter(manual, userFilter('c1'), context)).toBe(true);
    expect(matchesCollectionFilter(byRules, userFilter('c1'), context)).toBe(true);
    expect(matchesCollectionFilter(neither, userFilter('c1'), context)).toBe(false);
    expect(isInCollectionByRulesOnly(byRules, collection, names)).toBe(true);
    expect(isInCollectionByRulesOnly(manual, collection, names)).toBe(false);

    const filters = {
      selectedCategoryCode: 'all',
      searchTerm: '',
      selectedGenres: [],
      selectedRating: 0,
      genreNames: names,
      creatorFilter: null,
      collectionFilter: userFilter('c1'),
      collections: [collection]
    };
    expect(matchesFilters(byRules, filters)).toBe(true);

    const shelves = buildShelves(
      [
        { id: 'RJ1', data: byRules },
        { id: 'RJ2', data: neither }
      ],
      [collection]
    );
    expect(shelves.find(s => s.key === 'user:c1')!.games.map(g => g.id)).toEqual(['RJ1']);
  });

  it('withRules retire les groupes vides, et la clé quand il ne reste rien', () => {
    expect(withRules({ id: 'c', name: 'n' }, { groups: [[]], exclude: [] })).toEqual({ id: 'c', name: 'n' });
    expect(withRules({ id: 'c', name: 'n' }, { groups: [[], [{ field: 'genre', value: 'X' }]], exclude: [] }).rules!.groups).toHaveLength(1);
  });

  it('valeurs proposées : cercles regroupés par identifiant, les plus fréquents en tête', () => {
    const values = collectRuleValues(
      [game({ circle: '猫3', maker_id: 'RG1' }), game({ circle: 'cat 3', maker_id: 'RG1' }), game({ circle: 'Autre', maker_id: 'RG2' })],
      'circle',
      names
    );
    expect(values.map(v => [v.makerId, v.count])).toEqual([
      ['RG1', 2],
      ['RG2', 1]
    ]);
  });
});

describe('étagères de l’accueil', () => {
  it('étagère masquée omise, taille par défaut variée ou choisie', () => {
    const games = [{ id: 'RJ1', data: game({ lastPlayed: '2026-01-01', addedDate: '2026-01-01' }) }];
    const prefs = updateShelfPrefs({}, 'recent', { hidden: true });
    const shelves = buildShelves(games, [], { prefs });
    expect(shelves.some(s => s.key === 'recent')).toBe(false);
    expect(shelves.find(s => s.key === 'added')!.size).toBe('medium');
    expect(shelfSize('recent')).toBe('large');
    expect(shelfSize('added', updateShelfPrefs({}, 'added', { size: 'small' }))).toBe('small');
  });

  it('une étagère revenue aux réglages par défaut disparaît des préférences', () => {
    const hidden = updateShelfPrefs({}, 'recent', { hidden: true });
    expect(updateShelfPrefs(hidden, 'recent', { hidden: false })).toEqual({});
    expect(updateShelfPrefs({}, 'recent', { size: 'large' })).toEqual({});
  });
});

describe('formulaire du proxy', () => {
  it('encode les identifiants et relit la même adresse', () => {
    const form = { type: 'socks5' as const, host: '1.2.3.4', port: '1080', username: 'moi@x', password: 'p:ss/@', hasStoredPassword: false };
    const url = buildProxyUrl(form);
    expect(url).toBe('socks5://moi%40x:p%3Ass%2F%40@1.2.3.4:1080');
    expect(parseProxyForm(url)).toMatchObject({ username: 'moi@x', password: 'p:ss/@' });
  });

  it('mot de passe enregistré : champ vide = masque (inchangé côté main)', () => {
    const stored = `socks5://moi:${PASSWORD_MASK}@hote:1080`;
    const form = parseProxyForm(stored)!;
    expect(form).toMatchObject({ password: '', hasStoredPassword: true });
    expect(buildProxyUrl(form, form.username)).toBe(stored);
    // Autre identifiant : l'ancien mot de passe ne le suit pas.
    expect(buildProxyUrl({ ...form, username: 'autre' }, 'moi')).toBe('socks5://autre@hote:1080');
  });

  it('IPv6 entre crochets, aucun proxy = vide, erreurs lisibles', () => {
    expect(buildProxyUrl({ type: 'http', host: '::1', port: '8080', username: '', password: '', hasStoredPassword: false })).toBe('http://[::1]:8080');
    expect(buildProxyUrl({ type: '', host: 'x', port: '1', username: '', password: '', hasStoredPassword: false })).toBe('');
    expect(proxyFormError({ type: 'http', host: 'h', port: '70000', username: '', password: '', hasStoredPassword: false })).toMatch(/Port/);
    expect(proxyFormError({ type: 'http', host: 'h', port: '80', username: '', password: 'x', hasStoredPassword: false })).toMatch(/identifiant/);
  });
});
