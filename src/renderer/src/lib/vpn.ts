import type { PiaStatus } from '../../../shared/ipc-types';

/**
 * Sessions VPN (Private Internet Access, piloté par main — src/main/pia.ts) :
 * fines surcouches IPC, sans DOM. Le VPN n'est connecté que le temps de
 * `work`, puis PIA revient à son état d'avant.
 */

export type { PiaStatus };

export const getPiaStatus = () => window.electronAPI.getPiaStatus();

export async function withVpn<T>(work: () => Promise<T>): Promise<T> {
  await window.electronAPI.beginVpnSession();
  try {
    return await work();
  } finally {
    await window.electronAPI.endVpnSession();
  }
}

/** Régions japonaises d'abord (le cas d'usage : œuvres restreintes hors du Japon), puis les autres. */
export function sortRegions(regions: string[]): string[] {
  const isJapan = (r: string) => r.startsWith('jp-') || r === 'japan';
  return [...regions.filter(isJapan), ...regions.filter(r => !isJapan(r) && r !== 'auto')];
}
