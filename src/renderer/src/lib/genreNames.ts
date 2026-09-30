import type { GenreTranslations } from '../../../shared/ipc-types';

/**
 * Noms des tags (genres DLsite). Le japonais est la langue de référence :
 * un genre est identifié partout (filtres, statistiques) par son nom
 * japonais ; l'anglais n'est qu'une traduction d'affichage, tirée du
 * dictionnaire JP → EN (src/main/genre-translations.ts).
 *
 * Les fiches récupérées autrefois en anglais ont encore des genres anglais :
 * `canonical` les ramène à leur clé japonaise quand le dictionnaire connaît
 * la traduction, pour qu'un même tag ne compte jamais deux fois.
 */

export type { GenreTranslations };

/** 'ja_JP' : tags affichés en japonais (original) ; 'en_US' : traduction anglaise quand elle existe. */
export type DisplayLanguage = string;

export interface GenreNames {
  /** Clé de référence (nom japonais) d'un genre tel qu'il figure dans une fiche. */
  canonical: (genre: string) => string;
  /** Libellé affiché d'une clé de référence, selon la langue d'affichage. */
  label: (canonicalGenre: string) => string;
}

/** Vrai si `text` contient au moins un caractère japonais (hiragana/katakana/kanji). */
export function isJapaneseText(text: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/.test(text);
}

export function makeGenreNames(translations: GenreTranslations, displayLanguage: DisplayLanguage): GenreNames {
  const englishToJapanese = new Map<string, string>();
  for (const [japanese, { en }] of Object.entries(translations)) {
    if (!englishToJapanese.has(en)) englishToJapanese.set(en, japanese);
  }
  return {
    canonical: genre => englishToJapanese.get(genre) ?? genre,
    label: genre => (displayLanguage === 'en_US' ? translations[genre]?.en ?? genre : genre)
  };
}

/** Clés de référence dédoublonnées, triées selon leur libellé affiché. */
export function collectCanonicalGenres(rawGenres: string[], names: GenreNames): string[] {
  return Array.from(new Set(rawGenres.map(names.canonical))).sort((a, b) => names.label(a).localeCompare(names.label(b)));
}

/** Noms sans traduction (pas de dictionnaire chargé) : identité. */
export const IDENTITY_GENRE_NAMES: GenreNames = { canonical: g => g, label: g => g };
