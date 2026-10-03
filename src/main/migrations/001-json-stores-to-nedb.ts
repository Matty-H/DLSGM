import fs from 'fs';
import path from 'path';
import type { Migration } from './index';
import { openDataFile } from './nedb';

/** Store NeDB actuel et ancien fichier JSON monobloc qu'il remplace. */
const LEGACY_STORES: [store: string, legacy: string][] = [
  ['settings.db', 'settings.json'],
  ['cache.db', 'cache.json']
];

/**
 * Premières versions : réglages et cache dans un seul fichier JSON chacun
 * (`settings.json`, `cache.json`), réécrit en entier à chaque changement.
 * Converti en un document NeDB par clé, seulement si le store NeDB est
 * encore vide ; l'ancien fichier est renommé `.migrated` (jamais effacé).
 */
export const jsonStoresToNedb: Migration = {
  id: '001-json-stores-to-nedb',
  async run({ userData, log }) {
    for (const [storeName, legacyName] of LEGACY_STORES) {
      const legacyFile = path.join(userData, legacyName);
      if (!fs.existsSync(legacyFile)) continue;
      const db = await openDataFile(path.join(userData, storeName));
      if ((await db.countAsync({})) > 0) continue; // déjà converti (ou store recréé depuis)
      let data: unknown;
      try {
        data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      } catch (error) {
        log(`Ancien store illisible, laissé tel quel : ${legacyFile}`, error);
        continue;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        log(`Ancien store inattendu, laissé tel quel : ${legacyFile}`);
        continue;
      }
      const docs = Object.entries(data as Record<string, unknown>).map(([key, value]) => ({ _id: key, value }));
      if (docs.length > 0) {
        await db.insertAsync(docs);
        await db.compactDatafileAsync();
      }
      fs.renameSync(legacyFile, `${legacyFile}.migrated`);
      log(`Ancien store converti : ${legacyFile} → ${storeName}`);
    }
  }
};
