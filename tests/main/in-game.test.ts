import { beforeEach, describe, expect, it, vi } from 'vitest';

const registered = new Map<string, () => void>();
vi.mock('electron', () => ({
  globalShortcut: {
    register: (key: string, callback: () => void) => {
      registered.set(key, callback);
      return true;
    },
    unregister: (key: string) => registered.delete(key),
    isRegistered: (key: string) => registered.has(key)
  },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
  },
  // Juste ce que GameOverlay utilise ; la dernière position posée est relevée.
  BrowserWindow: class {
    static lastBounds: unknown = null;
    private visible = false;
    webContents = { on: () => undefined, once: () => undefined, isLoading: () => false, send: () => undefined };
    setAlwaysOnTop() {}
    on() {}
    setBounds(bounds: unknown) { (this.constructor as unknown as { lastBounds: unknown }).lastBounds = bounds; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    isVisible() { return this.visible; }
    isDestroyed() { return false; }
    destroy() {}
  }
}));

import path from 'path';
import { DEFAULT_AUTO_CLICKER, MIN_INTERVAL_MS, dirsCommand, sanitizeClickerSettings, startCommand } from '../../src/main/auto-clicker';
import { GameOverlay, OVERLAY_HOTKEY } from '../../src/main/overlay';
import { HUD_COLLAPSED, HUD_EXPANDED, TRIGGER_HUD_EXPANDED, TRIGGER_HUD_OFFSET_X, hudBounds } from '../../src/main/clicker-hud';
import { zonesView } from '../../src/main/trigger-zones';
import { MIN_GAME_WINDOW, parseRectLine } from '../../src/main/game-window';
import { newPixelTrigger } from '../../src/renderer/src/lib/pixelTrigger';
import type { OverlayGame } from '../../src/shared/ipc-types';

describe('auto-clicker', () => {
  it('ramène les réglages dans les bornes', () => {
    const s = sanitizeClickerSettings({ intervalMs: 0, repeat: -3, button: 'nope' as never, hotkey: '  ', position: { x: 10.4, y: Number.NaN } });
    expect(s.intervalMs).toBe(MIN_INTERVAL_MS);
    expect(s.repeat).toBe(0);
    expect(s.button).toBe('left');
    expect(s.hotkey).toBe(DEFAULT_AUTO_CLICKER.hotkey);
    expect(s.position).toBeNull();
    expect(sanitizeClickerSettings(undefined)).toEqual(DEFAULT_AUTO_CLICKER);
  });

  it('dossiers des jeux : UTF-8 en base64 (chemins japonais), terminés par un séparateur', () => {
    const dir = ['D:', 'ゲーム', 'RJ01234567'].join(path.sep);
    const [verb, payload] = dirsCommand([dir, dir + path.sep]).split(' ');
    expect(verb).toBe('dirs');
    // Séparateur final : RJ0123 ne doit pas couvrir RJ01234567.
    expect(Buffer.from(payload, 'base64').toString('utf8').split('\n')).toEqual([dir + path.sep, dir + path.sep]);
    expect(dirsCommand([])).toBe('dirs ');
  });

  it('commande du worker : drapeaux du bouton, double clic, point fixe', () => {
    const settings = { ...DEFAULT_AUTO_CLICKER, intervalMs: 50, button: 'right' as const, double: true, repeat: 5 };
    expect(startCommand(3, settings, null)).toBe('start 3 50 8 16 2 5 0 0 0');
    expect(startCommand(4, { ...DEFAULT_AUTO_CLICKER }, { x: 1920, y: 1080 })).toBe('start 4 100 2 4 1 0 1 1920 1080');
  });
});

describe('overlay en jeu', () => {
  const game = (id: string): OverlayGame => ({
    id,
    name: id,
    startedAt: new Date().toISOString(),
    previousPlayTime: 0,
    sessionCount: 0,
    lastPlayed: null,
    autoClickerEnabled: true,
    pixelTriggerEnabled: false
  });
  let enabled: boolean;
  let overlay: GameOverlay;

  beforeEach(() => {
    registered.clear();
    enabled = true;
    overlay = new GameOverlay({ preloadPath: '', loadPage: () => undefined, isEnabled: async () => enabled });
  });

  it("Maj+Tab n'est pris que pendant qu'un jeu tourne", async () => {
    expect(registered.has(OVERLAY_HOTKEY)).toBe(false);
    await overlay.gameStarted(game('RJ1'));
    await overlay.gameStarted(game('RJ2'));
    expect(registered.has(OVERLAY_HOTKEY)).toBe(true);
    await overlay.gameEnded('RJ1');
    expect(registered.has(OVERLAY_HOTKEY)).toBe(true);
    await overlay.gameEnded('RJ2');
    expect(registered.has(OVERLAY_HOTKEY)).toBe(false);
  });

  it("Échap n'est pris que le temps de l'affichage : libéré quand l'overlay se ferme", async () => {
    await overlay.gameStarted(game('RJ1'));
    registered.set('Escape', () => undefined); // comme après show()
    await overlay.gameEnded('RJ1');
    expect(registered.has('Escape')).toBe(false);
  });

  it('overlay désactivé : raccourci libéré, même avec un jeu en cours', async () => {
    await overlay.gameStarted(game('RJ1'));
    enabled = false;
    await overlay.refreshHotkey();
    expect(registered.has(OVERLAY_HOTKEY)).toBe(false);
    expect(overlay.listGames().map(g => g.id)).toEqual(['RJ1']);
  });
});

describe('témoin de l’auto-clicker', () => {
  it('en bas à gauche de la zone de travail, au-dessus de la barre des tâches, grandi vers le haut une fois déplié', () => {
    const workArea = { x: 1920, y: 0, width: 1920, height: 1040 };
    const collapsed = hudBounds(workArea, false);
    const expanded = hudBounds(workArea, true);
    expect(collapsed).toEqual({ x: 1932, y: 1040 - HUD_COLLAPSED.height - 12, ...HUD_COLLAPSED });
    expect(expanded.y + expanded.height).toBe(collapsed.y + collapsed.height);
    expect(expanded.width).toBe(HUD_EXPANDED.width);
  });

  it('posé dans la fenêtre du jeu sans en déborder, même petite (écran secondaire, coordonnées négatives)', () => {
    const game = { x: -1600, y: 200, width: 640, height: 480 };
    const inside = (b: { x: number; y: number; width: number; height: number }) =>
      b.x >= game.x && b.y >= game.y && b.x + b.width <= game.x + game.width && b.y + b.height <= game.y + game.height;
    expect(hudBounds(game, false)).toEqual({ x: -1588, y: 200 + 480 - HUD_COLLAPSED.height - 12, ...HUD_COLLAPSED });
    expect(inside(hudBounds(game, true))).toBe(true);
    // Le témoin du détecteur, décalé à droite, est ramené dans la fenêtre.
    expect(inside(hudBounds(game, false, TRIGGER_HUD_OFFSET_X))).toBe(true);
    // Plus haut que la fenêtre : calé sur son bord haut plutôt qu'au-dessus.
    expect(hudBounds(game, true, TRIGGER_HUD_OFFSET_X, TRIGGER_HUD_EXPANDED).y).toBe(game.y);
  });
});

describe('détecteur de rythme : témoin et zones', () => {
  it('témoin à droite de celui de l’auto-clicker, même quand les deux sont dépliés', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
    const clicker = hudBounds(workArea, true);
    const trigger = hudBounds(workArea, true, TRIGGER_HUD_OFFSET_X, TRIGGER_HUD_EXPANDED);
    expect(trigger.x).toBeGreaterThan(clicker.x + clicker.width);
    expect(trigger).toMatchObject(TRIGGER_HUD_EXPANDED);
    expect(trigger.y + trigger.height).toBe(clicker.y + clicker.height);
  });

  it('zones transmises à la fenêtre : seulement les zones visées, avec leur délai (flash vert au moment du clic)', () => {
    const aimed = { ...newPixelTrigger(0), id: 'a', delayMs: 40, zone: { x: 2000, y: 10, width: 8, height: 8 } };
    const view = zonesView([aimed, newPixelTrigger(1)], { bounds: { x: 1920, y: 0 } });
    expect(view).toEqual({ origin: { x: 1920, y: 0 }, zones: [{ id: 'a', name: aimed.name, zone: aimed.zone, delayMs: 40 }] });
  });
});

describe("fenêtre du jeu (position de l'overlay)", () => {
  it('lit la zone client envoyée par le worker, ignore le reste', () => {
    expect(parseRectLine('rect -1920 0 1280 720\r')).toEqual({ x: -1920, y: 0, width: 1280, height: 720 });
    expect(parseRectLine('ready')).toBeNull();
    expect(parseRectLine('rect 0 0 abc 720')).toBeNull();
  });

  it("ignore une fenêtre trop petite pour être celle du jeu (l'overlay prend alors l'écran)", () => {
    expect(parseRectLine(`rect 0 0 ${MIN_GAME_WINDOW.width - 1} 600`)).toBeNull();
    expect(parseRectLine('rect 100 100 160 120')).toBeNull();
  });
});

describe("overlay sur la fenêtre du jeu", () => {
  const game: OverlayGame = {
    id: 'RJ01234567', name: 'RJ01234567', startedAt: new Date().toISOString(), previousPlayTime: 0,
    sessionCount: 0, lastPlayed: null, autoClickerEnabled: false, pixelTriggerEnabled: false
  };
  const lastBounds = async () => ((await import('electron')).BrowserWindow as unknown as { lastBounds: unknown }).lastBounds;

  it("Maj+Tab le pose sur la fenêtre du jeu, sinon sur l'écran, et il suit le jeu", async () => {
    let gameRect: { x: number; y: number; width: number; height: number } | null = { x: 100, y: 50, width: 1280, height: 720 };
    const overlay = new GameOverlay({ preloadPath: '', loadPage: () => undefined, isEnabled: async () => true, gameBounds: () => gameRect });
    await overlay.gameStarted(game);
    registered.get(OVERLAY_HOTKEY)!();
    expect(await lastBounds()).toEqual({ x: 100, y: 50, width: 1280, height: 720 });

    gameRect = { x: 200, y: 50, width: 1280, height: 720 };
    overlay.followGame();
    expect(await lastBounds()).toEqual(gameRect);

    overlay.hide();
    gameRect = null;
    overlay.show();
    expect(await lastBounds()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    overlay.destroy();
  });
});
