import fs from 'fs';
import path from 'path';
import type { Migration } from './index';
import { openDataFile } from './nedb';

/**
 * Jusqu'à la 1.1.0, le dossier des travaux par défaut s'appelait
 * `Documents/DLSGM/Travaux` ; c'est désormais `Documents/DLSGM/Work`.
 *
 * - `Work` n'existe pas : simple renommage.
 * - Les deux existent (Work créé entre-temps) : chaque sous-dossier de
 *   Travaux qui n'a pas d'équivalent dans Work y est déplacé ; les conflits
 *   restent dans Travaux (rien n'est jamais écrasé ni supprimé), qui n'est
 *   retiré que s'il est vide.
 * - Un dossier de travaux réglé explicitement sur `…/Travaux` dans les
 *   paramètres n'est pas touché : il est utilisé tel quel.
 */
export const workspaceTravauxToWork: Migration = {
  id: '002-workspace-travaux-to-work',
  // Documents/DLSGM : le profil leurre le renommerait malgré un dossier choisi dans le vrai profil.
  sharedData: true,
  async run({ userData, documents, log }) {
    const base = path.join(documents, 'DLSGM');
    const legacy = path.join(base, 'Travaux');
    const target = path.join(base, 'Work');
    if (!fs.existsSync(legacy)) return;
    if (await configuredFolderIs(userData, legacy)) return;

    if (!fs.existsSync(target)) {
      fs.renameSync(legacy, target);
      log(`Dossier des travaux renommé : ${legacy} → ${target}`);
      return;
    }
    for (const name of fs.readdirSync(legacy)) {
      const destination = path.join(target, name);
      if (fs.existsSync(destination)) {
        log(`Travaux en double, laissés dans l'ancien dossier : ${path.join(legacy, name)}`);
        continue;
      }
      fs.renameSync(path.join(legacy, name), destination);
    }
    if (fs.readdirSync(legacy).length === 0) fs.rmdirSync(legacy);
  }
};

/** Le dossier des travaux réglé dans les paramètres est-il exactement `dir` ? */
async function configuredFolderIs(userData: string, dir: string): Promise<boolean> {
  const settingsFile = path.join(userData, 'settings.db');
  if (!fs.existsSync(settingsFile)) return false;
  const doc = await (await openDataFile(settingsFile)).findOneAsync({ _id: 'workspaceFolder' });
  const configured = doc?.value;
  return typeof configured === 'string' && configured !== '' && path.resolve(configured).toLowerCase() === path.resolve(dir).toLowerCase();
}
