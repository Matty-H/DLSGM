import type { CollectionCondition, CollectionRuleField, CollectionRules, GameCollection, HomeShelfPrefs, ShelfSize } from '../../../shared/ipc-types';
import type { GameCacheEntry } from './cacheManager.js';
import { CREATOR_FIELD_LABELS, creatorValues, matchesCreator, type CreatorField } from './creators.js';
import type { GameListItem } from './filterManager.js';
import { IDENTITY_GENRE_NAMES, type GenreNames } from './genreNames.js';
import { categoryMap } from './metadataManager.js';

/**
 * Collections de jeux : collections créées par l'utilisateur (liste ordonnée
 * dans les paramètres, appartenance dans chaque fiche via `collections`) et
 * collections automatiques calculées à partir du temps de jeu. Sert au filtre
 * de la bibliothèque et aux étagères de l'accueil. Pur, sans DOM.
 */

export type { CollectionCondition, CollectionRuleField, CollectionRules, GameCollection, HomeShelfPrefs, ShelfSize };

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

/** Collections où le jeu a été ajouté à la main (`collections` de la fiche), sans celles des règles. */
export function gameCollectionIds(game: GameCacheEntry): string[] {
  return Array.isArray(game.collections) ? game.collections : [];
}

// --- Règles (ajout automatique aux collections de l'utilisateur) -------------

export const RULE_FIELD_LABELS: Record<CollectionRuleField, string> = {
  genre: 'Tag DLsite',
  customTag: 'Tag perso',
  category: "Type d'œuvre",
  completed: 'Fini',
  playTime: 'Temps de jeu',
  ...CREATOR_FIELD_LABELS
};

/** Champs sans valeur à choisir dans la bibliothèque (oui / non, ou un seuil). */
export const isValuelessField = (field: CollectionRuleField) => field === 'completed' || field === 'playTime';

/** Seuil de temps de jeu (minutes) : « 45 min », « 2 h », « 1 h 30 ». */
export function formatPlayTimeThreshold(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${String(rest).padStart(2, '0')}` : `${m / 60} h`;
}

export const RULE_FIELDS = Object.keys(RULE_FIELD_LABELS) as CollectionRuleField[];

const isCreatorField = (field: CollectionRuleField): field is CreatorField => field in CREATOR_FIELD_LABELS;

export const emptyRules = (): CollectionRules => ({ groups: [], exclude: [] });

/** Au moins un groupe non vide : sinon les règles n'ajoutent aucun jeu. */
export function hasActiveRules(rules: CollectionRules | undefined): rules is CollectionRules {
  return Boolean(rules?.groups.some(group => group.length > 0));
}

/** Le jeu a-t-il la valeur de la condition (sans tenir compte de `negate`) ? */
function hasValue(game: GameCacheEntry, condition: CollectionCondition, genreNames: GenreNames): boolean {
  const { field, value } = condition;
  switch (field) {
    case 'genre':
      // Clés japonaises : un ancien genre anglais compte comme sa clé.
      return (Array.isArray(game.genre) ? game.genre : []).some(g => genreNames.canonical(g) === value);
    case 'customTag':
      return (Array.isArray(game.customTags) ? (game.customTags as string[]) : []).includes(value);
    case 'category':
      return game.category === value;
    case 'completed':
      return Boolean(game.completed);
    case 'playTime':
      return ((game.totalPlayTime as number) || 0) >= (Number(value) || 0) * 60;
    default:
      return isCreatorField(field) && matchesCreator(game, { field, value, makerId: condition.makerId });
  }
}

export function matchesCondition(game: GameCacheEntry, condition: CollectionCondition, genreNames: GenreNames): boolean {
  return hasValue(game, condition, genreNames) !== Boolean(condition.negate);
}

/** (un groupe dont toutes les conditions sont vraies) ET aucune exclusion. */
export function matchesRules(game: GameCacheEntry, rules: CollectionRules | undefined, genreNames: GenreNames): boolean {
  if (!hasActiveRules(rules)) return false;
  const inGroup = rules.groups.some(group => group.length > 0 && group.every(c => matchesCondition(game, c, genreNames)));
  return inGroup && !rules.exclude.some(c => hasValue(game, c, genreNames));
}

/** Ce qu'il faut pour savoir si un jeu est dans une collection, règles comprises. */
export interface CollectionContext {
  collections: GameCollection[];
  genreNames: GenreNames;
}

/** Ajouté à la main OU correspondant aux règles. */
export function isInUserCollection(game: GameCacheEntry, collection: GameCollection, genreNames: GenreNames): boolean {
  return gameCollectionIds(game).includes(collection.id) || matchesRules(game, collection.rules, genreNames);
}

/** Dans la collection seulement par ses règles : on ne peut pas l'en retirer à la main. */
export function isInCollectionByRulesOnly(game: GameCacheEntry, collection: GameCollection, genreNames: GenreNames): boolean {
  return !gameCollectionIds(game).includes(collection.id) && matchesRules(game, collection.rules, genreNames);
}

export function matchesCollectionFilter(
  game: GameCacheEntry,
  filter: string,
  context: CollectionContext = { collections: [], genreNames: IDENTITY_GENRE_NAMES }
): boolean {
  if (filter.startsWith('smart:')) return matchesSmartCollection(game, filter.slice(6) as SmartCollectionId);
  if (filter.startsWith('user:')) {
    const id = filter.slice(5);
    const collection = context.collections.find(c => c.id === id);
    return collection ? isInUserCollection(game, collection, context.genreNames) : gameCollectionIds(game).includes(id);
  }
  return true;
}

export interface RuleValueOption {
  /** Unique : identifiant DLsite du cercle / de la marque, sinon la valeur. */
  key: string;
  value: string;
  label: string;
  makerId?: string | null;
  /** Nombre de jeux de la bibliothèque qui ont cette valeur. */
  count: number;
}

/**
 * Valeurs proposées pour un champ, tirées de la bibliothèque (les plus
 * fréquentes d'abord). Cercle / marque : regroupés par identifiant DLsite.
 */
export function collectRuleValues(games: GameCacheEntry[], field: CollectionRuleField, genreNames: GenreNames): RuleValueOption[] {
  const options = new Map<string, RuleValueOption>();
  if (isValuelessField(field)) return [];
  for (const game of games) {
    const values = new Set<string>();
    if (field === 'genre') (Array.isArray(game.genre) ? game.genre : []).forEach(g => values.add(genreNames.canonical(g)));
    else if (field === 'customTag') (Array.isArray(game.customTags) ? (game.customTags as string[]) : []).forEach(t => values.add(t));
    else if (field === 'category') {
      if (game.category) values.add(game.category);
    } else if (isCreatorField(field)) creatorValues(game, field).forEach(v => values.add(v));

    const makerId = (field === 'circle' || field === 'brand') && typeof game.maker_id === 'string' && game.maker_id ? game.maker_id : null;
    for (const value of values) {
      const key = makerId ? `id:${makerId}` : `v:${value}`;
      const existing = options.get(key);
      if (existing) {
        existing.count++;
        continue;
      }
      const label = field === 'genre' ? genreNames.label(value) : field === 'category' ? categoryMap[value] || value : value;
      options.set(key, { key, value, label, ...(makerId && { makerId }), count: 1 });
    }
  }
  return [...options.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Libellé lisible d'une condition (« Cercle : 猫3 », « sans Auteur : X »). */
export function describeCondition(condition: CollectionCondition, genreNames: GenreNames = IDENTITY_GENRE_NAMES): string {
  if (condition.field === 'completed') return condition.negate ? 'Pas fini' : 'Fini';
  if (condition.field === 'playTime') {
    return `Temps de jeu ${condition.negate ? '<' : '≥'} ${formatPlayTimeThreshold(Number(condition.value) || 0)}`;
  }
  const value =
    condition.field === 'genre'
      ? genreNames.label(condition.value)
      : condition.field === 'category'
        ? categoryMap[condition.value] || condition.value
        : condition.value;
  return `${condition.negate ? 'sans ' : ''}${RULE_FIELD_LABELS[condition.field]} : ${value}`;
}

/** Collection avec ses nouvelles règles, groupes vides retirés (sans `rules` s'il n'en reste aucune). */
export function withRules(collection: GameCollection, rules: CollectionRules): GameCollection {
  const { rules: _previous, ...rest } = collection;
  const groups = rules.groups.filter(group => group.length > 0);
  return groups.length > 0 || rules.exclude.length > 0 ? { ...rest, rules: { groups, exclude: rules.exclude } } : rest;
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

/** Étagères automatiques de l'accueil, dans leur ordre, avec leur taille de jaquettes par défaut. */
export const AUTO_SHELVES: { key: string; label: string; size: ShelfSize }[] = [
  { key: 'recent', label: 'Récemment joués', size: 'large' },
  { key: 'to-finish', label: 'À finir', size: 'medium' },
  { key: 'added', label: 'Ajoutés récemment', size: 'medium' },
  { key: 'unplayed', label: 'Jamais lancés', size: 'small' }
];

export const DEFAULT_USER_SHELF_SIZE: ShelfSize = 'medium';

export const SHELF_SIZE_LABELS: Record<ShelfSize, string> = { small: 'Petites', medium: 'Moyennes', large: 'Grandes' };

export const userShelfKey = (collectionId: string) => `user:${collectionId}`;

/** Taille effective d'une étagère : choisie, sinon celle par défaut (variée, pour rythmer l'accueil). */
export function shelfSize(key: string, prefs: Record<string, HomeShelfPrefs> = {}): ShelfSize {
  return prefs[key]?.size ?? AUTO_SHELVES.find(s => s.key === key)?.size ?? DEFAULT_USER_SHELF_SIZE;
}

/** Nouvelles préférences avec `patch` appliqué à l'étagère `key` (entrée retirée si elle revient aux défauts). */
export function updateShelfPrefs(
  prefs: Record<string, HomeShelfPrefs>,
  key: string,
  patch: HomeShelfPrefs
): Record<string, HomeShelfPrefs> {
  const merged = { ...prefs[key], ...patch };
  const cleaned: HomeShelfPrefs = {
    ...(merged.hidden && { hidden: true }),
    ...(merged.size && merged.size !== shelfSize(key) && { size: merged.size })
  };
  const { [key]: _previous, ...rest } = prefs;
  return Object.keys(cleaned).length > 0 ? { ...rest, [key]: cleaned } : rest;
}

export interface Shelf {
  key: string;
  title: string;
  /** Premiers jeux de l'étagère (au plus `limit`). */
  games: GameListItem[];
  total: number;
  /** "Tout voir" : bibliothèque filtrée sur cette collection, ou triée comme l'étagère. */
  showAll: { collectionFilter?: string; sort?: string };
  size: ShelfSize;
  /** Collection de l'utilisateur (étagère affichée même vide, avec de quoi la remplir). */
  collectionId?: string;
}

export interface ShelfOptions {
  genreNames?: GenreNames;
  /** Étagères masquées / taille des jaquettes (paramètre `homeShelves`). */
  prefs?: Record<string, HomeShelfPrefs>;
  limit?: number;
}

const byDateDesc = (field: 'lastPlayed' | 'addedDate') => (a: GameListItem, b: GameListItem) =>
  String(b.data[field] || '').localeCompare(String(a.data[field] || ''));

/**
 * Étagères de l'accueil, façon SteamOS : récemment joués, à finir, ajoutés
 * récemment, jamais lancés, puis les collections de l'utilisateur. Les
 * étagères automatiques vides et les étagères masquées sont omises.
 */
export function buildShelves(games: GameListItem[], collections: GameCollection[], options: ShelfOptions = {}): Shelf[] {
  const { genreNames = IDENTITY_GENRE_NAMES, prefs = {}, limit = 12 } = options;
  const shelf = (
    key: string,
    title: string,
    matching: GameListItem[],
    compare: (a: GameListItem, b: GameListItem) => number,
    showAll: Shelf['showAll'],
    collectionId?: string
  ): Shelf => {
    const sorted = [...matching].sort(compare);
    return {
      key,
      title,
      games: sorted.slice(0, limit),
      total: sorted.length,
      showAll,
      size: shelfSize(key, prefs),
      ...(collectionId && { collectionId })
    };
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
      userShelfKey(c.id),
      c.name,
      games.filter(g => isInUserCollection(g.data, c, genreNames)),
      (a, b) => (a.data.work_name || a.id).localeCompare(b.data.work_name || b.id),
      { collectionFilter: userFilter(c.id), sort: 'name_asc' },
      c.id
    )
  );

  return [...automatic, ...user].filter(s => !prefs[s.key]?.hidden);
}
