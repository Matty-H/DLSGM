import { MESSAGES } from './i18n/messages.js';

/**
 * Traduction de l'interface (français, anglais, japonais).
 *
 * Le texte français sert de clé : `t('Paramètres')`, avec ses traductions
 * anglaise et japonaise dans `lib/i18n/messages/*.ts`. Paramètres entre
 * accolades : `t('{n} œuvres', { n })`. La clé doit être une chaîne littérale
 * (tests/renderer/i18n.test.ts vérifie que chaque clé a ses deux traductions).
 *
 * La langue est fixée au démarrage de chaque fenêtre (main.tsx) ; en changer
 * recharge les fenêtres (save-settings dans main).
 */

export type UiLanguage = 'fr' | 'en' | 'ja';
export type UiLanguageSetting = 'system' | UiLanguage;

export type Messages = Record<string, { en: string; ja: string }>;

/**
 * Langue choisie dans les Paramètres, sinon celle du système (première langue
 * préférée) si c'est le français, l'anglais ou le japonais, sinon l'anglais.
 */
export function resolveUiLanguage(setting: unknown, systemLanguages: readonly string[]): UiLanguage {
  if (setting === 'fr' || setting === 'en' || setting === 'ja') return setting;
  const primary = (systemLanguages[0] ?? '').toLowerCase();
  if (primary.startsWith('fr')) return 'fr';
  if (primary.startsWith('ja')) return 'ja';
  return 'en';
}

let current: UiLanguage = 'fr';

export function setUiLanguage(language: UiLanguage): void {
  current = language;
}

export function getUiLanguage(): UiLanguage {
  return current;
}

/** Locale BCP 47 pour les dates et nombres (toLocaleDateString, Intl...). */
export function uiLocale(): string {
  return current === 'fr' ? 'fr-FR' : current === 'ja' ? 'ja-JP' : 'en-US';
}

export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function t(key: string, params?: Record<string, string | number>): string {
  const text = current === 'fr' ? key : MESSAGES[key]?.[current] ?? key;
  return interpolate(text, params);
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
