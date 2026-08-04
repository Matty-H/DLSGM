import type { GameCache, GameCacheEntry } from './cacheManager.js';
import { categoryMap } from './metadataManager.js';
import { canonicalGenre, type GenreAliasGroups } from './genreAliases.js';

export interface BreakdownRow {
  label: string;
  count: number;
  width: string;
}

export interface LibraryStats {
  totalGames: number;
  totalPlayTimeSeconds: number;
  topGame: GameCacheEntry | null;
  lastAdded: GameCacheEntry | null;
  genreBreakdown: BreakdownRow[];
  ageBreakdown: BreakdownRow[];
  categoryBreakdown: BreakdownRow[];
}

const AGE_LABELS: Record<string, string> = { ALL_AGES: 'Tout public', R15: 'R15', R18: 'R18' };

function widthPercent(count: number, max: number): string {
  return `${max > 0 ? Math.round((count / max) * 100) : 0}%`;
}

function countToBreakdown(counts: Record<string, number>, labelFor: (key: string) => string, sort: boolean): BreakdownRow[] {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (sort) entries.sort((a, b) => b[1] - a[1]);
  const max = Math.max(0, ...entries.map(([, count]) => count));
  return entries.map(([key, count]) => ({ label: labelFor(key), count, width: widthPercent(count, max) }));
}

/** Calcule les statistiques de la bibliothèque à partir du cache complet (non filtré). */
export function computeLibraryStats(cache: GameCache, genreAliasGroups: GenreAliasGroups = []): LibraryStats {
  const games = Object.values(cache);

  let totalPlayTimeSeconds = 0;
  let topGame: GameCacheEntry | null = null;
  let lastAdded: GameCacheEntry | null = null;
  const genreCounts: Record<string, number> = {};
  const ageCounts: Record<string, number> = { ALL_AGES: 0, R15: 0, R18: 0 };
  const categoryCounts: Record<string, number> = {};

  for (const game of games) {
    const playTime = (game.totalPlayTime as number) || 0;
    totalPlayTimeSeconds += playTime;
    if (!topGame || playTime > ((topGame.totalPlayTime as number) || 0)) topGame = game;

    if (game.addedDate && (!lastAdded || new Date(game.addedDate) > new Date(lastAdded.addedDate || 0))) {
      lastAdded = game;
    }

    if (Array.isArray(game.genre)) {
      // Un jeu ne compte qu'une fois par genre canonique, même si son propre
      // tableau `genre` contient plusieurs alias du même genre (JP + EN).
      const canonicalGenresForGame = new Set(game.genre.map(g => canonicalGenre(g, genreAliasGroups)));
      canonicalGenresForGame.forEach(genre => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
    }

    const age = game.age_category || 'ALL_AGES';
    ageCounts[age] = (ageCounts[age] || 0) + 1;

    if (game.category) {
      categoryCounts[game.category] = (categoryCounts[game.category] || 0) + 1;
    }
  }

  return {
    totalGames: games.length,
    totalPlayTimeSeconds,
    topGame,
    lastAdded,
    genreBreakdown: countToBreakdown(genreCounts, key => key, true),
    ageBreakdown: countToBreakdown(ageCounts, key => AGE_LABELS[key] || key, false),
    categoryBreakdown: countToBreakdown(categoryCounts, key => categoryMap[key] || key, true)
  };
}
