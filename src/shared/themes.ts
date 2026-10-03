/**
 * Thèmes de couleur (réglage `theme`) : une palette prédéfinie par son id,
 * `random` (une palette prédéfinie tirée au démarrage) ou `turbo` (« super
 * random turbo 2000 remix » : couleurs générées à chaque démarrage).
 *
 * Le thème est résolu une seule fois par main (au démarrage, puis quand le
 * réglage change ou sur « Relancer ») et lu par chaque fenêtre, pour que
 * l'overlay et les témoins aient les mêmes couleurs que la fenêtre principale
 * même en mode aléatoire.
 *
 * Seuls l'accent et les couleurs du logo changent : le fond bleu-nuit de la
 * direction artistique SteamOS est commun à tous les thèmes, les autres
 * nuances (survol, fond des tags, halo) sont dérivées de l'accent en CSS.
 *
 * Sans import : partagé par main (tsc) et le renderer (Vite).
 */

export interface ThemePalette {
  /** Couleur d'accent de l'interface (boutons, onglet actif, interrupteurs...). */
  accent: string;
  /** Texte posé sur l'accent : blanc ou bleu-nuit selon la luminance si absent. */
  onAccent?: string;
  /** Logo sur l'interface sombre : sans fond. */
  logo: { dls: string; gm: string };
  /** Icône (fenêtre, zone de notification, exécutable) : avec fond, à coins arrondis si `rounded`. */
  icon: { bg: string; dls: string; gm: string; rounded?: boolean };
}

/** Palette prédéfinie ; son nom affiché vit dans le renderer (THEME_LABELS, lib/themes.ts). */
export interface ThemeDefinition extends ThemePalette {
  id: string;
}

/** Thème actif, tel que main le transmet aux fenêtres. */
export interface ActiveTheme extends ThemePalette {
  /** Id de la palette prédéfinie, ou `turbo` pour une palette générée. */
  id: string;
}

/** Palette officielle de DLSGM (README, icône de l'exécutable) et thème par défaut. */
export const DEFAULT_THEME = 'neon';
export const RANDOM_THEME = 'random';
export const TURBO_THEME = 'turbo';

export const THEMES: ThemeDefinition[] = [
  { id: 'neon', accent: '#ff3ea5', logo: { dls: '#2de2e6', gm: '#ff3ea5' }, icon: { bg: '#1a1033', dls: '#2de2e6', gm: '#ff3ea5' } },
  { id: 'steam', accent: '#1a9fff', logo: { dls: '#ffffff', gm: '#1a9fff' }, icon: { bg: '#0e141b', dls: '#ffffff', gm: '#1a9fff' } },
  { id: 'sakura', accent: '#ff4f8b', logo: { dls: '#ffffff', gm: '#ff4f8b' }, icon: { bg: '#ff4f8b', dls: '#ffffff', gm: '#2a0e1d' } },
  { id: 'vermilion', accent: '#ff5a3c', logo: { dls: '#fff3e2', gm: '#ff5a3c' }, icon: { bg: '#e8432b', dls: '#fff3e2', gm: '#16121a' } },
  { id: 'retro', accent: '#ff7a45', logo: { dls: '#ff7a45', gm: '#f3e6cf' }, icon: { bg: '#f3e6cf', dls: '#e8572a', gm: '#1d3557' } },
  { id: 'matcha', accent: '#8fcf5a', onAccent: '#0e141b', logo: { dls: '#f4f0e0', gm: '#a8d672' }, icon: { bg: '#24331f', dls: '#f4f0e0', gm: '#a8d672' } },
  { id: 'lavender', accent: '#a68bff', logo: { dls: '#ffffff', gm: '#a68bff' }, icon: { bg: '#b9a3ff', dls: '#ffffff', gm: '#2b1d5c' } },
  { id: 'aizome', accent: '#4f8cff', logo: { dls: '#f5efe0', gm: '#6fa8ff' }, icon: { bg: '#1f3a68', dls: '#f5efe0', gm: '#7fb2ff' } },
  { id: 'mustard', accent: '#ffc61a', logo: { dls: '#ffc61a', gm: '#ffffff' }, icon: { bg: '#ffc61a', dls: '#1a1a1a', gm: '#ffffff' } },
  { id: 'sunset', accent: '#ff7a59', logo: { dls: '#ffd166', gm: '#ff5d73' }, icon: { bg: '#2d1b3d', dls: '#ffd166', gm: '#ff5d73' } },
  { id: 'mint', accent: '#2fd6a6', onAccent: '#0e141b', logo: { dls: '#e9fff8', gm: '#3ee0b0' }, icon: { bg: '#0f2b2a', dls: '#e9fff8', gm: '#3ee0b0' } },
  { id: 'peach', accent: '#ff9a76', logo: { dls: '#ffe3d6', gm: '#ff9a76' }, icon: { bg: '#ffb38a', dls: '#3a1f2b', gm: '#ffffff' } },
  { id: 'gameboy', accent: '#9bbc0f', onAccent: '#0e141b', logo: { dls: '#c4e07a', gm: '#9bbc0f' }, icon: { bg: '#9bbc0f', dls: '#0f380f', gm: '#306230' } },
  { id: 'original', accent: '#e6e6e6', logo: { dls: '#ffffff', gm: '#ffffff' }, icon: { bg: '#ffffff', dls: '#000000', gm: '#000000' } }
];

/** Palette créée par l'utilisateur (réglage `customThemes`) : les trois couleurs de l'icône. */
export interface CustomTheme {
  id: string;
  name: string;
  dls: string;
  gm: string;
  bg: string;
  /** Coins arrondis pour le fond de l'icône. */
  rounded: boolean;
}

export const MAX_CUSTOM_THEMES = 30;
export const MAX_CUSTOM_THEME_NAME = 40;
const CUSTOM_THEME_ID = /^custom-[a-z0-9]{4,24}$/;

/** Rayon des coins arrondis de l'icône, en fraction de son côté. */
export const ICON_CORNER_RADIUS = 0.2;

/** Palettes perso reçues du renderer ou relues des réglages : forme et couleurs vérifiées, doublons et excédent retirés. */
export function sanitizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CustomTheme[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const theme = item as Partial<CustomTheme>;
    if (typeof theme.id !== 'string' || !CUSTOM_THEME_ID.test(theme.id) || seen.has(theme.id)) continue;
    if (![theme.dls, theme.gm, theme.bg].every(isHexColor)) continue;
    const name = typeof theme.name === 'string' ? theme.name.replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_THEME_NAME) : '';
    if (!name) continue;
    seen.add(theme.id);
    result.push({ id: theme.id, name, dls: theme.dls!.toLowerCase(), gm: theme.gm!.toLowerCase(), bg: theme.bg!.toLowerCase(), rounded: theme.rounded === true });
    if (result.length >= MAX_CUSTOM_THEMES) break;
  }
  return result;
}

/** Nouvel id de palette perso (jamais réutilisé en pratique : aléatoire). */
export function newCustomThemeId(random: () => number = Math.random): string {
  return 'custom-' + Array.from({ length: 10 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(random() * 36) % 36]).join('');
}

/**
 * Palette complète d'une palette perso : l'icône garde exactement ses trois
 * couleurs ; sur l'interface sombre, le logo et l'accent (la plus colorée des
 * trois) sont éclaircis si besoin pour rester lisibles.
 */
export function customToTheme(custom: CustomTheme): ThemeDefinition {
  const accent = readable([custom.gm, custom.dls, custom.bg].reduce((best, color) => (chroma(color) > chroma(best) ? color : best)), UI_BACKGROUND, 3);
  return {
    id: custom.id,
    accent,
    logo: { dls: readable(custom.dls, UI_BACKGROUND, 3), gm: readable(custom.gm, UI_BACKGROUND, 3) },
    icon: { bg: custom.bg, dls: custom.dls, gm: custom.gm, rounded: custom.rounded }
  };
}

export function findTheme(id: string | undefined, customs: CustomTheme[] = []): ThemeDefinition | undefined {
  const custom = customs.find(theme => theme.id === id);
  return custom ? customToTheme(custom) : THEMES.find(theme => theme.id === id);
}

/** Réglage reconnu : palette existante (prédéfinie ou perso), `random` ou `turbo` ; sinon le thème par défaut. */
export function normalizeThemeSetting(value: unknown, customs: CustomTheme[] = []): string {
  return typeof value === 'string' && (value === RANDOM_THEME || value === TURBO_THEME || findTheme(value, customs)) ? value : DEFAULT_THEME;
}

function toActive(theme: ThemeDefinition): ActiveTheme {
  const { id, accent, onAccent, logo, icon } = theme;
  return { id, accent, onAccent: onAccent ?? onAccentColor(accent), logo: { ...logo }, icon: { ...icon } };
}

/**
 * Thème à appliquer pour un réglage. `random` : une palette au hasard parmi
 * les prédéfinies et les perso, différente de `previousId` quand c'est
 * possible (relancer le tirage change vraiment les couleurs).
 */
export function resolveTheme(setting: unknown, random: () => number = Math.random, previousId?: string, customs: CustomTheme[] = []): ActiveTheme {
  const value = normalizeThemeSetting(setting, customs);
  if (value === TURBO_THEME) return generateTurboTheme(random);
  if (value === RANDOM_THEME) {
    const all = [...THEMES, ...customs.map(customToTheme)];
    const pool = all.length > 1 ? all.filter(theme => theme.id !== previousId) : all;
    return toActive(pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]);
  }
  return toActive(findTheme(value, customs) ?? THEMES[0]);
}

// --- Couleurs ---

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Luminance relative WCAG (0 noir … 1 blanc). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Texte sur l'accent. Blanc jusqu'aux accents assez clairs (le bleu Steam
 * garde son texte blanc, comme avant les thèmes), bleu-nuit au-delà (jaune,
 * vert clair...).
 */
export function onAccentColor(accent: string): string {
  return luminance(accent) > 0.45 ? '#0e141b' : '#ffffff';
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(c => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

/** Intensité de la couleur (0 gris … 1 couleur pure). */
function chroma(hex: string): number {
  const values = channels(hex);
  return (Math.max(...values) - Math.min(...values)) / 255;
}

/** Même teinte, luminosité poussée jusqu'au contraste voulu avec `against` (inchangée si déjà lisible). */
export function readable(hex: string, against: string, min: number): string {
  if (contrastRatio(hex, against) >= min) return hex;
  const [h, s, l] = hexToHsl(hex);
  return contrasted(h, s, l, against, min);
}

/** Fond de l'interface (--color-bg), sur lequel le logo et l'accent doivent rester lisibles. */
export const UI_BACKGROUND = '#0e141b';

/**
 * Couleur HSL dont la luminosité est poussée (vers le clair sur fond sombre,
 * vers le sombre sur fond clair) jusqu'au contraste voulu avec `against`.
 */
function contrasted(h: number, s: number, l: number, against: string, min: number): string {
  const step = luminance(against) < 0.18 ? 3 : -3;
  let color = hslToHex(h, s, l);
  while (contrastRatio(color, against) < min && l > 0 && l < 100) {
    l = Math.max(0, Math.min(100, l + step));
    color = hslToHex(h, s, l);
  }
  return color;
}

/**
 * « Super random turbo 2000 remix » : une teinte au hasard pour l'accent, une
 * teinte voisine ou opposée pour le DLS, et une des trois compositions
 * d'icône des palettes prédéfinies (fond nuit, fond accent, fond clair).
 * Chaque couleur est ajustée jusqu'à un contraste suffisant avec ce sur quoi
 * elle est posée (fond de l'interface, fond de l'icône).
 */
export function generateTurboTheme(random: () => number = Math.random): ActiveTheme {
  const between = (min: number, max: number) => min + random() * (max - min);
  const hue = between(0, 360);
  const partnerHue = hue + [0, 30, 150, 180, 210, 330][Math.floor(random() * 6) % 6];

  // Accent et logo : vifs, lisibles sur le fond nuit de l'interface.
  const accent = contrasted(hue, between(75, 98), between(55, 68), UI_BACKGROUND, 4.5);
  const dls = random() < 0.4
    ? contrasted(partnerHue, between(60, 100), between(90, 96), UI_BACKGROUND, 4.5)
    : contrasted(partnerHue, between(70, 95), between(62, 75), UI_BACKGROUND, 4.5);

  let icon: ThemePalette['icon'];
  const composition = Math.floor(random() * 3) % 3;
  if (composition === 0) {
    const bg = hslToHex(hue, between(25, 45), between(8, 14));
    icon = { bg, dls: contrasted(partnerHue, 80, 75, bg, 4.5), gm: contrasted(hue, 90, 60, bg, 3) };
  } else if (composition === 1) {
    const bg = accent;
    const darkGm = contrasted(hue, between(40, 60), between(8, 14), bg, 3);
    icon = { bg, dls: contrastRatio('#ffffff', bg) >= 2.5 ? '#ffffff' : contrasted(partnerHue, 60, 30, bg, 3), gm: darkGm };
  } else {
    const bg = hslToHex(partnerHue, between(40, 70), between(88, 93));
    icon = { bg, dls: contrasted(hue, 85, 48, bg, 3), gm: contrasted(partnerHue, between(40, 60), between(18, 26), bg, 4.5) };
  }

  return { id: TURBO_THEME, accent, onAccent: onAccentColor(accent), logo: { dls, gm: accent }, icon };
}
