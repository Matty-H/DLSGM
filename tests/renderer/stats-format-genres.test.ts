import { describe, expect, it } from 'vitest';
import { computeLibraryStats, computeWeeklyPlayTime, recentSessions } from '../../src/renderer/src/lib/statsManager';
import { formatPlayTime, formatSessionDuration } from '../../src/renderer/src/lib/timeFormatter';
import { collectCanonicalGenres, makeGenreNames } from '../../src/renderer/src/lib/genreNames';
import type { GameCache } from '../../src/renderer/src/lib/cacheManager';

const cache = {
  RJ1: {
    work_name: 'A',
    genre: ['Anal', 'アナル'],
    totalPlayTime: 7200,
    playSessions: [
      { start: '2026-09-28T10:00:00', duration: 3600 }, // lundi, semaine courante
      { start: '2026-09-21T10:00:00', duration: 1800 } // semaine précédente
    ]
  },
  RJ2: { work_name: 'B', genre: ['RPG'], totalPlayTime: 60, playSessions: [{ start: '2026-09-30T20:00:00', duration: 60 }] }
} as unknown as GameCache;

describe('computeWeeklyPlayTime', () => {
  it('regroupe les sessions par semaine (lundi), la plus récente en dernier', () => {
    const weeks = computeWeeklyPlayTime(cache, 3, new Date('2026-09-30T12:00:00'));
    expect(weeks.map(w => w.seconds)).toEqual([0, 1800, 3660]);
    expect(weeks[2].weekStart.getDay()).toBe(1);
  });
});

describe('recentSessions', () => {
  it('trie toutes les sessions de la plus récente à la plus ancienne', () => {
    expect(recentSessions(cache, 2).map(s => [s.gameId, s.duration])).toEqual([
      ['RJ2', 60],
      ['RJ1', 3600]
    ]);
  });
});

describe('computeLibraryStats', () => {
  it('compte un genre une seule fois par jeu, alias compris', () => {
    const names = makeGenreNames({ 'アナル': { en: 'Anal', manual: false } }, 'ja_JP');
    const stats = computeLibraryStats(cache, names);
    // Clé japonaise, affichée en japonais : l'ancien genre anglais y est ramené.
    expect(stats.genreBreakdown.find(r => r.label === 'アナル')?.count).toBe(1);
    expect(stats.genreBreakdown.find(r => r.label === 'Anal')).toBeUndefined();
    expect(stats.totalPlayTimeSeconds).toBe(7260);
    expect(stats.topGame?.work_name).toBe('A');
  });
});

describe('formats de durée', () => {
  it.each([
    [30, '< 1 min'],
    [720, '12 min'],
    [3900, '1 h 05']
  ])('formatSessionDuration(%i) = %s', (seconds, expected) => {
    expect(formatSessionDuration(seconds)).toBe(expected);
  });

  it('formatPlayTime', () => {
    expect(formatPlayTime(0)).toBe('');
    expect(formatPlayTime(45)).toBe('45 sec');
    expect(formatPlayTime(7200)).toBe('2 h');
  });
});

describe('noms des tags (japonais de référence)', () => {
  const translations = {
    'アナル': { en: 'Anal', manual: false },
    '3D作品': { en: '3D Works', manual: true }
  };

  it('affiche le japonais ou la traduction selon la langue, le japonais faute de traduction', () => {
    expect(makeGenreNames(translations, 'ja_JP').label('アナル')).toBe('アナル');
    expect(makeGenreNames(translations, 'en_US').label('アナル')).toBe('Anal');
    expect(makeGenreNames(translations, 'en_US').label('断面図')).toBe('断面図');
  });

  it('ramène un ancien genre anglais à sa clé japonaise, sans doublon', () => {
    const names = makeGenreNames(translations, 'en_US');
    expect(names.canonical('3D Works')).toBe('3D作品');
    expect(names.canonical('Inconnu')).toBe('Inconnu');
    expect(collectCanonicalGenres(['アナル', 'Anal', '3D Works'], names)).toEqual(['3D作品', 'アナル']);
  });
});
