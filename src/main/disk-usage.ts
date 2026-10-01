import fs from 'fs';
import path from 'path';
import type { DiskInfo, GameDiskUsage } from '../shared/ipc-types';

/**
 * Taille des dossiers de jeux. Parcourir des centaines de dossiers est lent :
 * le calcul se fait en tâche de fond, un jeu à la fois, et le résultat est
 * mis en cache (par ID). Une taille est recalculée quand la date de
 * modification du dossier a changé (fichier ajouté ou retiré à sa racine,
 * patch) ou au bout de 7 jours.
 */

export const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/** Taille totale et nombre de fichiers sous `dir` (liens symboliques non suivis). */
export async function folderSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    // Les tailles d'un dossier sont lues ensemble (bien plus rapide qu'une à une).
    const sizes = await Promise.all(
      entries.map(async entry => {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          return 0;
        }
        if (!entry.isFile()) return 0;
        try {
          return (await fs.promises.lstat(full)).size;
        } catch {
          return 0;
        }
      })
    );
    for (const [i, size] of sizes.entries()) {
      if (entries[i].isFile()) files++;
      bytes += size;
    }
  }
  return { bytes, files };
}

/** Une taille en cache est-elle encore bonne ? */
export function isFresh(cached: GameDiskUsage | undefined, folderMtimeMs: number, now = Date.now()): boolean {
  return Boolean(cached && cached.folderMtimeMs === folderMtimeMs && now - cached.computedAt < MAX_AGE_MS);
}

/** Disque (racine du chemin : `D:\`) de chaque dossier, avec son espace total / libre. */
export async function diskInfo(dirs: string[]): Promise<DiskInfo[]> {
  const roots = [...new Set(dirs.map(dir => path.parse(path.resolve(dir)).root))];
  const out: DiskInfo[] = [];
  for (const root of roots) {
    try {
      const stats = await fs.promises.statfs(root);
      out.push({ root, totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize });
    } catch {
      out.push({ root, totalBytes: null, freeBytes: null });
    }
  }
  return out;
}

export interface DiskUsageStore {
  get(gameId: string): Promise<GameDiskUsage | undefined>;
  set(gameId: string, usage: GameDiskUsage): Promise<void>;
}

/**
 * File de calcul : `refresh` ajoute les jeux à (re)mesurer, un seul calcul
 * tourne à la fois, chaque résultat est rangé puis annoncé (`onUpdate`).
 */
export class DiskUsageScanner {
  private queue: { gameId: string; dir: string }[] = [];
  private running = false;

  constructor(
    private readonly store: DiskUsageStore,
    /** `pending` : jeux encore à mesurer après celui-ci. */
    private readonly onUpdate: (gameId: string, usage: GameDiskUsage, pending: number) => void,
    private readonly measure: typeof folderSize = folderSize
  ) {}

  /** Jeux en attente de mesure (affiché : « calcul en cours »). */
  pending(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  /** Met en file les jeux dont la taille manque ou est périmée (`force` : tous). */
  async refresh(games: { gameId: string; dir: string }[], force = false): Promise<void> {
    for (const game of games) {
      if (this.queue.some(q => q.gameId === game.gameId)) continue;
      let mtime: number;
      try {
        mtime = (await fs.promises.stat(game.dir)).mtimeMs;
      } catch {
        continue;
      }
      if (!force && isFresh(await this.store.get(game.gameId), mtime)) continue;
      this.queue.push(game);
    }
    void this.run();
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const { gameId, dir } = this.queue.shift()!;
        try {
          const folderMtimeMs = (await fs.promises.stat(dir)).mtimeMs;
          const { bytes, files } = await this.measure(dir);
          const usage: GameDiskUsage = { bytes, files, computedAt: Date.now(), folderMtimeMs };
          await this.store.set(gameId, usage);
          this.onUpdate(gameId, usage, this.queue.length);
        } catch (error) {
          console.error(`Taille de ${gameId} non calculée :`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
