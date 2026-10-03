import type { GameCache } from './cacheManager.js';
import { msg, tr, uiLocale } from './i18n.js';

/**
 * Gère les métadonnées des jeux et les catégories.
 */

export interface CategoryInfo {
  code: string;
  name: string;
}

// Correspondance des codes de catégories DLSite et leurs noms d'affichage
// (clés de traduction : afficher avec categoryLabel)
export const categoryMap: Record<string, string> = {
  "ACN": msg("Action"),
  "ADV": msg("Aventure"),
  "QIZ": msg("Quiz"),
  "ICG": msg("CG/Illustrations"),
  "DNV": msg("Roman Numérique"),
  "SCM": msg("Gekiga"),
  "IMT": msg("Matériel d'Illustration"),
  "MNG": msg("Manga"),
  "ET3": msg("Divers"),
  "ETC": msg("Jeu Divers"),
  "MUS": msg("Musique"),
  "AMT": msg("Matériel Musical"),
  "NRE": msg("Roman"),
  "PZL": msg("Puzzle"),
  "RPG": msg("Jeu de Rôle (RPG)"),
  "STG": msg("Shooting"),
  "SLN": msg("Simulation"),
  "TBL": msg("Table"),
  "TOL": msg("Outils/Accessoires"),
  "TYP": msg("Dactylographie"),
  "MOV": msg("Vidéo"),
  "SOU": msg("Voix/ASMR"),
  "VCM": msg("Bande Dessinée Audio"),
  "WBT": msg("Webtoon")
};

/** Nom affiché d'une catégorie DLsite, dans la langue de l'interface (le code s'il est inconnu). */
export function categoryLabel(code: string): string {
  return categoryMap[code] ? tr(categoryMap[code]) : code;
}

/**
 * Langues d'une œuvre (champ `language`) : main (dlsite-fetcher.ts) les
 * enregistre en français dans le cache ; traduites ici, à l'affichage.
 */
const WORK_LANGUAGES = [
  msg("Japonais"),
  msg("Anglais"),
  msg("Chinois (simplifié)"),
  msg("Chinois (traditionnel)"),
  msg("Coréen"),
  msg("Français"),
  msg("Allemand"),
  msg("Espagnol"),
  msg("Italien"),
  msg("Portugais"),
  msg("Russe"),
  msg("Ukrainien"),
  msg("Polonais"),
  msg("Néerlandais"),
  msg("Suédois"),
  msg("Danois"),
  msg("Finnois"),
  msg("Islandais"),
  msg("Tchèque"),
  msg("Slovaque"),
  msg("Slovène"),
  msg("Hongrois"),
  msg("Roumain"),
  msg("Bulgare"),
  msg("Grec"),
  msg("Estonien"),
  msg("Letton"),
  msg("Thaï"),
  msg("Vietnamien"),
  msg("Indonésien")
];

/** Langue d'une œuvre dans la langue de l'interface (telle quelle si inconnue). */
export function workLanguageLabel(language: string): string {
  return WORK_LANGUAGES.includes(language) ? tr(language) : language;
}

/**
 * Collecte toutes les catégories présentes dans le cache global.
 */
export function collectAllCategories(globalCache: GameCache): CategoryInfo[] {
  const uniqueCategoryCodes = new Set<string>();

  Object.values(globalCache).forEach(game => {
    if (game.category) {
      uniqueCategoryCodes.add(game.category);
    }
  });

  const categories = Array.from(uniqueCategoryCodes).map(code => ({
    code,
    name: categoryLabel(code)
  }));

  categories.sort((a, b) => a.name.localeCompare(b.name, uiLocale()));

  return categories;
}

/**
 * Collecte tous les genres présents dans le cache global.
 */
export function collectAllGenres(globalCache: GameCache): string[] {
  const genreSet = new Set<string>();

  Object.values(globalCache).forEach(game => {
    if (Array.isArray(game.genre)) {
      game.genre.forEach(genre => genreSet.add(genre));
    }
  });

  return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
}
