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
  screen: {},
  BrowserWindow: class {}
}));

import path from 'path';
import { DEFAULT_AUTO_CLICKER, MIN_INTERVAL_MS, dirsCommand, sanitizeClickerSettings, startCommand } from '../../src/main/auto-clicker';
import { GameOverlay, OVERLAY_HOTKEY } from '../../src/main/overlay';
import { HUD_COLLAPSED, HUD_EXPANDED, hudBounds } from '../../src/main/clicker-hud';
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
    autoClickerEnabled: true
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
});
