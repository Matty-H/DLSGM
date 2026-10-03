import type { PixelTrigger, PixelTriggerSettings, PixelTriggerStatus } from '../../../shared/ipc-types';
import { t } from './i18n.js';

/**
 * Détecteur de rythme (voir src/main/pixel-trigger.ts) : zones d'un jeu,
 * touches proposées, résumés affichés. Pur, sans DOM.
 */

export type { PixelTrigger, PixelTriggerSettings, PixelTriggerStatus };

/** Même plafond que main (MAX_TRIGGERS). */
export const MAX_TRIGGERS = 12;
export const MAX_ZONE_SIZE = 200;
/** Côté d'une zone nouvellement visée, en pixels (DIP). */
export const DEFAULT_ZONE_SIZE = 10;

/**
 * Touches proposées ; les valeurs sont les noms de KEY_CODES (src/main/pixel-trigger.ts).
 * Libellés traduits lus à l'affichage (getter) : la liste est créée avant que la langue soit connue.
 */
export const KEY_OPTIONS: { value: string; readonly label: string }[] = [
  { value: 'Space', get label() { return t('Espace'); } },
  { value: 'Enter', get label() { return t('Entrée'); } },
  { value: 'Shift', get label() { return t('Maj'); } },
  { value: 'Ctrl', label: 'Ctrl' },
  ...[
    ['Left', '←'],
    ['Up', '↑'],
    ['Right', '→'],
    ['Down', '↓']
  ].map(([value, label]) => ({ value, label })),
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].map(key => ({ value: key, label: key })),
  ...[...'0123456789'].map(digit => ({
    value: `Numpad${digit}`,
    get label() {
      return t('Pavé {digit}', { digit });
    }
  }))
];

export function keyLabel(key: string): string {
  return KEY_OPTIONS.find(option => option.value === key)?.label ?? key;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Nouvelle zone, pas encore visée : mode mouvement, clic gauche au centre de la zone. */
export function newPixelTrigger(index: number): PixelTrigger {
  return {
    id: randomId(),
    name: t('Piste {n}', { n: index + 1 }),
    enabled: true,
    mode: 'motion',
    zone: null,
    color: '#ffffff',
    tolerance: 40,
    minPercent: 30,
    action: 'click',
    button: 'left',
    clickPoint: null,
    key: 'Space',
    delayMs: 0,
    hold: false,
    cooldownMs: 80
  };
}

/** Zone de la taille donnée (celle d'avant, sinon la taille par défaut), centrée sur le point visé. */
export function zoneAround(point: { x: number; y: number }, previous: PixelTrigger['zone']): NonNullable<PixelTrigger['zone']> {
  const width = previous?.width ?? DEFAULT_ZONE_SIZE;
  const height = previous?.height ?? DEFAULT_ZONE_SIZE;
  return { x: Math.round(point.x - width / 2), y: Math.round(point.y - height / 2), width, height };
}

/** Même zone, redimensionnée autour de son centre. */
export function resizeZone(zone: NonNullable<PixelTrigger['zone']>, width: number, height: number): NonNullable<PixelTrigger['zone']> {
  const clamp = (v: number) => Math.min(MAX_ZONE_SIZE, Math.max(1, Math.round(v) || 1));
  const w = clamp(width);
  const h = clamp(height);
  const cx = zone.x + zone.width / 2;
  const cy = zone.y + zone.height / 2;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h };
}

/** Point réellement cliqué : le point choisi, sinon le centre de la zone. */
export function effectiveClickPoint(trigger: PixelTrigger): { x: number; y: number } | null {
  if (trigger.clickPoint) return trigger.clickPoint;
  if (!trigger.zone) return null;
  return { x: Math.round(trigger.zone.x + trigger.zone.width / 2), y: Math.round(trigger.zone.y + trigger.zone.height / 2) };
}

const buttonLabel = (button: PixelTrigger['button']) =>
  button === 'right' ? t('clic droit') : button === 'middle' ? t('clic milieu') : t('clic gauche');

/** Résumé d'une zone : « Couleur #ff0000 → clic gauche (640, 900) », « Mouvement → touche D, maintenu ». */
export function describeTrigger(trigger: PixelTrigger): string {
  if (!trigger.zone) return t('Zone pas encore visée');
  const what = trigger.mode === 'color' ? t('Couleur {color}', { color: trigger.color }) : t('Mouvement');
  const point = effectiveClickPoint(trigger);
  const action =
    trigger.action === 'key'
      ? t('touche {key}', { key: keyLabel(trigger.key) })
      : `${buttonLabel(trigger.button)}${point ? ` (${point.x}, ${point.y})` : ''}`;
  const extras = [trigger.delayMs > 0 && t('après {ms} ms', { ms: trigger.delayMs }), trigger.hold && t('maintenu')].filter(Boolean);
  return `${what} → ${action}${extras.length ? `, ${extras.join(', ')}` : ''}`;
}

/** Zones prises en compte par le détecteur : actives et visées. */
export function usableTriggers(triggers: PixelTrigger[] | undefined): PixelTrigger[] {
  return (triggers ?? []).filter(t => t.enabled && t.zone !== null);
}

/** « 60 captures/s » à partir de l'intervalle moyen entre deux captures. */
export function formatCaptureRate(frameMs: number | null): string | null {
  if (!frameMs || frameMs <= 0) return null;
  return t('{n} captures/s', { n: Math.round(1000 / frameMs) });
}
