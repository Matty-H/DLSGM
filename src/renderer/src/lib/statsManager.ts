import type { GameCache, GameCacheEntry } from './cacheManager.js';
import { categoryLabel } from './metadataManager.js';
import { IDENTITY_GENRE_NAMES, type GenreNames } from './genreNames.js';
import { t } from './i18n.js';

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

const ageLabel = (key: string) => (key === 'ALL_AGES' ? t('Tout public') : key);

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
export function computeLibraryStats(cache: GameCache, genreNames: GenreNames = IDENTITY_GENRE_NAMES): LibraryStats {
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
      const canonicalGenresForGame = new Set(game.genre.map(genreNames.canonical));
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
    genreBreakdown: countToBreakdown(genreCounts, genreNames.label, true),

    ageBreakdown: countToBreakdown(ageCounts, ageLabel, false),
    categoryBreakdown: countToBreakdown(categoryCounts, categoryLabel, true)
  };
}

export interface WeeklyPlayTime {
  /** Lundi 00:00 (heure locale) de la semaine. */
  weekStart: Date;
  seconds: number;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi
  return d;
}

/**
 * Temps de jeu par semaine sur les `weeks` dernières semaines (la courante
 * incluse), d'après l'historique des sessions. Une session est comptée dans
 * la semaine où elle a commencé. Le temps joué avant l'historique des
 * sessions n'y figure pas.
 */
export function computeWeeklyPlayTime(cache: GameCache, weeks = 12, now = new Date()): WeeklyPlayTime[] {
  const current = startOfWeek(now);
  const buckets: WeeklyPlayTime[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(current);
    weekStart.setDate(current.getDate() - (weeks - 1 - i) * 7);
    return { weekStart, seconds: 0 };
  });
  const first = buckets[0].weekStart.getTime();

  for (const game of Object.values(cache)) {
    for (const session of Array.isArray(game.playSessions) ? game.playSessions : []) {
      const start = new Date(session.start);
      if (Number.isNaN(start.getTime()) || start.getTime() < first) continue;
      const bucket = buckets.find(b => b.weekStart.getTime() === startOfWeek(start).getTime());
      if (bucket) bucket.seconds += session.duration || 0;
    }
  }
  return buckets;
}

export interface RecentSession {
  gameId: string;
  name: string;
  start: string;
  duration: number;
}

/** Dernières sessions, tous jeux confondus, de la plus récente à la plus ancienne. */
export function recentSessions(cache: GameCache, limit = 8): RecentSession[] {
  const all: RecentSession[] = [];
  for (const [gameId, game] of Object.entries(cache)) {
    for (const session of Array.isArray(game.playSessions) ? game.playSessions : []) {
      all.push({ gameId, name: game.work_name || gameId, start: session.start, duration: session.duration });
    }
  }
  return all.sort((a, b) => b.start.localeCompare(a.start)).slice(0, limit);
}
