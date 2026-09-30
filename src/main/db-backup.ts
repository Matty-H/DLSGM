import fs from 'fs';
import path from 'path';

/**
 * Copies de la base avant une opération qui réécrit beaucoup de fiches
 * d'un coup (mise à jour groupée depuis DLsite) : `<userData>/db_backups/
 * <nom>-<date>.db`, les `keep` plus récentes conservées. En cas de problème,
 * DLSGM fermé, il suffit de remettre la copie à la place de cache.db.
 */
export async function snapshotDatabase(userDataDir: string, fileName: string, keep = 5): Promise<string> {
  const source = path.join(userDataDir, fileName);
  const dir = path.join(userDataDir, 'db_backups');
  await fs.promises.mkdir(dir, { recursive: true });
  const base = path.basename(fileName, path.extname(fileName));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `${base}-${stamp}${path.extname(fileName)}`);
  await fs.promises.copyFile(source, target);

  const previous = (await fs.promises.readdir(dir)).filter(name => name.startsWith(`${base}-`)).sort().reverse();
  for (const old of previous.slice(keep)) await fs.promises.rm(path.join(dir, old), { force: true });
  return target;
}
