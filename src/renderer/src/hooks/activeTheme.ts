import { useEffect, useState } from 'react';
import { DEFAULT_THEME, ICON_CORNER_RADIUS, resolveTheme, type ActiveTheme } from '../../../shared/themes';
import { appIconLayout, appIconSvg } from '../../../shared/logo';

/**
 * Thème actif dans cette fenêtre : résolu par main (src/main/theme.ts), posé
 * en variables CSS sur :root (index.css en dérive les nuances de l'accent),
 * mis à jour à chaque `theme-changed`.
 */

let current: ActiveTheme = resolveTheme(DEFAULT_THEME);
const listeners = new Set<(theme: ActiveTheme) => void>();

export function getActiveTheme(): ActiveTheme {
  return current;
}

/** Pose les couleurs du thème sur :root (aussi utilisé pour l'aperçu dans les paramètres). */
export function applyThemeColors(theme: ActiveTheme): void {
  const style = document.documentElement.style;
  style.setProperty('--theme-accent', theme.accent);
  style.setProperty('--theme-on-accent', theme.onAccent ?? '#ffffff');
  style.setProperty('--theme-logo-dls', theme.logo.dls);
  style.setProperty('--theme-logo-gm', theme.logo.gm);
}

/** SVG rasterisé à sa taille exacte (net à chaque taille, jamais une grande image réduite), en PNG data URL. */
async function rasterizeSvg(svg: string, size: number): Promise<string> {
  const image = new Image(size, size);
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible');
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

/**
 * Icône aux couleurs du thème, une PNG par taille voulue par l'OS
 * (`appIconLayout`) : .ico de la fenêtre et de la zone de notification sous
 * Windows, Dock sous macOS (assemblés par main). Coins transparents si
 * `rounded` : l'icône garde ses coins arrondis dans la barre des tâches.
 */
export function drawThemeIcons(theme: ActiveTheme): Promise<string[]> {
  const { sizes, mac } = appIconLayout(window.electronAPI.platform);
  const colors = { background: theme.icon.bg, dls: theme.icon.dls, gm: theme.icon.gm };
  const cornerRadius = theme.icon.rounded ? ICON_CORNER_RADIUS : 0;
  return Promise.all(sizes.map(size => rasterizeSvg(appIconSvg(colors, { size, cornerRadius, mac }), size)));
}

// Changements de thème rapprochés : seule la dernière icône dessinée est envoyée.
let iconRequest = 0;

function setActive(theme: ActiveTheme, drawsAppIcon: boolean): void {
  current = theme;
  applyThemeColors(theme);
  if (drawsAppIcon) {
    const request = ++iconRequest;
    drawThemeIcons(theme)
      .then(icons => { if (request === iconRequest) window.electronAPI.setAppIcon(icons); })
      .catch(error => console.error('Icône du thème impossible :', error));
  }
  for (const listener of listeners) listener(theme);
}

/**
 * Avant le premier rendu de chaque fenêtre. `drawsAppIcon` : fenêtre
 * principale seulement (main ignore les autres).
 */
export async function initActiveTheme(drawsAppIcon: boolean): Promise<void> {
  window.electronAPI.onThemeChanged(theme => setActive(theme, drawsAppIcon));
  try {
    setActive(await window.electronAPI.getActiveTheme(), drawsAppIcon);
  } catch {
    applyThemeColors(current);
  }
}

export function useActiveTheme(): ActiveTheme {
  const [theme, setTheme] = useState(current);
  useEffect(() => {
    listeners.add(setTheme);
    setTheme(current);
    return () => {
      listeners.delete(setTheme);
    };
  }, []);
  return theme;
}
