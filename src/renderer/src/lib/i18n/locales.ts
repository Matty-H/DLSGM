import { buildCatalog } from '../../../../shared/locales.js';

/**
 * Fichiers de langue `locales/*.json` (racine du dépôt), embarqués dans le
 * bundle par Vite : ajouter un fichier suffit pour que la langue apparaisse
 * dans les Paramètres (voir TRANSLATING.md).
 */
const files = import.meta.glob<unknown>('../../../../../locales/*.json', { eager: true, import: 'default' });

const { catalog, errors } = buildCatalog(
  Object.fromEntries(Object.entries(files).map(([file, data]) => [file.replace(/^.*\/|\.json$/g, ''), data]))
);
for (const error of errors) console.warn(`[i18n] fichier de langue ignoré : ${error}`);

export const CATALOG = catalog;
