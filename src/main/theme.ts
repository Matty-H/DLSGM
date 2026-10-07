import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { encodeIco, pngDimensions } from './icon-files';
import { resolveTheme, normalizeThemeSetting, sanitizeCustomThemes, type ActiveTheme, type CustomTheme } from '../shared/themes';

/**
 * Thème de couleur actif (réglage `theme`, src/shared/themes.ts). Résolu ici
 * une fois — au démarrage, quand le réglage change ou sur « Relancer » — et
 * lu par chaque fenêtre (`get-active-theme`), pour qu'en mode aléatoire ou
 * turbo l'overlay et les témoins aient les couleurs de la fenêtre principale.
 */

let setting = normalizeThemeSetting(undefined);
let customs: CustomTheme[] = [];
let active: ActiveTheme = resolveTheme(setting);
let iconListener: ((image: NativeImage) => void) | null = null;

export function getActiveTheme(): ActiveTheme {
  return active;
}

function broadcast(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('theme-changed', active);
  }
}

/** Au démarrage : tire le thème (aléatoire et turbo changent à chaque lancement). */
export function initTheme(value: unknown, customThemes?: unknown): void {
  customs = sanitizeCustomThemes(customThemes);
  setting = normalizeThemeSetting(value, customs);
  active = resolveTheme(setting, Math.random, undefined, customs);
}

/**
 * Réglages enregistrés : ne retire le thème que s'il a changé, ou si la
 * palette perso affichée a été modifiée ou supprimée (retour au défaut).
 */
export function applyThemeSetting(value: unknown, customThemes?: unknown): void {
  const previousCustom = JSON.stringify(customs.find(theme => theme.id === active.id) ?? null);
  customs = sanitizeCustomThemes(customThemes);
  const next = normalizeThemeSetting(value, customs);
  const customChanged = previousCustom !== JSON.stringify(customs.find(theme => theme.id === active.id) ?? null);
  if (next === setting && !customChanged) return;
  // Palette perso modifiée sans changer de réglage (même en mode aléatoire) :
  // on garde cette palette, à ses nouvelles couleurs ; supprimée : nouveau tirage.
  const edited = next === setting && customs.some(theme => theme.id === active.id);
  setting = next;
  active = edited ? resolveTheme(active.id, Math.random, undefined, customs) : resolveTheme(setting, Math.random, active.id, customs);
  broadcast();
}

/** « Relancer » (modes aléatoire et turbo) : nouveau tirage sans redémarrer. */
export function rerollTheme(): ActiveTheme {
  active = resolveTheme(setting, Math.random, active.id, customs);
  broadcast();
  return active;
}

const PNG_DATA_URL = 'data:image/png;base64,';

/**
 * Icône aux couleurs du thème, dessinée par le renderer (main ne sait pas
 * rasteriser un SVG) : un PNG (data URL) par taille de `sizes`
 * (`appIconLayout`), dans cet ordre, chacun vérifié avant usage.
 */
export function iconPngsFromDataUrls(list: unknown, sizes: readonly number[]): Buffer[] | null {
  if (!Array.isArray(list) || list.length !== sizes.length) return null;
  const pngs: Buffer[] = [];
  for (const [index, item] of list.entries()) {
    if (typeof item !== 'string' || !item.startsWith(PNG_DATA_URL) || item.length > 2_000_000) return null;
    const png = Buffer.from(item.slice(PNG_DATA_URL.length), 'base64');
    const dimensions = pngDimensions(png);
    if (!dimensions || dimensions.width !== sizes[index] || dimensions.height !== sizes[index]) return null;
    pngs.push(png);
  }
  return pngs;
}

/**
 * Windows : .ico multi-tailles écrit dans `iconDir`, ouvert par son chemin —
 * Electron demande alors à Windows la taille exacte voulue (barre des tâches,
 * Alt+Tab, zone de notification) au lieu de réduire un seul PNG, ce qui
 * crénelait l'icône. Ailleurs (ou si l'écriture échoue) : le plus grand PNG.
 */
export function buildThemeIcon(pngs: Buffer[], platform: string, iconDir: string): NativeImage | null {
  if (pngs.length === 0) return null;
  if (platform === 'win32') {
    try {
      const file = path.join(iconDir, 'theme-icon.ico');
      fs.writeFileSync(`${file}.tmp`, encodeIco(pngs));
      fs.renameSync(`${file}.tmp`, file);
      const image = nativeImage.createFromPath(file);
      if (!image.isEmpty()) return image;
    } catch (error) {
      console.error('Icône .ico du thème impossible :', error);
    }
  }
  const largest = pngs.reduce((a, b) => (pngDimensions(b)!.width > pngDimensions(a)!.width ? b : a));
  const image = nativeImage.createFromBuffer(largest);
  return image.isEmpty() ? null : image;
}

/** La zone de notification suit l'icône du thème (src/main/tray.ts). */
export function onThemeIcon(listener: (image: NativeImage) => void): void {
  iconListener = listener;
}

export function applyThemeIcon(window: BrowserWindow | null, image: NativeImage): void {
  if (window && !window.isDestroyed()) window.setIcon(image);
  // macOS : l'icône du Dock (celle du paquet .app, build/icon.icns, ne vaut que pour le thème par défaut).
  if (process.platform === 'darwin') app.dock?.setIcon(image);
  iconListener?.(image);
}
