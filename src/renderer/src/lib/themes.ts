import { RANDOM_THEME, THEMES, TURBO_THEME } from '../../../shared/themes';
import { msg, tr } from './i18n.js';

/** Noms affichés des thèmes (src/shared/themes.ts), déclarés pour la traduction. */
const THEME_LABELS: Record<string, string> = {
  steam: msg('Bleu Steam'),
  sakura: msg('Sakura'),
  vermilion: msg('Vermillon'),
  retro: msg('Rétro 70s'),
  matcha: msg('Matcha'),
  neon: msg('Néon Tokyo'),
  lavender: msg('Lavande'),
  aizome: msg('Aizome'),
  mustard: msg('Moutarde'),
  sunset: msg('Coucher de soleil'),
  mint: msg('Menthe'),
  peach: msg('Pêche'),
  gameboy: msg('Game Boy'),
  original: msg('Original'),
  [RANDOM_THEME]: msg('Aléatoire'),
  [TURBO_THEME]: msg('Super random turbo 2000 remix')
};

export function themeLabel(id: string): string {
  const label = THEME_LABELS[id];
  return label ? tr(label) : id;
}

/** Ids proposés dans les paramètres : palettes prédéfinies, puis les deux modes aléatoires. */
export function themeChoices(): string[] {
  return [...THEMES.map(theme => theme.id), RANDOM_THEME, TURBO_THEME];
}
