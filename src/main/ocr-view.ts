import { BrowserWindow, type Rectangle } from 'electron';
import type { OcrView } from '../shared/ipc-types';

/**
 * Fenêtre de la traduction à l'écran (route #ocr-view) : transparente,
 * toujours au premier plan, posée sur la zone client du jeu, chaque
 * traduction dessinée par-dessus son texte d'origine. Comme les contours
 * des zones : traversée par la souris, jamais de focus (le jeu se
 * réduirait), et exclue des captures (`setContentProtection`) — sinon une
 * nouvelle lecture OCR relirait les traductions affichées.
 *
 * Fermée par le raccourci (seconde pression) ou Échap (pris le temps de
 * l'affichage).
 */
export interface OcrViewOptions {
  preloadPath: string;
  loadPage: (window: BrowserWindow) => void;
}

const IDLE: OcrView = { status: 'idle', area: null, blocks: [], error: null, engine: 'none' };

export class OcrViewWindow {
  private window: BrowserWindow | null = null;
  private view: OcrView = IDLE;

  constructor(private readonly options: OcrViewOptions) {}

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
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: this.options.preloadPath }
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

  /** État affiché ; la page le demande à son montage (`get-ocr-view`), puis reçoit les mises à jour. */
  getView(): OcrView {
    return this.view;
  }

  isVisible(): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible());
  }

  /** Affiche `view` sur la zone `bounds` (DIP). */
  show(view: OcrView, bounds: Rectangle): void {
    this.view = view;
    const window = this.window && !this.window.isDestroyed() ? this.window : (this.window = this.create());
    window.setBounds(bounds);
    window.webContents.send('ocr-view', view);
    if (!window.isVisible()) window.showInactive();
  }

  /** Mise à jour sans déplacer la fenêtre (traductions arrivées). */
  update(view: OcrView): void {
    this.view = view;
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('ocr-view', view);
  }

  hide(): void {
    this.view = IDLE;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.window.hide();
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
