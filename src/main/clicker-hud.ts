import { BrowserWindow, screen, type Rectangle } from 'electron';

/**
 * Témoin de l'auto-clicker : petite fenêtre toujours au premier plan en bas
 * à gauche de la fenêtre du jeu (qu'il suit si elle bouge ; à défaut, de
 * l'écran principal), tant que l'auto-clicker est activé
 * (pastille verte en marche, orange en pause, rouge à l'arrêt, et le
 * rythme). Elle ne prend jamais le focus au jeu (`focusable: false`, même
 * dépliée : un jeu qui perd le focus se réduit souvent), d'où des réglages
 * rapides à la souris seulement.
 * Sa taille suit son contenu : une zone transparente plus grande
 * intercepterait les clics destinés au jeu.
 */

export const HUD_COLLAPSED = { width: 230, height: 44 };
export const HUD_EXPANDED = { width: 330, height: 300 };
const MARGIN = 12;

export interface ClickerHudOptions {
  preloadPath: string;
  loadPage: (window: BrowserWindow) => void;
  /** Décalage vers la droite (témoin du détecteur de rythme, à côté de celui de l'auto-clicker). */
  offsetX?: number;
  /** Taille dépliée (réglages rapides), HUD_EXPANDED par défaut. */
  expandedSize?: { width: number; height: number };
  /** Zone client de la fenêtre du jeu en DIP (null : inconnue, zone de travail de l'écran principal). */
  area?: () => Rectangle | null;
}

/**
 * Coin bas gauche de la zone donnée (fenêtre du jeu, ou zone de travail
 * au-dessus de la barre des tâches), sans en déborder quand elle est petite
 * (sinon calé sur son bord haut / gauche).
 */
export function hudBounds(
  area: { x: number; y: number; width: number; height: number },
  expanded: boolean,
  offsetX = 0,
  expandedSize = HUD_EXPANDED
) {
  const size = expanded ? expandedSize : HUD_COLLAPSED;
  const x = Math.max(area.x, Math.min(area.x + MARGIN + offsetX, area.x + area.width - size.width));
  const y = Math.max(area.y, area.y + area.height - size.height - MARGIN);
  return { x, y, ...size };
}

/** Témoin du détecteur de rythme : à droite de celui de l'auto-clicker, même déplié. */
export const TRIGGER_HUD_OFFSET_X = HUD_EXPANDED.width + MARGIN;
/** Témoin du détecteur déplié : ses zones et le raccourci (contenu défilant au-delà). */
/** Témoin de l'enregistreur de macros : à droite de celui du détecteur (replié). */
export const MACRO_HUD_OFFSET_X = TRIGGER_HUD_OFFSET_X + HUD_COLLAPSED.width + MARGIN;

export const TRIGGER_HUD_EXPANDED = { width: 380, height: 560 };

export class ClickerHud {
  private window: BrowserWindow | null = null;
  private expanded = false;

  constructor(private readonly options: ClickerHudOptions) {}

  private bounds(expanded: boolean) {
    const area = this.options.area?.() ?? screen.getPrimaryDisplay().workArea;
    return hudBounds(area, expanded, this.options.offsetX, this.options.expandedSize);
  }

  private create(): BrowserWindow {
    const window = new BrowserWindow({
      ...this.bounds(false),
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      thickFrame: false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: this.options.preloadPath
      }
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    this.options.loadPage(window);
    return window;
  }

  setVisible(visible: boolean): void {
    if (!visible) {
      this.setExpanded(false);
      if (this.window && !this.window.isDestroyed()) this.window.hide();
      return;
    }
    const window = this.window && !this.window.isDestroyed() ? this.window : (this.window = this.create());
    window.setBounds(this.bounds(this.expanded));
    // showInactive : le jeu garde le focus.
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', () => window.showInactive());
    else if (!window.isVisible()) window.showInactive();
  }

  /** Déplié (réglages rapides) ou replié : la fenêtre suit la taille du contenu. */
  setExpanded(expanded: boolean): void {
    const window = this.window;
    if (!window || window.isDestroyed() || this.expanded === expanded) return;
    this.expanded = expanded;
    window.setBounds(this.bounds(expanded));
    window.webContents.send('clicker-hud-expanded', expanded);
  }

  /** La fenêtre du jeu a bougé : le témoin affiché la suit. */
  followGame(): void {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.window.setBounds(this.bounds(this.expanded));
  }

  send(channel: string, ...args: unknown[]): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, ...args);
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.expanded = false;
  }
}
