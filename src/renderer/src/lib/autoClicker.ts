import type { AutoClickerSettings, ClickerButton } from '../../../shared/ipc-types';
import { t } from './i18n.js';

/**
 * Auto-clicker (voir src/main/auto-clicker.ts) : intervalle découpé en
 * heures / minutes / secondes / millisecondes comme dans OP Auto Clicker,
 * résumé des réglages, raccourcis proposés. Pur, sans DOM.
 */

export type { AutoClickerSettings, ClickerButton };

export const MIN_INTERVAL_MS = 10;

export interface IntervalParts {
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
}

export function splitInterval(totalMs: number): IntervalParts {
  const ms = Math.max(0, Math.round(totalMs));
  return {
    hours: Math.floor(ms / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
    ms: ms % 1000
  };
}

/** Intervalle total, jamais sous MIN_INTERVAL_MS (un clic toutes les 0 ms bloquerait le PC). */
export function joinInterval(parts: IntervalParts): number {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const total = n(parts.hours) * 3_600_000 + n(parts.minutes) * 60_000 + n(parts.seconds) * 1000 + n(parts.ms);
  return Math.max(MIN_INTERVAL_MS, total);
}

export function formatInterval(totalMs: number): string {
  const { hours, minutes, seconds, ms } = splitInterval(totalMs);
  const parts = [hours && t('{h} h', { h: hours }), minutes && t('{m} min', { m: minutes }), seconds && `${seconds} s`, ms && `${ms} ms`].filter(Boolean);
  return parts.length ? parts.join(' ') : '0 ms';
}

/**
 * Raccourcis proposés : touches rarement utilisées par les jeux (Maj+Tab et Alt+Espace sont déjà pris).
 * Libellé lu à l'affichage (getter) : la liste est créée avant que la langue soit connue.
 */
export const HOTKEY_OPTIONS = ['F6', 'F7', 'F8', 'F9', 'F10', 'Ctrl+F6', 'Ctrl+F8', 'Ctrl+Alt+C', 'Pause', 'ScrollLock'].map(key => ({
  value: key,
  get label() {
    return key === 'ScrollLock' ? t('Arrêt défil') : key;
  }
}));

/** Durée de session en h:mm:ss (compteur de l'overlay). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Rythme affiché par le témoin : « 100 ms · 10/s », « 2 s · 30/min », « 1 h ». */
export function formatRate(settings: Pick<AutoClickerSettings, 'intervalMs' | 'double'>): string {
  const perSecond = ((settings.double ? 2 : 1) * 1000) / Math.max(1, settings.intervalMs);
  const round = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace('.', ','));
  const rate = perSecond >= 1 ? `${round(perSecond)}/s` : perSecond * 60 >= 1 ? `${round(perSecond * 60)}/min` : null;
  return rate ? `${formatInterval(settings.intervalMs)} · ${rate}` : formatInterval(settings.intervalMs);
}

/** Intervalles proposés par le témoin (réglage à la souris, sans clavier). */
export const INTERVAL_PRESETS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000];

/** Pas de −/+ du témoin : ±10 % arrondi à un pas lisible, jamais sous le minimum. */
export function stepInterval(intervalMs: number, direction: 1 | -1): number {
  // En descendant, le pas de la tranche du dessous : 100 → 95 (pas 75), et 95 → 100 en remontant.
  const base = direction < 0 ? intervalMs - 1 : intervalMs;
  const step = base < 100 ? 5 : base < 1000 ? 25 : base < 10_000 ? 250 : 1000;
  return Math.max(MIN_INTERVAL_MS, Math.round((intervalMs + direction * step) / step) * step);
}
