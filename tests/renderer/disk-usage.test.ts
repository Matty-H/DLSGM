import { describe, expect, it } from 'vitest';
import { collectionBytes, formatBytes, summarizeDisks } from '../../src/renderer/src/lib/diskUsage';
import { compareGames } from '../../src/renderer/src/lib/filterManager';
import type { DiskUsageReport } from '../../src/shared/ipc-types';

const usage = (bytes: number) => ({ bytes, files: 1, computedAt: 0, folderMtimeMs: 0 });

describe('taille sur le disque (renderer)', () => {
  it('formate en unités décimales françaises', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(850_000_000)).toBe('850 Mo');
    expect(formatBytes(4_800_000_000)).toBe('4,8 Go');
    expect(formatBytes(31_480_000_000)).toBe('31,5 Go');
    expect(formatBytes(1_050_000_000_000)).toBe('1,05 To');
  });

  it('totaux par disque, plus gros jeux d’abord, disques sans jeu mesuré écartés', () => {
    const report: DiskUsageReport = {
      games: { A: usage(10), B: usage(30), C: usage(5) },
      gameDisks: { A: 'D:\\', B: 'D:\\', C: 'E:\\', X: 'F:\\' },
      disks: [
        { root: 'D:\\', totalBytes: 100, freeBytes: 40 },
        { root: 'E:\\', totalBytes: null, freeBytes: null },
        { root: 'F:\\', totalBytes: 10, freeBytes: 5 }
      ],
      pending: 1
    };
    expect(summarizeDisks(report, 1)).toEqual([
      { root: 'D:\\', totalBytes: 100, freeBytes: 40, gamesBytes: 40, games: 2, biggest: [{ gameId: 'B', bytes: 30 }] },
      { root: 'E:\\', totalBytes: null, freeBytes: null, gamesBytes: 5, games: 1, biggest: [{ gameId: 'C', bytes: 5 }] }
    ]);
    expect(collectionBytes(report)).toBe(45);
  });

  it('tri par taille : plus gros d’abord, jeux pas encore mesurés à la fin', () => {
    const game = (id: string) => ({ id, data: { work_name: id } }) as never;
    const sizes = { a: 5, b: 50 };
    const sorted = [game('c'), game('a'), game('b')].sort((x, y) => compareGames(x, y, 'size_desc', sizes));
    expect(sorted.map((g: { id: string }) => g.id)).toEqual(['b', 'a', 'c']);
  });
});
