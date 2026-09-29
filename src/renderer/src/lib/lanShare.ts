import type { LanPeer, LanReceiverStatus, LanSendRequest, LanSendResult, LanTransferProgress } from '../../../shared/ipc-types';

/**
 * Échange de jeux en réseau local (voir src/main/lan-share.ts) : fines
 * surcouches IPC et formatage, sans DOM.
 */

export type { LanPeer, LanReceiverStatus, LanSendRequest, LanSendResult, LanTransferProgress };

export const DEFAULT_LAN_PORT = 47821;

export const getLanReceiverStatus = () => window.electronAPI.getLanReceiverStatus();
export const startLanReceiver = (port: number) => window.electronAPI.startLanReceiver(port);
export const stopLanReceiver = () => window.electronAPI.stopLanReceiver();
export const discoverLanPeers = () => window.electronAPI.discoverLanPeers();
export const sendGamesOverLan = (request: LanSendRequest) => window.electronAPI.sendGamesOverLan(request);
export const cancelLanSend = () => window.electronAPI.cancelLanSend();
export const onLanTransferProgress = (callback: (progress: LanTransferProgress) => void) =>
  window.electronAPI.onLanTransferProgress(callback);
export const onLanReceiverStatus = (callback: (status: LanReceiverStatus) => void) =>
  window.electronAPI.onLanReceiverStatus(callback);

/** Taille lisible (octets → Ko / Mo / Go, base 1024). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function progressRatio(progress: LanTransferProgress): number {
  if (progress.state === 'done') return 1;
  return progress.totalBytes > 0 ? Math.min(1, progress.transferredBytes / progress.totalBytes) : 0;
}

/**
 * Adresse saisie à la main : "192.168.1.20" ou "192.168.1.20:47821".
 * Renvoie null si le format n'est pas reconnu.
 */
export function parseLanAddress(input: string, defaultPort = DEFAULT_LAN_PORT): { host: string; port: number } | null {
  const match = input.trim().match(/^([a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!match) return null;
  const port = match[2] ? Number(match[2]) : defaultPort;
  if (port < 1 || port > 65535) return null;
  return { host: match[1], port };
}

/** Ajoute ou remplace une progression (même `key`) en gardant l'ordre d'arrivée. */
export function upsertTransfer(list: LanTransferProgress[], progress: LanTransferProgress): LanTransferProgress[] {
  const index = list.findIndex(t => t.key === progress.key);
  if (index === -1) return [...list, progress];
  const next = list.slice();
  next[index] = progress;
  return next;
}
