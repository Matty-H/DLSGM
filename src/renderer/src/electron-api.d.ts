import type { ElectronAPI } from '../../shared/ipc-types';

export {};

/**
 * L'API exposée par preload.ts (contextBridge), typée contre le contrat
 * partagé src/shared/ipc-types.ts — préload et renderer se valident ainsi
 * mutuellement à la compilation.
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
