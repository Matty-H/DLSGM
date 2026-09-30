import type { GameCacheEntry } from './cacheManager.js';
import type { GenreNames } from './genreNames.js';
import { matchesCollectionFilter } from './collections.js';

/**
 * Prédicat de filtrage pur : détermine si un jeu correspond aux critères de
 * filtrage actuels. L'état des filtres (recherche, catégorie, genres, note,
 * tri) vit désormais dans le hook useFilters (état React), et est passé ici
 * explicitement plutôt que lu depuis des variables de module mutables.
 */

/** Champs de fiche qui désignent une personne ou un groupe, filtrables depuis la page d'un jeu. */
export type CreatorField =
  | 'circle'
  | 'brand'
  | 'publisher'
  | 'label'
  | 'series'
  | 'author'
  | 'writer'
  | 'scenario'
  | 'illustration'
  | 'voice_actor'
  | 'music';

export const CREATOR_FIELD_LABELS: Record<CreatorField, string> = {
  circle: 'Cercle',
  brand: 'Marque',
  publisher: 'Éditeur',
  label: 'Label',
  series: 'Série',
  author: 'Auteur',
  writer: 'Scénariste',
  scenario: 'Scénario',
  illustration: 'Illustration',
  voice_actor: 'Voix',
  music: 'Musique'
};

/** Filtre "même cercle / auteur / série..." : correspondance exacte sur un champ. */
export interface CreatorFilter {
  field: CreatorField;
  value: string;
  /**
   * Cercle / marque : identifiant DLsite (RG...), qui ne dépend pas de la
   * langue du fetch ("cat 3" et "猫3" sont le même cercle).
   */
  makerId?: string | null;
  /** Autres noms du même cercle (sa traduction anglaise) : pour les fiches sans identifiant. */
  otherNames?: (string | null | undefined)[];
}

/** Correspondance d'un jeu avec un filtre créateur : par identifiant de cercle si les deux l'ont, sinon par nom. */
export function matchesCreator(game: GameCacheEntry, filter: CreatorFilter): boolean {
  const gameMakerId = (game as Record<string, unknown>).maker_id;
  if ((filter.field === 'circle' || filter.field === 'brand') && filter.makerId && typeof gameMakerId === 'string' && gameMakerId) {
    return gameMakerId === filter.makerId;
  }
  const names = [filter.value, ...(filter.otherNames ?? [])].filter((n): n is string => Boolean(n));
  const gameNames = creatorValues(game, filter.field);
  if (filter.field === 'circle' && typeof game.circle_en === 'string') gameNames.push(game.circle_en);
  return gameNames.some(name => names.includes(name));
}

/** Valeurs d'un champ créateur d'une fiche (chaîne ou liste selon le champ). */
export function creatorValues(game: GameCacheEntry, field: CreatorField): string[] {
  const value = (game as Record<string, unknown>)[field];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return typeof value === 'string' && value.trim() !== '' ? [value] : [];
}

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
}

export interface GameListItem {
  id: string;
  data: GameCacheEntry;
}

export function matchesFilters(game: GameCacheEntry, filters: GameFilters): boolean {
  const { selectedCategoryCode, searchTerm, selectedGenres, selectedRating, genreNames, creatorFilter, collectionFilter } = filters;
  const gameName = game.work_name || '';

  if (!matchesCollectionFilter(game, collectionFilter)) return false;

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
