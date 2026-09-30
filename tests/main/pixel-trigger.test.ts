import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

// Faux worker PowerShell : stdin enregistré, stdout piloté par le test.
const written: string[] = [];
const fakeWorker = Object.assign(new EventEmitter(), {
  stdin: { write: (text: string) => written.push(text), end: () => undefined },
  stdout: Object.assign(new EventEmitter(), { setEncoding: () => undefined }),
  stderr: new EventEmitter(),
  kill: () => undefined
});
vi.mock('child_process', () => ({ spawn: () => fakeWorker }));

import {
  KEY_CODES,
  MAX_TRIGGERS,
  MAX_ZONE_SIZE,
  PixelTriggerDetector,
  TRIGGER_STRIDE,
  TRIGGER_WORKER_SCRIPT,
  activeTriggers,
  sanitizePixelTriggerSettings,
  sanitizePixelTriggers,
  startTriggerCommand,
  triggerVisibility,
  triggerFields
} from '../../src/main/pixel-trigger';
import { KEY_OPTIONS, newPixelTrigger } from '../../src/renderer/src/lib/pixelTrigger';
import type { PixelTrigger } from '../../src/shared/ipc-types';

const identity = (p: { x: number; y: number }) => p;

function trigger(patch: Partial<PixelTrigger> = {}): PixelTrigger {
  return { ...newPixelTrigger(0), id: 't1', zone: { x: 100, y: 200, width: 10, height: 20 }, ...patch };
}

async function withWindows<T>(run: () => Promise<T>): Promise<T> {
  // Le détecteur n'est disponible que sous Windows ; la CI peut tourner ailleurs.
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  try {
    return await run();
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
}

describe('sanitizePixelTriggers', () => {
  it('borne les valeurs, écarte ce qui n’est pas une zone et garde au plus MAX_TRIGGERS zones', () => {
    const raw = [
      null,
      'x',
      {
        id: '../evil',
        mode: 'nope',
        zone: { x: 1.4, y: 2.6, width: 5000, height: -3 },
        color: 'red',
        tolerance: 999,
        minPercent: 0,
        action: 'key',
        key: 'F13',
        delayMs: -5,
        cooldownMs: 1,
        clickPoint: { x: Number.NaN, y: 1 }
      }
    ];
    const [t] = sanitizePixelTriggers(raw);
    expect(sanitizePixelTriggers(raw)).toHaveLength(1);
    expect(t.id).toMatch(/^[\w-]+$/);
    expect(t.id).not.toBe('../evil');
    expect(t.mode).toBe('motion');
    expect(t.zone).toEqual({ x: 1, y: 3, width: MAX_ZONE_SIZE, height: 1 });
    expect(t.color).toBe('#ffffff');
    expect(t.tolerance).toBe(255);
    expect(t.minPercent).toBe(1);
    expect(t.key).toBe('Space');
    expect(t.delayMs).toBe(0);
    expect(t.cooldownMs).toBe(10);
    expect(t.clickPoint).toBeNull();
    expect(sanitizePixelTriggers(Array.from({ length: 30 }, () => trigger()))).toHaveLength(MAX_TRIGGERS);
    expect(sanitizePixelTriggers('nope')).toEqual([]);
  });

  it('une zone valide ressort à l’identique', () => {
    const t = trigger({ mode: 'color', color: '#12abef', action: 'key', key: 'D', hold: true, clickPoint: { x: 5, y: 6 } });
    expect(sanitizePixelTriggers([t])).toEqual([t]);
  });

  it('activeTriggers ne garde que les zones actives et visées', () => {
    const list = [trigger({ id: 'a' }), trigger({ id: 'b', enabled: false }), trigger({ id: 'c', zone: null })];
    expect(activeTriggers(list).map(t => t.id)).toEqual(['a']);
  });

  it('témoin visible dès qu’un jeu tourne détecteur activé, même sans zone ; armé seulement avec une zone', () => {
    const base = { enabled: true, available: true, runningGames: 1, zones: 0 };
    expect(triggerVisibility(base)).toEqual({ shown: true, armed: false });
    expect(triggerVisibility({ ...base, zones: 2 })).toEqual({ shown: true, armed: true });
    expect(triggerVisibility({ ...base, runningGames: 0, zones: 2 })).toEqual({ shown: false, armed: false });
    expect(triggerVisibility({ ...base, enabled: false, zones: 2 })).toEqual({ shown: false, armed: false });
    expect(triggerVisibility({ ...base, available: false, zones: 2 })).toEqual({ shown: false, armed: false });
  });

  it('réglages : F7 par défaut', () => {
    expect(sanitizePixelTriggerSettings(undefined)).toEqual({ enabled: false, hotkey: 'F7' });
    expect(sanitizePixelTriggerSettings({ enabled: true, hotkey: ' F9 ' })).toEqual({ enabled: true, hotkey: 'F9' });
  });
});

describe('commande start', () => {
  it('convertit la zone et le point de clic en pixels physiques (150 %) et calcule le nombre de pixels requis', () => {
    const scale = (p: { x: number; y: number }) => ({ x: p.x * 1.5, y: p.y * 1.5 });
    const fields = triggerFields(trigger({ minPercent: 50, color: '#102030' }), scale);
    expect(fields).toHaveLength(TRIGGER_STRIDE);
    const [mode, left, top, width, height, r, g, b, , minCount, action, , , , , clickX, clickY] = fields;
    expect([mode, left, top, width, height]).toEqual([0, 150, 300, 15, 30]);
    expect([r, g, b]).toEqual([0x10, 0x20, 0x30]);
    expect(minCount).toBe(Math.ceil((15 * 30) / 2));
    expect(action).toBe(0);
    // Pas de point choisi : centre de la zone.
    expect([clickX, clickY]).toEqual([Math.round(105 * 1.5), Math.round(210 * 1.5)]);
  });

  it('touche : code virtuel et drapeau de touche étendue (flèches)', () => {
    const fields = triggerFields(trigger({ action: 'key', key: 'Left' }), identity);
    expect(fields[10]).toBe(1);
    expect(fields[13]).toBe(0x25);
    expect(fields[14]).toBe(1);
  });

  it('champs puis un cooldown par zone, dans l’ordre lu par le worker', () => {
    const list = [trigger({ cooldownMs: 111 }), trigger({ id: 't2', cooldownMs: 222 })];
    const parts = startTriggerCommand(7, list, identity).split(' ');
    expect(parts.slice(0, 3)).toEqual(['start', '7', '2']);
    expect(parts).toHaveLength(3 + 2 * TRIGGER_STRIDE + 2);
    expect(parts.slice(-2)).toEqual(['111', '222']);
    // Le script C# lit le même nombre de champs par zone.
    expect(TRIGGER_WORKER_SCRIPT).toContain(`int o = i * ${TRIGGER_STRIDE};`);
    expect(TRIGGER_WORKER_SCRIPT).not.toContain('${');
  });

  it('chaque touche proposée par le renderer existe côté main', () => {
    for (const option of KEY_OPTIONS) expect(KEY_CODES[option.value], option.value).toBeDefined();
  });
});

describe('PixelTriggerDetector', () => {
  it("worker prêt : la commande part pendant l'appel, sans await (raccourci global)", async () => {
    const dir = makeTempDir();
    try {
      await withWindows(async () => {
        const detector = new PixelTriggerDetector({ scriptDir: dir, toScreenPoint: identity, onStatus: () => undefined });
        const warm = detector.warmUp();
        fakeWorker.stdout.emit('data', 'ready\n');
        await warm;

        written.length = 0;
        void detector.toggle([trigger()]);
        expect(written.some(line => line.startsWith('start 1 1 '))).toBe(true);
        expect(detector.getStatus().running).toBe(true);

        written.length = 0;
        void detector.toggle([trigger()]);
        expect(written).toEqual(['stop\n']);
        detector.dispose();
      });
    } finally {
      removeTempDir(dir);
    }
  });

  it('compte les déclenchements par zone, ignore ceux d’un ancien tour', async () => {
    const dir = makeTempDir();
    try {
      await withWindows(async () => {
        const detector = new PixelTriggerDetector({ scriptDir: dir, toScreenPoint: identity, onStatus: () => undefined });
        const warm = detector.warmUp();
        fakeWorker.stdout.emit('data', 'ready\n');
        await warm;
        const list = [trigger({ id: 'a' }), trigger({ id: 'b' })];
        await detector.start(list);
        await detector.start(list); // tour 2 : les événements du tour 1 sont ignorés
        fakeWorker.stdout.emit('data', 'hit 2 1\nhit 2 1\nhit 1 0\nhit 2 0\nframe 2 16700\n');
        expect(detector.getStatus().hits).toEqual({ a: 1, b: 2 });
        expect(detector.getStatus().frameMs).toBe(16.7);
        fakeWorker.stdout.emit('data', 'stopped 2\n');
        expect(detector.getStatus().running).toBe(false);
        detector.dispose();
      });
    } finally {
      removeTempDir(dir);
    }
  });

  it('sans zone active, refuse de démarrer', async () => {
    const dir = makeTempDir();
    try {
      await withWindows(async () => {
        const detector = new PixelTriggerDetector({ scriptDir: dir, toScreenPoint: identity, onStatus: () => undefined });
        await expect(detector.start([trigger({ enabled: false })])).rejects.toThrow(/Aucune zone/);
      });
    } finally {
      removeTempDir(dir);
    }
  });
});
