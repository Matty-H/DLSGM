import fs from 'fs';
import path from 'path';
import type { Migration } from './index';
import { openDataFile } from './nedb';

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/;

/** Paires JP → EN tirées d'anciens groupes de genres liés (un membre japonais, un non japonais). */
export function pairsFromAliasGroups(groups: unknown): Record<string, string> {
  const pairs: Record<string, string> = {};
  if (!Array.isArray(groups)) return pairs;
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const japanese = group.find((g): g is string => typeof g === 'string' && JAPANESE.test(g));
    const english = group.find((g): g is string => typeof g === 'string' && g.trim() !== '' && !JAPANESE.test(g));
    if (japanese && english) pairs[japanese] = english;
  }
  return pairs;
}

/**
 * Ancien réglage `genreAliasGroups` (« genres liés », remplacé par le
 * dictionnaire des tags) : ses paires japonais → anglais sont ajoutées au
 * dictionnaire (`translations.db`) sans rien y écraser, puis le réglage est
 * retiré.
 */
export const genreAliasGroups: Migration = {
  id: '004-genre-alias-groups',
  async run({ userData }) {
    const settingsFile = path.join(userData, 'settings.db');
    if (!fs.existsSync(settingsFile)) return;
    const settings = await openDataFile(settingsFile);
    const doc = await settings.findOneAsync({ _id: 'genreAliasGroups' });
    if (!doc) return;
    const pairs = pairsFromAliasGroups(doc.value);
    if (Object.keys(pairs).length > 0) {
      const translations = await openDataFile(path.join(userData, 'translations.db'));
      for (const [japanese, english] of Object.entries(pairs)) {
        if (await translations.findOneAsync({ _id: japanese })) continue;
        await translations.insertAsync({ _id: japanese, value: { en: english } });
      }
      await translations.compactDatafileAsync();
    }
    // Retiré seulement une fois le dictionnaire écrit.
    await settings.removeAsync({ _id: 'genreAliasGroups' }, {});
    await settings.compactDatafileAsync();
  }
};
