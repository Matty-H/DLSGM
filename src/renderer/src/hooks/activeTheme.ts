import { useEffect, useState } from 'react';
import { DEFAULT_THEME, ICON_CORNER_RADIUS, resolveTheme, type ActiveTheme } from '../../../shared/themes';
import { LOGO_SQUARE } from '../../../shared/logo';

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

/** Icône carrée aux couleurs du thème, en PNG (fenêtre et zone de notification, via main). */
export function drawThemeIcon(theme: ActiveTheme, size = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const [, , width] = LOGO_SQUARE.viewBox;
  context.scale(size / width, size / width);
  context.fillStyle = theme.icon.bg;
  if (theme.icon.rounded) {
    // Coins transparents : l'icône garde ses coins arrondis dans la barre des tâches.
    context.beginPath();
    context.roundRect(0, 0, width, width, width * ICON_CORNER_RADIUS);
    context.fill();
  } else {
    context.fillRect(0, 0, width, width);
  }
  context.fillStyle = theme.icon.gm;
  for (const d of LOGO_SQUARE.gm) context.fill(new Path2D(d));
  context.fillStyle = theme.icon.dls;
  for (const d of LOGO_SQUARE.dls) context.fill(new Path2D(d));
  return canvas.toDataURL('image/png');
}

function setActive(theme: ActiveTheme, drawsAppIcon: boolean): void {
  current = theme;
  applyThemeColors(theme);
  if (drawsAppIcon) {
    const icon = drawThemeIcon(theme);
    if (icon) window.electronAPI.setAppIcon(icon);
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
