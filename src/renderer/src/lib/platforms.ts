import { hostPlatform, type OsPlatform } from '../../../shared/platforms';
import { msg } from './i18n.js';

export const PLATFORM_LABELS: Record<OsPlatform, string> = {
  windows: msg('Windows'),
  mac: msg('Mac'),
  android: msg('Android')
};

/** Plateforme de cette machine d'après `electronAPI.platform` ('win32', 'darwin'…). */
export function currentPlatform(nodePlatform: string): OsPlatform | null {
  return hostPlatform(nodePlatform);
}

/**
 * Jeu jouable sur cette machine : une version pour sa plateforme est présente
 * dans son dossier. Détection pas encore arrivée (`undefined`) : on ne masque rien.
 */
export function isPlayableHere(platforms: OsPlatform[] | undefined, host: OsPlatform | null): boolean {
  if (!platforms) return true;
  return host !== null && platforms.includes(host);
}
