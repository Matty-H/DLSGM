import { uiLocale } from './i18n.js';
/** Adresse d'une capture (servie par main, nom et ID validés). */
export function captureSrc(gameId: string, file: string): string {
  return `atom://capture/${encodeURIComponent(gameId)}/${encodeURIComponent(file)}`;
}

/** « 1 oct. 2026, 12:45 ». */
export function formatCaptureDate(iso: string): string {
  return new Date(iso).toLocaleString(uiLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
