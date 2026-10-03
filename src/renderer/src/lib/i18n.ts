import { CATALOG } from './i18n/locales.js';
import { interpolate, languageInfo, lookup, resolveLanguage, SOURCE_LANGUAGE, type UiLanguageInfo } from '../../../shared/locales.js';

export { interpolate };
export type { UiLanguageInfo };

/**
 * Traduction de l'interface.
 *
 * Le texte français sert de clé : `t('Paramètres')`, avec ses traductions dans
 * `locales/<code>.json` (section `ui`), un fichier par langue, découvert
 * automatiquement (src/shared/locales.ts, TRANSLATING.md). Paramètres entre
 * accolades : `t('{n} œuvres', { n })`. La clé doit être une chaîne littérale
 * (tests/renderer/i18n.test.ts vérifie que chaque clé a ses traductions
 * anglaise et japonaise). Texte absent d'une traduction partielle : anglais,
 * sinon français.
 *
 * La langue est fixée au démarrage de chaque fenêtre (main.tsx) ; en changer
 * recharge les fenêtres (save-settings dans main).
 */

/** Code BCP 47 d'une langue disponible (`fr`, `en`, `ja`, `de`…). */
export type UiLanguage = string;
/** Réglage `uiLanguage` : `system` ou le code d'une langue. */
export type UiLanguageSetting = 'system' | UiLanguage;

/** Langues disponibles : français, anglais, puis les autres fichiers de `locales/`. */
export function uiLanguages(): UiLanguageInfo[] {
  return CATALOG.languages;
}

/**
 * Langue choisie dans les Paramètres, sinon celle du système (première langue
 * préférée) si l'interface y est traduite, sinon l'anglais.
 */
export function resolveUiLanguage(setting: unknown, systemLanguages: readonly string[]): UiLanguage {
  return resolveLanguage(setting, systemLanguages, CATALOG);
}

let current: UiLanguageInfo = SOURCE_LANGUAGE;

export function setUiLanguage(language: UiLanguage): void {
  current = languageInfo(CATALOG, language);
}

export function getUiLanguage(): UiLanguage {
  return current.code;
}

/** Locale BCP 47 pour les dates et nombres (toLocaleDateString, Intl...). */
export function uiLocale(): string {
  return current.locale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  return interpolate(lookup(CATALOG, current.code, 'ui', key), params);
}

/**
 * Déclare une clé sans la traduire, pour les libellés définis au niveau d'un
 * module (évalués à l'import, avant que la langue soit connue) : on stocke
 * `msg('Bibliothèque')` et on affiche `tr(label)`.
 */
export function msg(key: string): string {
  return key;
}

/** Traduit une clé déclarée ailleurs avec `msg(…)` (ou `t(…)`). */
export function tr(key: string, params?: Record<string, string | number>): string {
  return t(key, params);
}
