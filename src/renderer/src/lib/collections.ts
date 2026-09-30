import type { GameCollection } from '../../../shared/ipc-types';
import type { GameCacheEntry } from './cacheManager.js';
import type { GameListItem } from './filterManager.js';

/**
 * Collections de jeux : collections créées par l'utilisateur (liste ordonnée
 * dans les paramètres, appartenance dans chaque fiche via `collections`) et
 * collections automatiques calculées à partir du temps de jeu. Sert au filtre
 * de la bibliothèque et aux étagères de l'accueil. Pur, sans DOM.
 */

export type { GameCollection };

export type SmartCollectionId = 'to-finish' | 'unplayed' | 'completed';

export const SMART_COLLECTIONS: { id: SmartCollectionId; label: string }[] = [
  { id: 'to-finish', label: 'À finir' },
  { id: 'unplayed', label: 'Jamais lancés' },
  { id: 'completed', label: 'Finis' }
];

/** Filtre de collection de la bibliothèque : 'all', 'smart:<id>' ou 'user:<id>'. */
export const ALL_COLLECTIONS = 'all';
export const smartFilter = (id: SmartCollectionId) => `smart:${id}`;
export const userFilter = (id: string) => `user:${id}`;

const playTimeOf = (game: GameCacheEntry) => (game.totalPlayTime as number) || 0;

export function matchesSmartCollection(game: GameCacheEntry, id: SmartCollectionId): boolean {
  switch (id) {
    // Commencé (du temps de jeu, pas un simple lancement non suivi) et pas marqué fini.
    case 'to-finish':
      return playTimeOf(game) > 0 && !game.completed;
    case 'unplayed':
      return playTimeOf(game) === 0 && !game.lastPlayed;
    case 'completed':
      return Boolean(game.completed);
  }
}

export function gameCollectionIds(game: GameCacheEntry): string[] {
  return Array.isArray(game.collections) ? game.collections : [];
}

export function matchesCollectionFilter(game: GameCacheEntry, filter: string): boolean {
  if (filter.startsWith('smart:')) return matchesSmartCollection(game, filter.slice(6) as SmartCollectionId);
  if (filter.startsWith('user:')) return gameCollectionIds(game).includes(filter.slice(5));
  return true;
}

/** Filtre encore valable (une collection supprimée ou inconnue retombe sur 'all'). */
export function normalizeCollectionFilter(filter: string, collections: GameCollection[]): string {
  if (filter.startsWith('smart:')) return SMART_COLLECTIONS.some(c => smartFilter(c.id) === filter) ? filter : ALL_COLLECTIONS;
  if (filter.startsWith('user:')) return collections.some(c => userFilter(c.id) === filter) ? filter : ALL_COLLECTIONS;
  return ALL_COLLECTIONS;
}

export function collectionFilterOptions(collections: GameCollection[]): { value: string; label: string }[] {
  return [
    { value: ALL_COLLECTIONS, label: 'Toutes les collections' },
    ...SMART_COLLECTIONS.map(c => ({ value: smartFilter(c.id), label: c.label })),
    ...collections.map(c => ({ value: userFilter(c.id), label: c.name }))
  ];
}

// --- Gestion de la liste des collections (paramètres) ----------------------

function newCollectionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Nom nettoyé, ou null s'il est vide ou déjà pris (insensible à la casse). */
export function validCollectionName(name: string, collections: GameCollection[], exceptId?: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const taken = collections.some(c => c.id !== exceptId && c.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  return taken ? null : trimmed;
}

export function addCollection(collections: GameCollection[], name: string): { collections: GameCollection[]; created: GameCollection } | null {
  const valid = validCollectionName(name, collections);
  if (!valid) return null;
  const created = { id: newCollectionId(), name: valid };
  return { collections: [...collections, created], created };
}

export function renameCollection(collections: GameCollection[], id: string, name: string): GameCollection[] | null {
  const valid = validCollectionName(name, collections, id);
  return valid ? collections.map(c => (c.id === id ? { ...c, name: valid } : c)) : null;
}

/**
 * Retire la collection de la liste. Les fiches gardent son ID, ignoré
 * partout faute de collection correspondante : pas de réécriture de toutes
 * les fiches, et les IDs ne sont jamais réutilisés.
 */
export function removeCollection(collections: GameCollection[], id: string): GameCollection[] {
  return collections.filter(c => c.id !== id);
}

export function moveCollection(collections: GameCollection[], id: string, delta: -1 | 1): GameCollection[] {
  const index = collections.findIndex(c => c.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= collections.length) return collections;
  const next = [...collections];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Nouvelle liste d'IDs de collections d'un jeu, avec `id` ajouté ou retiré. */
export function toggleGameCollection(game: GameCacheEntry, id: string): string[] {
  const current = gameCollectionIds(game);
  return current.includes(id) ? current.filter(c => c !== id) : [...current, id];
}

// --- Étagères de l'accueil --------------------------------------------------

export interface Shelf {
  key: string;
  title: string;
  /** Premiers jeux de l'étagère (au plus `limit`). */
  games: GameListItem[];
  total: number;
  /** "Tout voir" : bibliothèque filtrée sur cette collection, ou triée comme l'étagère. */
  showAll: { collectionFilter?: string; sort?: string };
  /** Collection de l'utilisateur (affichée même vide, pour qu'on sache comment la remplir). */
  isUserCollection?: boolean;
}

const byDateDesc = (field: 'lastPlayed' | 'addedDate') => (a: GameListItem, b: GameListItem) =>
  String(b.data[field] || '').localeCompare(String(a.data[field] || ''));

/**
 * Étagères de l'accueil, façon SteamOS : récemment joués, à finir, ajoutés
 * récemment, jamais lancés, puis les collections de l'utilisateur. Les
 * étagères automatiques vides sont omises.
 */
export function buildShelves(games: GameListItem[], collections: GameCollection[], limit = 12): Shelf[] {
  const shelf = (
    key: string,
    title: string,
    matching: GameListItem[],
    compare: (a: GameListItem, b: GameListItem) => number,
    showAll: Shelf['showAll'],
    isUserCollection = false
  ): Shelf => {
    const sorted = [...matching].sort(compare);
    return { key, title, games: sorted.slice(0, limit), total: sorted.length, showAll, isUserCollection };
  };

  const automatic = [
    shelf('recent', 'Récemment joués', games.filter(g => g.data.lastPlayed), byDateDesc('lastPlayed'), { sort: 'last_played' }),
    shelf('to-finish', 'À finir', games.filter(g => matchesSmartCollection(g.data, 'to-finish')), byDateDesc('lastPlayed'), {
      collectionFilter: smartFilter('to-finish'),
      sort: 'last_played'
    }),
    shelf('added', 'Ajoutés récemment', games, byDateDesc('addedDate'), { sort: 'last_added' }),
    shelf('unplayed', 'Jamais lancés', games.filter(g => matchesSmartCollection(g.data, 'unplayed')), byDateDesc('addedDate'), {
      collectionFilter: smartFilter('unplayed'),
      sort: 'last_added'
    })
  ].filter(s => s.total > 0);

  const user = collections.map(c =>
    shelf(
      `user:${c.id}`,
      c.name,
      games.filter(g => gameCollectionIds(g.data).includes(c.id)),
      (a, b) => (a.data.work_name || a.id).localeCompare(b.data.work_name || b.id),
      { collectionFilter: userFilter(c.id), sort: 'name_asc' },
      true
    )
  );

  return [...automatic, ...user];
}
