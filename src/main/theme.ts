import { BrowserWindow, nativeImage, type NativeImage } from 'electron';
import { resolveTheme, normalizeThemeSetting, type ActiveTheme } from '../shared/themes';

/**
 * Thème de couleur actif (réglage `theme`, src/shared/themes.ts). Résolu ici
 * une fois — au démarrage, quand le réglage change ou sur « Relancer » — et
 * lu par chaque fenêtre (`get-active-theme`), pour qu'en mode aléatoire ou
 * turbo l'overlay et les témoins aient les couleurs de la fenêtre principale.
 */

let setting = normalizeThemeSetting(undefined);
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
export function initTheme(value: unknown): void {
  setting = normalizeThemeSetting(value);
  active = resolveTheme(setting);
}

/** Réglage enregistré : ne retire le thème que s'il a changé. */
export function applyThemeSetting(value: unknown): void {
  const next = normalizeThemeSetting(value);
  if (next === setting) return;
  setting = next;
  active = resolveTheme(setting, Math.random, active.id);
  broadcast();
}

/** « Relancer » (modes aléatoire et turbo) : nouveau tirage sans redémarrer. */
export function rerollTheme(): ActiveTheme {
  active = resolveTheme(setting, Math.random, active.id);
  broadcast();
  return active;
}

/**
 * Icône aux couleurs du thème, dessinée par le renderer (main ne sait pas
 * rasteriser un SVG) : PNG en data URL, vérifié avant usage.
 */
export function iconFromDataUrl(dataUrl: unknown): NativeImage | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 2_000_000) return null;
  const image = nativeImage.createFromDataURL(dataUrl);
  return image.isEmpty() ? null : image;
}

/** La zone de notification suit l'icône du thème (src/main/tray.ts). */
export function onThemeIcon(listener: (image: NativeImage) => void): void {
  iconListener = listener;
}

export function applyThemeIcon(window: BrowserWindow | null, image: NativeImage): void {
  if (window && !window.isDestroyed()) window.setIcon(image);
  iconListener?.(image);
}
