import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { buildCatalog, interpolate, lookup, resolveLanguage, type LocaleCatalog } from '../shared/locales';

/**
 * Traduction des textes affichés par le processus principal (pop-ups, menu
 * de la zone de notification, messages d'erreur remontés à l'interface).
 * Même principe que le renderer (src/renderer/src/lib/i18n.ts) : le texte
 * français sert de clé, `tm('…', { param })`, traductions dans la section
 * `main` des fichiers `locales/<code>.json`, lus ici sur le disque
 * (embarqués dans l'app packagée par `build.files`).
 */

/** Code BCP 47 d'une langue disponible (`fr`, `en`, `ja`, `de`…). */
export type UiLanguage = string;

/** Fichiers `<code>.json` d'un dossier ; un fichier illisible est signalé et ignoré. */
export function loadLocales(dir: string): { catalog: LocaleCatalog; errors: string[] } {
  const raw: Record<string, unknown> = {};
  const errors: string[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  } catch (error) {
    errors.push(`dossier des langues illisible (${dir}) : ${(error as Error).message}`);
  }
  for (const name of names) {
    try {
      raw[name.slice(0, -'.json'.length)] = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch (error) {
      errors.push(`${name} : ${(error as Error).message}`);
    }
  }
  const built = buildCatalog(raw);
  return { catalog: built.catalog, errors: [...errors, ...built.errors] };
}

let catalog: LocaleCatalog | null = null;

function getCatalog(): LocaleCatalog {
  if (!catalog) {
    const loaded = loadLocales(path.join(app.getAppPath(), 'locales'));
    for (const error of loaded.errors) console.warn('[i18n] fichier de langue ignoré :', error);
    catalog = loaded.catalog;
  }
  return catalog;
}

export function systemLanguages(): string[] {
  const preferred = app.getPreferredSystemLanguages();
  return preferred.length > 0 ? preferred : [app.getLocale()];
}

let current: UiLanguage = 'fr';

/** Choix des Paramètres, sinon langue du système si l'interface y est traduite, sinon anglais. */
export function setMainLanguage(setting: unknown): UiLanguage {
  current = resolveLanguage(setting, systemLanguages(), getCatalog());
  return current;
}

export function getMainLanguage(): UiLanguage {
  return current;
}

export function tm(key: string, params?: Record<string, string | number>): string {
  return interpolate(current === 'fr' ? key : lookup(getCatalog(), current, 'main', key), params);
}

/** Déclare une clé sans la traduire (libellé défini au niveau du module), traduite ensuite par `trm(…)`. */
export function msg(key: string): string {
  return key;
}

export function trm(key: string, params?: Record<string, string | number>): string {
  return tm(key, params);
}
