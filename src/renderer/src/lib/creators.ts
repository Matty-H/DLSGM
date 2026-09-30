import type { GameCacheEntry } from './cacheManager.js';

/**
 * Champs créateurs d'une fiche (cercle, auteur, série…) et correspondance
 * d'un jeu avec l'un d'eux. Module à part pour que filterManager et
 * collections l'utilisent sans s'importer l'un l'autre. Pur, sans DOM.
 */

/** Champs de fiche qui désignent une personne ou un groupe, filtrables depuis la page d'un jeu. */
export type CreatorField =
  | 'circle'
  | 'brand'
  | 'publisher'
  | 'label'
  | 'series'
  | 'author'
  | 'writer'
  | 'scenario'
  | 'illustration'
  | 'voice_actor'
  | 'music';

export const CREATOR_FIELD_LABELS: Record<CreatorField, string> = {
  circle: 'Cercle',
  brand: 'Marque',
  publisher: 'Éditeur',
  label: 'Label',
  series: 'Série',
  author: 'Auteur',
  writer: 'Scénariste',
  scenario: 'Scénario',
  illustration: 'Illustration',
  voice_actor: 'Voix',
  music: 'Musique'
};

/** Filtre "même cercle / auteur / série..." : correspondance exacte sur un champ. */
export interface CreatorFilter {
  field: CreatorField;
  value: string;
  /**
   * Cercle / marque : identifiant DLsite (RG...), qui ne dépend pas de la
   * langue du fetch ("cat 3" et "猫3" sont le même cercle).
   */
  makerId?: string | null;
  /** Autres noms du même cercle (sa traduction anglaise) : pour les fiches sans identifiant. */
  otherNames?: (string | null | undefined)[];
}

/** Correspondance d'un jeu avec un filtre créateur : par identifiant de cercle si les deux l'ont, sinon par nom. */
export function matchesCreator(game: GameCacheEntry, filter: CreatorFilter): boolean {
  const gameMakerId = (game as Record<string, unknown>).maker_id;
  if ((filter.field === 'circle' || filter.field === 'brand') && filter.makerId && typeof gameMakerId === 'string' && gameMakerId) {
    return gameMakerId === filter.makerId;
  }
  const names = [filter.value, ...(filter.otherNames ?? [])].filter((n): n is string => Boolean(n));
  const gameNames = creatorValues(game, filter.field);
  if (filter.field === 'circle' && typeof game.circle_en === 'string') gameNames.push(game.circle_en);
  return gameNames.some(name => names.includes(name));
}

/** Valeurs d'un champ créateur d'une fiche (chaîne ou liste selon le champ). */
export function creatorValues(game: GameCacheEntry, field: CreatorField): string[] {
  const value = (game as Record<string, unknown>)[field];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return typeof value === 'string' && value.trim() !== '' ? [value] : [];
}
