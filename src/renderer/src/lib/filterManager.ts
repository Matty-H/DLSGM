import type { GameCacheEntry } from './cacheManager.js';
import type { GenreNames } from './genreNames.js';
import { matchesCollectionFilter, smartFilter, type GameCollection } from './collections.js';
import { matchesCreator, type CreatorFilter } from './creators.js';

/**
 * Prédicat de filtrage pur : détermine si un jeu correspond aux critères de
 * filtrage actuels. L'état des filtres (recherche, catégorie, genres, note,
 * tri) vit désormais dans le hook useFilters (état React), et est passé ici
 * explicitement plutôt que lu depuis des variables de module mutables.
 */

export { CREATOR_FIELD_LABELS, creatorValues, matchesCreator, type CreatorField, type CreatorFilter } from './creators.js';

export interface GameFilters {
  selectedCategoryCode: string;
  searchTerm: string;
  selectedGenres: string[];
  selectedRating: number;
  /** Genres sélectionnés = clés de référence (japonais) ; les genres d'un jeu y
      sont ramenés avant comparaison (voir lib/genreNames.ts). */
  genreNames: GenreNames;
  creatorFilter: CreatorFilter | null;
  /** Voir lib/collections.ts ('all', 'smart:<id>', 'user:<id>'). */
  collectionFilter: string;
  /** Collections de l'utilisateur (leurs règles décident aussi de l'appartenance). */
  collections: GameCollection[];
  /** Masque les jeux marqués finis (sauf dans la collection « Finis », qui n'aurait plus rien). */
  hideCompleted?: boolean;
}

export interface GameListItem {
  id: string;
  data: GameCacheEntry;
}

export function matchesFilters(game: GameCacheEntry, filters: GameFilters): boolean {
  const { selectedCategoryCode, searchTerm, selectedGenres, selectedRating, genreNames, creatorFilter, collectionFilter, collections } = filters;
  const gameName = game.work_name || '';

  if (!matchesCollectionFilter(game, collectionFilter, { collections, genreNames })) return false;

  if (filters.hideCompleted && game.completed && collectionFilter !== smartFilter('completed')) return false;

  if (creatorFilter && !matchesCreator(game, creatorFilter)) {

    return false;
  }


  // Filtrage par note (si sélectionné)
  if (selectedRating > 0) {
    const gameRating = (game.rating as number) || 0;
    if (gameRating !== selectedRating) return false;
  }

  // Filtrage par genre (si sélectionné), sur les clés de référence : un
  // ancien genre anglais compte comme sa clé japonaise.
  if (selectedGenres.length > 0) {
    const gameGenres = (game.genre || []).map(genreNames.canonical);
    if (!selectedGenres.some(genre => gameGenres.includes(genre))) return false;
  }

  // Filtrage par catégorie
  if (selectedCategoryCode !== 'all' && game.category !== selectedCategoryCode) {
    return false;
  }

  // Filtrage par terme de recherche (nom, cercle, auteur, tags)
  if (searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();

    // Titre et cercle : en japonais (référence) et dans leur traduction anglaise.
    const inText = (value: unknown) => typeof value === 'string' && value.toLowerCase().includes(lowerSearchTerm);
    const nameMatches = inText(gameName) || inText(game.work_name_en);
    const circleMatches = inText(game.circle) || inText(game.circle_en);

    const authorMatches = String(game.author || '').toLowerCase().includes(lowerSearchTerm);
    const customTags = (game.customTags as string[]) || [];
    const tagsMatch = customTags.some(tag => tag.toLowerCase().includes(lowerSearchTerm));

    if (!nameMatches && !circleMatches && !tagsMatch && !authorMatches) {
      return false;
    }
  }

  return true;
}

/**
 * Compare deux jeux selon le critère de tri sélectionné.
 */
export function compareGames(a: GameListItem, b: GameListItem, selectedSort: string): number {
  const nameA = (a.data.work_name || a.id).toLowerCase();
  const nameB = (b.data.work_name || b.id).toLowerCase();

  switch (selectedSort) {
    case 'name_asc':
      return nameA.localeCompare(nameB);
    case 'name_desc':
      return nameB.localeCompare(nameA);
    case 'last_played': {
      const lpA = a.data.lastPlayed ? new Date(a.data.lastPlayed as string) : new Date(0);
      const lpB = b.data.lastPlayed ? new Date(b.data.lastPlayed as string) : new Date(0);
      return lpB.getTime() - lpA.getTime();
    }
    case 'last_added': {
      const adA = a.data.addedDate ? new Date(a.data.addedDate) : new Date(0);
      const adB = b.data.addedDate ? new Date(b.data.addedDate) : new Date(0);
      return adB.getTime() - adA.getTime();
    }
    case 'playtime_desc': {
      const ptA = (a.data.totalPlayTime as number) || 0;
      const ptB = (b.data.totalPlayTime as number) || 0;
      return ptB - ptA;
    }
    case 'release_date_asc': {
      const rdA = a.data.release_date && a.data.release_date !== 'N/A' ? new Date(a.data.release_date) : new Date(0);
      const rdB = b.data.release_date && b.data.release_date !== 'N/A' ? new Date(b.data.release_date) : new Date(0);
      return rdA.getTime() - rdB.getTime();
    }
    case 'release_date_desc': {
      const rdA = a.data.release_date && a.data.release_date !== 'N/A' ? new Date(a.data.release_date) : new Date(0);
      const rdB = b.data.release_date && b.data.release_date !== 'N/A' ? new Date(b.data.release_date) : new Date(0);
      return rdB.getTime() - rdA.getTime();
    }
    default:
      return 0;
  }
}
