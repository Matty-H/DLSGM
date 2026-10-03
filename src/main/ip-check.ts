import os from 'os';
import type { IpCheckResult, LanAddress } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Vérification des adresses IP (Paramètres › Réseau & VPN) :
 * - LAN : adresses IPv4 de chaque interface réseau (un VPN connecté y
 *   apparaît comme une interface de plus) ;
 * - WAN : IP publique et pays vus depuis Internet, demandés à ipinfo.io par
 *   le même chemin que les requêtes DLsite (proxy DLsite / VPN compris) :
 *   c'est donc l'adresse que DLsite verra. Service externe, contacté
 *   uniquement sur demande de l'utilisateur.
 */

const WAN_URL = 'https://ipinfo.io/json';
const WAN_TIMEOUT_MS = 15000;

export function lanAddresses(interfaces = os.networkInterfaces()): LanAddress[] {
  const result: LanAddress[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push({ interface: name, address: entry.address });
    }
  }
  return result;
}

export async function checkIp(fetchJson: (url: string, init: RequestInit) => Promise<Response>): Promise<IpCheckResult> {
  const lan = lanAddresses();
  try {
    const response = await fetchJson(WAN_URL, { signal: AbortSignal.timeout(WAN_TIMEOUT_MS), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(tm('ipinfo.io a répondu HTTP {status}', { status: response.status }));
    const data = await response.json() as Record<string, unknown>;
    const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : null);
    if (!text('ip')) throw new Error(tm('Réponse sans adresse IP.'));
    return { lan, wan: { ip: text('ip')!, country: text('country'), region: text('region'), city: text('city'), org: text('org') } };
  } catch (error) {
    return { lan, wanError: (error as Error).message };
  }
}
