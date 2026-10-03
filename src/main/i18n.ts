import { app } from 'electron';
import { MAIN_MESSAGES } from './messages';

/**
 * Traduction des textes affichés par le processus principal (pop-ups, menu
 * de la zone de notification, messages d'erreur remontés à l'interface).
 * Même principe que le renderer (src/renderer/src/lib/i18n.ts) : le texte
 * français sert de clé, `tm('…', { param })`, traductions dans messages.ts.
 */

export type UiLanguage = 'fr' | 'en' | 'ja';

/** Choix des Paramètres, sinon langue du système si fr/ja/en, sinon anglais. */
export function resolveUiLanguage(setting: unknown, systemLanguages: readonly string[]): UiLanguage {
  if (setting === 'fr' || setting === 'en' || setting === 'ja') return setting;
  const primary = (systemLanguages[0] ?? '').toLowerCase();
  if (primary.startsWith('fr')) return 'fr';
  if (primary.startsWith('ja')) return 'ja';
  return 'en';
}

export function systemLanguages(): string[] {
  const preferred = app.getPreferredSystemLanguages();
  return preferred.length > 0 ? preferred : [app.getLocale()];
}

let current: UiLanguage = 'fr';

export function setMainLanguage(setting: unknown): UiLanguage {
  current = resolveUiLanguage(setting, systemLanguages());
  return current;
}

export function getMainLanguage(): UiLanguage {
  return current;
}

export function tm(key: string, params?: Record<string, string | number>): string {
  const text = current === 'fr' ? key : MAIN_MESSAGES[key]?.[current] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Déclare une clé sans la traduire (libellé défini au niveau du module), traduite ensuite par `trm(…)`. */
export function msg(key: string): string {
  return key;
}

export function trm(key: string, params?: Record<string, string | number>): string {
  return tm(key, params);
}
