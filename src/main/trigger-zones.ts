import { BrowserWindow, screen, type Rectangle } from 'electron';
import type { PixelTrigger, TriggerZonesView } from '../shared/ipc-types';

/**
 * Zones du détecteur de rythme dessinées par-dessus le jeu (route
 * #trigger-zones) : un contour par zone, vert un instant à chaque action.
 *
 * Ce qui est dessiné à l'écran est aussi ce que le détecteur lit : le
 * contour est tracé **à l'extérieur** de la zone (jamais sur ses pixels,
 * sinon le flash vert se redéclencherait lui-même en mode mouvement), et la
 * fenêtre est exclue des captures (`setContentProtection`). Elle ne prend
 * jamais le focus ni les clics (`setIgnoreMouseEvents`) : les clics
 * envoyés au centre des zones arrivent au jeu.
 *
 * Elle couvre la fenêtre du jeu (et la suit) ; à défaut, l'écran des zones.
 * Une zone hors de la fenêtre du jeu n'est donc pas dessinée.
 */

export interface TriggerZonesOptions {
  preloadPath: string;
  loadPage: (window: BrowserWindow) => void;
  /** Zone client de la fenêtre du jeu en DIP (null : inconnue). */
  area?: () => Rectangle | null;
}

/** Origine de la fenêtre des contours (jeu, ou écran des zones) et zones à afficher. */
export function zonesView(triggers: PixelTrigger[], display: { bounds: { x: number; y: number } }): TriggerZonesView {
  return {
    origin: { x: display.bounds.x, y: display.bounds.y },
    zones: triggers.filter(t => t.zone).map(t => ({ id: t.id, name: t.name, zone: t.zone!, delayMs: t.delayMs }))
  };
}

export class TriggerZonesWindow {
  private window: BrowserWindow | null = null;
  private view: TriggerZonesView | null = null;
  private triggers: PixelTrigger[] = [];

  constructor(private readonly options: TriggerZonesOptions) {}

  private create(): BrowserWindow {
    const window = new BrowserWindow({
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
    window.setIgnoreMouseEvents(true);
    window.setContentProtection(true);
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    this.options.loadPage(window);
    return window;
  }

  /**
   * Zones affichées. La page les demande à son montage (`get-trigger-zones`) :
   * un envoi au chargement arriverait avant que React n'écoute, et serait perdu.
   */
  getView(): TriggerZonesView | null {
    return this.view;
  }

  /** Zones à afficher ; vide = fenêtre cachée. */
  show(triggers: PixelTrigger[]): void {
    const aimed = triggers.filter(t => t.zone);
    this.triggers = aimed;
    if (aimed.length === 0) {
      this.hide();
      return;
    }
    const bounds = this.options.area?.() ?? this.displayBounds(aimed);
    this.view = zonesView(aimed, { bounds });
    const window = this.window && !this.window.isDestroyed() ? this.window : (this.window = this.create());
    window.setBounds(bounds);
    window.webContents.send('trigger-zones', this.view);
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', () => window.showInactive());
    else if (!window.isVisible()) window.showInactive();
  }

  /** Écran qui contient le centre du rectangle englobant les zones. */
  private displayBounds(aimed: PixelTrigger[]): Rectangle {
    const xs = aimed.flatMap(t => [t.zone!.x, t.zone!.x + t.zone!.width]);
    const ys = aimed.flatMap(t => [t.zone!.y, t.zone!.y + t.zone!.height]);
    const center = { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) };
    return screen.getDisplayNearestPoint(center).bounds;
  }

  /** La fenêtre du jeu a bougé : les contours affichés la suivent. */
  followGame(): void {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.show(this.triggers);
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.window.hide();
  }

  send(channel: string, ...args: unknown[]): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, ...args);
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
