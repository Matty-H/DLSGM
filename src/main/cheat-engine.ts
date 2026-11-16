import fs from 'fs';
import path from 'path';
import type { CheatTable } from '../shared/ipc-types';

/**
 * Cheat Engine (Windows) : DLSGM ne fait que l'ouvrir avec une table (.CT).
 * Les tables d'un jeu vivent dans `<travaux>/<ID>/cheat-tables/` — hors du
 * dossier du jeu, comme tout le dossier de travaux : jamais envoyées en
 * partage LAN, jamais touchées par les patchs, gardées si le jeu est supprimé.
 */

/** Sous-dossier du dossier de travaux d'un jeu. */
export const CHEAT_TABLES_DIR = 'cheat-tables';

// `Cheat Engine.exe` est le lanceur (choisit 64 bits / SSE4-AVX2 / 32 bits) :
// c'est lui que vise l'association de fichier .CT (`"Cheat Engine.exe" "%1"`).
const CE_EXECUTABLES = ['Cheat Engine.exe', 'cheatengine-x86_64.exe', 'cheatengine-x86_64-SSE4-AVX2.exe', 'cheatengine-i386.exe'];

// Une table fait quelques Ko à quelques Mo (scripts Lua, structures) : au-delà, ce n'en est pas une.
export const MAX_CHEAT_TABLE_BYTES = 64 * 1024 * 1024;

const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/** Exécutable de Cheat Engine dans ce dossier, ou null. */
export function findCheatEngine(dir: string): string | null {
  if (!dir || !path.isAbsolute(dir)) return null;
  for (const name of CE_EXECUTABLES) {
    const candidate = path.join(dir, name);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Absent : suivant.
    }
  }
  return null;
}

/**
 * Dossiers d'installation habituels (`C:\Program Files\Cheat Engine`,
 * `Cheat Engine 7.5`...), la version la plus récente d'abord : utilisés
 * quand aucun dossier n'est choisi dans les paramètres.
 */
export function installedCheatEngineDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const bases = [...new Set([env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)']].filter((base): base is string => Boolean(base)))];
  const dirs: string[] = [];
  for (const base of bases) {
    let names: string[];
    try {
      names = fs.readdirSync(base).filter(name => /^cheat ?engine\b/i.test(name));
    } catch {
      continue;
    }
    names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    dirs.push(...names.map(name => path.join(base, name)));
  }
  return dirs;
}

/** Cheat Engine du dossier choisi ; sans dossier choisi, celui d'une installation habituelle. */
export function resolveCheatEngine(configured: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (configured) return findCheatEngine(configured);
  for (const dir of installedCheatEngineDirs(env)) {
    const found = findCheatEngine(dir);
    if (found) return found;
  }
  return null;
}

/** Nom de fichier de table acceptable : un simple nom en `.CT`, sans chemin ni nom réservé de Windows. */
export function isCheatTableName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length <= 200 &&
    /\.ct$/i.test(name) &&
    !/[\\/:*?"<>|\x00-\x1f]/.test(name) &&
    !name.startsWith('.') &&
    !/[. ]$/.test(name) &&
    !RESERVED_NAMES.test(name) &&
    path.basename(name) === name
  );
}

/** Tables du dossier, les plus récentes d'abord (dossier absent : aucune). */
export async function listCheatTables(dir: string): Promise<CheatTable[]> {
  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const tables: CheatTable[] = [];
  for (const dirent of dirents) {
    if (!dirent.isFile() || !isCheatTableName(dirent.name)) continue;
    const stat = await fs.promises.stat(path.join(dir, dirent.name)).catch(() => null);
    if (stat) tables.push({ name: dirent.name, size: stat.size, modified: stat.mtime.toISOString() });
  }
  return tables.sort((a, b) => b.modified.localeCompare(a.modified));
}

/** `nom.CT`, sinon `nom (2).CT`, `nom (3).CT`... : jamais d'écrasement d'une table existante. */
export function freeTableName(existing: Set<string>, name: string): string {
  const taken = (candidate: string) => existing.has(candidate.toLowerCase());
  if (!taken(name)) return name;
  const ext = path.extname(name);
  const stem = name.slice(0, -ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

export interface CheatTableImport {
  imported: string[];
  /** Fichiers refusés (pas une table .CT, trop gros, illisibles), par nom. */
  skipped: string[];
}

/**
 * Copie des tables choisies dans le dossier du jeu (créé au besoin), sous
 * un nom libre. Écrit en `.tmp` puis renommé : pas de table à moitié copiée.
 */
export async function importCheatTables(dir: string, sources: string[]): Promise<CheatTableImport> {
  const result: CheatTableImport = { imported: [], skipped: [] };
  await fs.promises.mkdir(dir, { recursive: true });
  const existing = new Set((await fs.promises.readdir(dir)).map(name => name.toLowerCase()));
  for (const source of sources) {
    const base = path.basename(source);
    try {
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || !isCheatTableName(base) || stat.size > MAX_CHEAT_TABLE_BYTES) {
        result.skipped.push(base);
        continue;
      }
      const name = freeTableName(existing, base);
      const target = path.join(dir, name);
      const tmp = `${target}.tmp`;
      await fs.promises.copyFile(source, tmp);
      await fs.promises.rename(tmp, target);
      existing.add(name.toLowerCase());
      result.imported.push(name);
    } catch (error) {
      console.error(`Import de la table ${source} impossible :`, error);
      result.skipped.push(base);
    }
  }
  return result;
}

/** Chemin d'une table du dossier, ou null si le nom n'en est pas une ou si elle n'existe pas. */
export function cheatTablePath(dir: string, name: unknown): string | null {
  if (!isCheatTableName(name)) return null;
  const full = path.join(dir, name);
  if (path.dirname(full) !== path.resolve(dir)) return null;
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}
