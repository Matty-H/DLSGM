/**
 * Fichiers de langue de l'interface : `locales/<code>.json` à la racine du
 * dépôt, un par langue (voir TRANSLATING.md). Le texte français sert de clé,
 * le français n'a donc pas de fichier. Chaque fichier a deux sections : `ui`
 * (fenêtres, renderer) et `main` (pop-ups, menu de la zone de notification,
 * erreurs du processus principal) — une même phrase française peut s'y
 * traduire différemment (« Mettre à jour » : 更新 / 更新する).
 *
 * Logique pure partagée par le renderer (fichiers embarqués par Vite) et le
 * processus principal (fichiers lus sur le disque), pour que les deux
 * choisissent toujours la même langue.
 */

export type LocaleSection = 'ui' | 'main';

export interface LocaleFile {
  language: { name: string; locale: string };
  ui: Record<string, string>;
  main: Record<string, string>;
}

export interface UiLanguageInfo {
  /** Code BCP 47 = nom du fichier (`de`, `pt-BR`). */
  code: string;
  /** Nom de la langue dans cette langue (« Deutsch »), affiché dans les Paramètres. */
  name: string;
  /** Locale BCP 47 des dates et nombres (`de-DE`). */
  locale: string;
}

export interface LocaleCatalog {
  /** Français d'abord, puis anglais, puis les autres par code. */
  languages: UiLanguageInfo[];
  files: Map<string, LocaleFile>;
}

export const SOURCE_LANGUAGE: UiLanguageInfo = { code: 'fr', name: 'Français', locale: 'fr-FR' };
/** Langue de repli : système non traduit, et texte absent d'une traduction partielle. */
export const FALLBACK_LANGUAGE = 'en';
export const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function isValidLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
}

function readSection(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const section: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== 'string') return null;
    section[key] = text;
  }
  return section;
}

/** Contenu d'un fichier de langue, ou la raison pour laquelle il est refusé. */
export function parseLocaleFile(code: string, data: unknown): LocaleFile | string {
  if (!LANGUAGE_CODE.test(code)) return `nom de fichier invalide (code de langue attendu, ex. de, pt-BR) : ${code}`;
  if (code === SOURCE_LANGUAGE.code) return 'le français est la langue source, il n\'a pas de fichier';
  if (!data || typeof data !== 'object') return 'contenu invalide';
  const { language, ui, main } = data as Record<string, unknown>;
  const meta = language as Record<string, unknown> | undefined;
  if (!meta || typeof meta.name !== 'string' || !meta.name.trim()) return '"language.name" manquant';
  if (typeof meta.locale !== 'string' || !isValidLocale(meta.locale)) return '"language.locale" invalide (ex. de-DE)';
  const uiSection = readSection(ui ?? {});
  const mainSection = readSection(main ?? {});
  if (!uiSection) return '"ui" doit associer chaque texte français à une chaîne';
  if (!mainSection) return '"main" doit associer chaque texte français à une chaîne';
  return { language: { name: meta.name.trim(), locale: meta.locale }, ui: uiSection, main: mainSection };
}

/**
 * Catalogue à partir des fichiers trouvés (code → contenu JSON). Un fichier
 * invalide est ignoré et signalé dans `errors`, jamais bloquant.
 */
export function buildCatalog(raw: Record<string, unknown>): { catalog: LocaleCatalog; errors: string[] } {
  const files = new Map<string, LocaleFile>();
  const errors: string[] = [];
  for (const [code, data] of Object.entries(raw)) {
    const parsed = parseLocaleFile(code, data);
    if (typeof parsed === 'string') errors.push(`${code}.json : ${parsed}`);
    else files.set(code, parsed);
  }
  const others = [...files.keys()]
    .sort((a, b) => (a === FALLBACK_LANGUAGE ? -1 : b === FALLBACK_LANGUAGE ? 1 : a < b ? -1 : a > b ? 1 : 0))
    .map(code => ({ code, ...files.get(code)!.language }));
  return { catalog: { languages: [SOURCE_LANGUAGE, ...others], files }, errors };
}

/** Langue disponible la plus proche d'une étiquette BCP 47 (`de-AT` → `de`, `pt` → `pt-BR`). */
export function matchLanguage(tag: string, codes: readonly string[]): string | null {
  const wanted = tag.toLowerCase();
  const byLower = new Map(codes.map(code => [code.toLowerCase(), code]));
  const parts = wanted.split('-');
  for (let length = parts.length; length > 0; length--) {
    const found = byLower.get(parts.slice(0, length).join('-'));
    if (found) return found;
  }
  return codes.find(code => code.toLowerCase().split('-')[0] === parts[0]) ?? null;
}

/**
 * Langue choisie dans les Paramètres si elle existe, sinon celle du système
 * (première langue préférée) si DLSGM est traduit dans cette langue, sinon l'anglais.
 */
export function resolveLanguage(setting: unknown, systemLanguages: readonly string[], catalog: LocaleCatalog): string {
  const codes = catalog.languages.map(language => language.code);
  if (typeof setting === 'string' && setting !== 'system') {
    const chosen = codes.find(code => code.toLowerCase() === setting.toLowerCase());
    if (chosen) return chosen;
  }
  const system = systemLanguages[0] ? matchLanguage(systemLanguages[0], codes) : null;
  return system ?? (catalog.files.has(FALLBACK_LANGUAGE) ? FALLBACK_LANGUAGE : SOURCE_LANGUAGE.code);
}

/** Traduction d'une clé : langue choisie, sinon anglais, sinon le texte français. */
export function lookup(catalog: LocaleCatalog, language: string, section: LocaleSection, key: string): string {
  if (language === SOURCE_LANGUAGE.code) return key;
  return textOf(catalog.files.get(language), section, key) || textOf(catalog.files.get(FALLBACK_LANGUAGE), section, key) || key;
}

/** Propriétés propres seulement : `constructor`, `toString`… ne sont pas des traductions. */
function textOf(file: LocaleFile | undefined, section: LocaleSection, key: string): string {
  return file && Object.hasOwn(file[section], key) ? file[section][key] : '';
}

export function languageInfo(catalog: LocaleCatalog, code: string): UiLanguageInfo {
  return catalog.languages.find(language => language.code === code) ?? SOURCE_LANGUAGE;
}

export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
