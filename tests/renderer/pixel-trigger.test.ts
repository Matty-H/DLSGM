import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZONE_SIZE,
  MAX_ZONE_SIZE,
  describeTrigger,
  effectiveClickPoint,
  formatCaptureRate,
  newPixelTrigger,
  resizeZone,
  usableTriggers,
  zoneAround
} from '../../src/renderer/src/lib/pixelTrigger';

describe('lib/pixelTrigger', () => {
  it('zoneAround centre la zone sur le point visé et garde la taille précédente', () => {
    expect(zoneAround({ x: 100, y: 50 }, null)).toEqual({ x: 100 - DEFAULT_ZONE_SIZE / 2, y: 50 - DEFAULT_ZONE_SIZE / 2, width: DEFAULT_ZONE_SIZE, height: DEFAULT_ZONE_SIZE });
    expect(zoneAround({ x: 100, y: 50 }, { x: 0, y: 0, width: 30, height: 4 })).toEqual({ x: 85, y: 48, width: 30, height: 4 });
  });

  it('resizeZone garde le centre et borne la taille', () => {
    expect(resizeZone({ x: 90, y: 40, width: 20, height: 20 }, 40, 0)).toEqual({ x: 80, y: 50, width: 40, height: 1 });
    expect(resizeZone({ x: 0, y: 0, width: 10, height: 10 }, 9999, 10).width).toBe(MAX_ZONE_SIZE);
  });

  it('point de clic : le point choisi, sinon le centre de la zone', () => {
    const t = { ...newPixelTrigger(0), zone: { x: 10, y: 20, width: 10, height: 10 } };
    expect(effectiveClickPoint(t)).toEqual({ x: 15, y: 25 });
    expect(effectiveClickPoint({ ...t, clickPoint: { x: 1, y: 2 } })).toEqual({ x: 1, y: 2 });
    expect(effectiveClickPoint(newPixelTrigger(0))).toBeNull();
  });

  it('describeTrigger résume la zone', () => {
    const t = { ...newPixelTrigger(0), zone: { x: 10, y: 20, width: 10, height: 10 } };
    expect(describeTrigger(newPixelTrigger(0))).toBe('Zone pas encore visée');
    expect(describeTrigger(t)).toBe('Mouvement → clic gauche (15, 25)');
    expect(describeTrigger({ ...t, mode: 'color', color: '#ff0000', action: 'key', key: 'Left', delayMs: 30, hold: true })).toBe(
      'Couleur #ff0000 → touche ←, après 30 ms, maintenu'
    );
  });

  it('usableTriggers : actives et visées', () => {
    const aimed = { ...newPixelTrigger(0), zone: { x: 0, y: 0, width: 1, height: 1 } };
    expect(usableTriggers([aimed, newPixelTrigger(1), { ...aimed, enabled: false }])).toEqual([aimed]);
    expect(usableTriggers(undefined)).toEqual([]);
  });

  it('formatCaptureRate', () => {
    expect(formatCaptureRate(16.7)).toBe('60 captures/s');
    expect(formatCaptureRate(null)).toBeNull();
  });
});
