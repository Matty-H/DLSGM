import type { DiskInfo, DiskUsageReport, GameDiskUsage } from '../../../shared/ipc-types';
import { t, uiLocale } from './i18n.js';

export type { DiskInfo, DiskUsageReport, GameDiskUsage };

/** Octets → « 850 Mo », « 1,2 Go », « 1,05 To » (unités décimales, comme l'Explorateur en Go… à peu près). */
export function formatBytes(bytes: number): string {
  const units = [t('o'), t('Ko'), t('Mo'), t('Go'), t('To')];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit >= 3 ? (value < 10 ? 2 : 1) : 0;
  return `${value.toLocaleString(uiLocale(), { maximumFractionDigits: digits })} ${units[unit]}`;
}

export interface DiskSummary extends DiskInfo {
  /** Place prise par les jeux de la bibliothèque sur ce disque. */
  gamesBytes: number;
  games: number;
  /** Les plus gros jeux de ce disque (ID, octets), du plus gros au plus petit. */
  biggest: { gameId: string; bytes: number }[];
}

/** Totaux par disque (et les `top` plus gros jeux de chacun), pour les jeux mesurés. */
export function summarizeDisks(report: DiskUsageReport, top = 5): DiskSummary[] {
  return report.disks
    .map(disk => {
      const games = Object.entries(report.gameDisks)
        .filter(([gameId, root]) => root === disk.root && report.games[gameId])
        .map(([gameId]) => ({ gameId, bytes: report.games[gameId].bytes }))
        .sort((a, b) => b.bytes - a.bytes);
      return { ...disk, gamesBytes: games.reduce((sum, g) => sum + g.bytes, 0), games: games.length, biggest: games.slice(0, top) };
    })
    .filter(disk => disk.games > 0);
}

/** Taille de toute la collection (jeux mesurés). */
export function collectionBytes(report: DiskUsageReport): number {
  return Object.values(report.games).reduce((sum, usage) => sum + usage.bytes, 0);
}
