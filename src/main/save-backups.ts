import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { SaveBackup, SaveRestoreResult } from '../shared/ipc-types';
import type { SaveSource } from './game-tools';
import { tm } from './i18n';

/**
 * Copies des sauvegardes des jeux, dans `userData/save_backups/<ID>/<copie>/`
 * (hors du dossier du jeu : elles survivent à sa suppression). Chaque copie
 * contient `backup.json` et un sous-dossier numéroté par emplacement copié.
 *
 * Une copie est écrite dans `<copie>.tmp` puis renommée une fois complète :
 * une copie interrompue n'apparaît jamais dans la liste. Restaurer copie
 * d'abord l'état actuel (reason 'pre-restore'), ce qui rend toute
 * restauration elle-même réversible.
 */

// Copies automatiques (et d'avant restauration) conservées par jeu ; les
// copies manuelles ne sont supprimées que par l'utilisateur.
const MAX_AUTOMATIC_BACKUPS = 10;

// Au-delà, l'emplacement contient sans doute bien plus que des sauvegardes
// (mauvaise détection) : on refuse plutôt que de dupliquer des gigaoctets.
const MAX_BACKUP_BYTES = 512 * 1024 * 1024;

const MANIFEST = 'backup.json';
const BACKUP_ID_REGEX = /^\d{8}-\d{6}-\d{3}(-\d+)?$/;

interface BackupManifest extends SaveBackup {
  /** Sous-dossier de la copie de chaque emplacement, par libellé. */
  folders: { label: string; folder: string }[];
  /** Empreinte (chemins, tailles, dates) de ce qui a été copié : évite une copie identique à la précédente. */
  fingerprint: string;
}

interface SourceFile {
  rel: string;
  size: number;
  mtimeMs: number;
}

function backupsDir(gameId: string): string {
  return path.join(app.getPath('userData'), 'save_backups', gameId);
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Fichiers d'un emplacement (relatifs), limités au premier niveau filtré si `fileFilter`. */
async function listSourceFiles(source: SaveSource): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const walk = async (prefix: string) => {
    for (const entry of await fs.promises.readdir(path.join(source.path, prefix), { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      if (entry.isDirectory() && !source.fileFilter) {
        await walk(rel);
      } else if (entry.isFile() && (!source.fileFilter || source.fileFilter.test(entry.name))) {
        const stat = await fs.promises.stat(path.join(source.path, rel));
        files.push({ rel, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  };
  await walk('');
  return files;
}

function formatBackupId(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}

async function readManifest(dir: string): Promise<BackupManifest | null> {
  try {
    return JSON.parse(await fs.promises.readFile(path.join(dir, MANIFEST), 'utf8')) as BackupManifest;
  } catch {
    return null;
  }
}

async function readManifests(gameId: string): Promise<BackupManifest[]> {
  const root = backupsDir(gameId);
  let names: string[];
  try {
    names = await fs.promises.readdir(root);
  } catch {
    return [];
  }
  const manifests = await Promise.all(names.filter(n => BACKUP_ID_REGEX.test(n)).map(n => readManifest(path.join(root, n))));
  return manifests
    .filter((m): m is BackupManifest => m !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function publicBackup({ folders: _f, fingerprint: _p, ...backup }: BackupManifest): SaveBackup {
  return backup;
}

export async function listSaveBackups(gameId: string): Promise<SaveBackup[]> {
  return (await readManifests(gameId)).map(publicBackup);
}

/**
 * Copie les emplacements existants de `sources`. Renvoie null s'il n'y a
 * rien à copier, ou — pour une copie automatique — si rien n'a changé depuis
 * la dernière copie.
 */
export async function createSaveBackup(
  gameId: string,
  sources: SaveSource[],
  reason: SaveBackup['reason'],
  { prune = true }: { prune?: boolean } = {}
): Promise<SaveBackup | null> {
  const collected: { source: SaveSource; files: SourceFile[] }[] = [];
  for (const source of sources) {
    if (!(await isDirectory(source.path))) continue;
    const files = await listSourceFiles(source);
    if (files.length > 0) collected.push({ source, files });
  }
  if (collected.length === 0) return null;

  const totalBytes = collected.reduce((sum, c) => sum + c.files.reduce((s, f) => s + f.size, 0), 0);
  if (totalBytes > MAX_BACKUP_BYTES) {
    throw new Error(
      tm("Sauvegardes trop volumineuses pour être copiées ({mb} Mo, max {max} Mo) : l'emplacement détecté contient sans doute autre chose que des sauvegardes.", { mb: Math.round(totalBytes / 1024 / 1024), max: MAX_BACKUP_BYTES / 1024 / 1024 })
    );
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(collected.map(c => [c.source.label, c.files.map(f => [f.rel, f.size, f.mtimeMs])])))
    .digest('hex');
  const existing = await readManifests(gameId);
  if (reason === 'auto' && existing[0]?.fingerprint === fingerprint) return null;

  const root = backupsDir(gameId);
  const now = new Date();
  let id = formatBackupId(now);
  for (let n = 1; fs.existsSync(path.join(root, id)); n++) id = `${formatBackupId(now)}-${n}`;
  const finalDir = path.join(root, id);
  const tempDir = `${finalDir}.tmp`;

  const manifest: BackupManifest = {
    id,
    createdAt: now.toISOString(),
    reason,
    locations: collected.map(c => c.source.label),
    fileCount: collected.reduce((sum, c) => sum + c.files.length, 0),
    totalBytes,
    folders: collected.map((c, i) => ({ label: c.source.label, folder: String(i) })),
    fingerprint
  };

  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    for (const [i, { source, files }] of collected.entries()) {
      for (const file of files) {
        const destination = path.join(tempDir, String(i), file.rel);
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await fs.promises.copyFile(path.join(source.path, file.rel), destination);
      }
    }
    await fs.promises.writeFile(path.join(tempDir, MANIFEST), JSON.stringify(manifest, null, 2));
    await fs.promises.rename(tempDir, finalDir);
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  if (prune) await pruneAutomaticBackups(gameId);
  return publicBackup(manifest);
}

async function pruneAutomaticBackups(gameId: string): Promise<void> {
  const automatic = (await readManifests(gameId)).filter(m => m.reason !== 'manual');
  for (const old of automatic.slice(MAX_AUTOMATIC_BACKUPS)) {
    await fs.promises.rm(path.join(backupsDir(gameId), old.id), { recursive: true, force: true });
  }
}

function assertBackupId(backupId: unknown): asserts backupId is string {
  if (typeof backupId !== 'string' || !BACKUP_ID_REGEX.test(backupId)) throw new Error(tm('Copie de sauvegarde invalide.'));
}

/**
 * Remplace les sauvegardes actuelles par celles de la copie `backupId`.
 * Chaque emplacement de la copie est restauré à l'emplacement actuel de même
 * libellé (le dossier du jeu a pu changer de place depuis) : son contenu
 * devient exactement celui de la copie — fichiers en trop compris, sauf hors
 * du filtre `fileFilter` (le reste du jeu n'est jamais touché).
 */
/**
 * Libellés d'emplacements d'avant leur passage en anglais : les copies faites
 * avant les gardent dans leur manifeste, la restauration les associe donc au
 * libellé actuel.
 */
const LEGACY_SAVE_LABELS: Record<string, string> = {
  Sauvegardes: 'Saves',
  'Sauvegardes (jeu)': 'Saves (game)',
  'Dossier du jeu (SaveNN)': 'Game folder (SaveNN)',
  'Godot (Roaming, dossier dédié)': 'Godot (Roaming, dedicated folder)',
  'Unreal (jeu)': 'Unreal (game)'
};

/** Libellé actuel d'un emplacement (ancien libellé français converti, « (sandbox) » conservé). */
export function currentSaveLabel(label: string): string {
  const suffix = ' (sandbox)';
  const sandboxed = label.endsWith(suffix);
  const base = sandboxed ? label.slice(0, -suffix.length) : label;
  const current = LEGACY_SAVE_LABELS[base] ?? base;
  return sandboxed ? current + suffix : current;
}

export async function restoreSaveBackup(gameId: string, backupId: string, sources: SaveSource[]): Promise<SaveRestoreResult> {
  assertBackupId(backupId);
  const backupDir = path.join(backupsDir(gameId), backupId);
  const manifest = await readManifest(backupDir);
  if (!manifest) throw new Error(tm('Copie de sauvegarde introuvable.'));

  // L'état actuel d'abord : si la copie ne peut pas être faite, on ne
  // restaure pas (on écraserait des sauvegardes sans retour possible).
  // Pas de nettoyage avant la fin : il pourrait supprimer la copie restaurée.
  await createSaveBackup(gameId, sources, 'pre-restore', { prune: false });

  const skipped: string[] = [];
  for (const { label, folder } of manifest.folders) {
    const target = sources.find(s => s.label === currentSaveLabel(label));
    if (!target) {
      skipped.push(label);
      continue;
    }
    const from = path.join(backupDir, folder);
    await fs.promises.mkdir(target.path, { recursive: true });
    for (const entry of await fs.promises.readdir(target.path, { withFileTypes: true })) {
      if (target.fileFilter ? entry.isFile() && target.fileFilter.test(entry.name) : true) {
        await fs.promises.rm(path.join(target.path, entry.name), { recursive: true, force: true });
      }
    }
    await fs.promises.cp(from, target.path, { recursive: true });
  }
  await pruneAutomaticBackups(gameId);
  return { skipped };
}

export async function deleteSaveBackup(gameId: string, backupId: string): Promise<boolean> {
  assertBackupId(backupId);
  const dir = path.join(backupsDir(gameId), backupId);
  if (!fs.existsSync(dir)) return false;
  await fs.promises.rm(dir, { recursive: true, force: true });
  return true;
}
