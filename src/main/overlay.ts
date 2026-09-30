import { BrowserWindow, globalShortcut, screen } from 'electron';
import type { OverlayGame } from '../shared/ipc-types';

/**
 * Overlay en jeu, façon overlay Steam : Maj+Tab, tant qu'un jeu lancé depuis
 * DLSGM tourne, affiche par-dessus une fenêtre transparente toujours au
 * premier plan (temps de session, temps de jeu total, auto-clicker et son
 * mode d'emploi). Le raccourci n'est enregistré que pendant qu'un jeu
 * tourne : le reste du temps, Maj+Tab garde son rôle habituel partout.
 *
 * L'overlay ne prend jamais le focus (`focusable: false`, `showInactive`) :
 * un jeu qui perd le focus se réduit souvent (Unity) et laisserait voir ce
 * qu'il y a derrière — la fenêtre de DLSGM. Les clics y fonctionnent quand
 * même ; pas le clavier, d'où Échap enregistré en raccourci global le temps
 * de l'affichage. Un clic ailleurs que sur ses boutons ne le ferme pas.
 *
 * Limite : une fenêtre ne peut pas se dessiner par-dessus un jeu en plein
 * écran exclusif (DirectX) ; fenêtré et plein écran sans bordure (RPG Maker
 * MV/MZ, la plupart des jeux Unity) fonctionnent.
 */

export const OVERLAY_HOTKEY = 'Shift+Tab';
// Pas de focus clavier (voir plus bas) : Échap est un raccourci global le temps que l'overlay est affiché.
const CLOSE_HOTKEY = 'Escape';

export interface GameOverlayOptions {
  preloadPath: string;
  /** Charge la page de l'overlay (même renderer que la fenêtre principale, route #overlay). */
  loadPage: (window: BrowserWindow) => void;
  isEnabled: () => Promise<boolean>;
  /** L'état affiché a changé (jeux, auto-clicker) : prévenir la page. */
  onGamesChanged?: () => void;
}

export class GameOverlay {
  private window: BrowserWindow | null = null;
  private readonly games = new Map<string, OverlayGame>();
  private hotkeyRegistered = false;

  constructor(private readonly options: GameOverlayOptions) {}

  listGames(): OverlayGame[] {
    return [...this.games.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async gameStarted(game: OverlayGame): Promise<void> {
    this.games.set(game.id, game);
    await this.refreshHotkey();
    this.notify();
  }

  async gameEnded(gameId: string): Promise<void> {
    this.games.delete(gameId);
    if (this.games.size === 0) this.hide();
    await this.refreshHotkey();
    this.notify();
  }

  /** (Dés)enregistre Maj+Tab selon les jeux en cours et le paramètre. */
  async refreshHotkey(): Promise<void> {
    const wanted = this.games.size > 0 && (await this.options.isEnabled());
    if (wanted && !this.hotkeyRegistered) {
      this.hotkeyRegistered = globalShortcut.register(OVERLAY_HOTKEY, () => this.toggle());
    } else if (!wanted && this.hotkeyRegistered) {
      globalShortcut.unregister(OVERLAY_HOTKEY);
      this.hotkeyRegistered = false;
      this.hide();
    }
  }

  send(channel: string, ...args: unknown[]): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, ...args);
  }

  private notify(): void {
    this.options.onGamesChanged?.();
  }

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
    // Au-dessus des fenêtres de jeu (fenêtrées ou plein écran sans bordure).
    window.setAlwaysOnTop(true, 'screen-saver');
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    this.options.loadPage(window);
    return window;
  }

  toggle(): void {
    if (this.window?.isVisible()) this.hide();
    else this.show();
  }

  show(): void {
    if (this.games.size === 0) return;
    const window = this.window && !this.window.isDestroyed() ? this.window : (this.window = this.create());
    // Sur l'écran du jeu (celui du curseur), en entier.
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    window.setBounds(display.bounds);
    // showInactive : le jeu garde le focus (et reste au premier plan).
    const reveal = () => {
      window.showInactive();
      if (!globalShortcut.isRegistered(CLOSE_HOTKEY)) globalShortcut.register(CLOSE_HOTKEY, () => this.hide());
      this.send('overlay-shown');
    };
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', reveal);
    else reveal();
  }

  hide(): void {
    if (globalShortcut.isRegistered(CLOSE_HOTKEY)) globalShortcut.unregister(CLOSE_HOTKEY);
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.window.hide();
  }

  /** Case « auto-clicker sur ce jeu » changée : l'overlay doit se mettre à jour. */
  updateGame(gameId: string, patch: Partial<OverlayGame>): void {
    const game = this.games.get(gameId);
    if (!game) return;
    this.games.set(gameId, { ...game, ...patch });
    this.notify();
  }

  /** Fermeture de l'application (ou de la fenêtre principale) : sinon la fenêtre cachée la garderait ouverte. */
  destroy(): void {
    if (globalShortcut.isRegistered(CLOSE_HOTKEY)) globalShortcut.unregister(CLOSE_HOTKEY);
    if (this.hotkeyRegistered) globalShortcut.unregister(OVERLAY_HOTKEY);
    this.hotkeyRegistered = false;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
