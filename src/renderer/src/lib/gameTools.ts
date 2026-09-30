import type { GameToolsInfo, InstalledPatch, SandboxieStatus, SaveBackup } from '../../../shared/ipc-types';

/**
 * Outils par jeu (moteur, sauvegardes, patchs) : fines surcouches IPC, sans
 * DOM. Les erreurs sont propagées telles quelles, à charge du composant de
 * les afficher.
 */

export type { GameToolsInfo, InstalledPatch, SandboxieStatus, SaveBackup };

export const BACKUP_REASON_LABELS: Record<SaveBackup['reason'], string> = {
  auto: 'Auto',
  manual: 'Manuelle',
  'pre-restore': 'Avant restauration'
};

/** Taille lisible (ex: "340 Ko", "1,2 Mo"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** Langues cibles proposées pour la traduction automatique (codes XUnity). */
export const TRANSLATION_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'Anglais' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'zh-CN', label: 'Chinois (simplifié)' },
  { code: 'ko', label: 'Coréen' }
];

/** Le patch de traduction automatique ne s'applique qu'aux jeux Unity Mono. */
export function canInstallAutoTranslator(info: GameToolsInfo): boolean {
  return (
    info.engine.engine === 'unity' &&
    info.engine.unityBackend === 'mono' &&
    info.engine.arch !== null &&
    !info.patches.some(p => p.kind === 'auto-translator')
  );
}

/** Ligne de détail du moteur (ex: "Mono · 2021.3.16f1 · x64"). */
export function describeEngine(info: GameToolsInfo): string {
  const { engine } = info;
  const parts: string[] = [];
  if (engine.unityBackend) parts.push(engine.unityBackend === 'il2cpp' ? 'IL2CPP' : 'Mono');
  if (engine.unityVersion) parts.push(engine.unityVersion);
  if (engine.arch) parts.push(engine.arch);
  return parts.join(' · ');
}

/** Message d'une erreur IPC, sans le préfixe technique ajouté par Electron. */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export const getGameToolsInfo = (gameId: string) => window.electronAPI.getGameToolsInfo(gameId);
export const openSaveLocation = (gameId: string, index: number) => window.electronAPI.openSaveLocation(gameId, index);
export const installAutoTranslator = (gameId: string, language: string) => window.electronAPI.installAutoTranslator(gameId, language);
export const applyUserPatch = (gameId: string, source: 'zip' | 'folder') => window.electronAPI.applyUserPatch(gameId, source);
export const uninstallLastPatch = (gameId: string) => window.electronAPI.uninstallLastPatch(gameId);
export const listSaveBackups = (gameId: string) => window.electronAPI.listSaveBackups(gameId);
export const createSaveBackup = (gameId: string) => window.electronAPI.createSaveBackup(gameId);
export const restoreSaveBackup = (gameId: string, backupId: string) => window.electronAPI.restoreSaveBackup(gameId, backupId);
export const deleteSaveBackup = (gameId: string, backupId: string) => window.electronAPI.deleteSaveBackup(gameId, backupId);
export const getSandboxieStatus = () => window.electronAPI.getSandboxieStatus();

export const clearGameSandbox = (gameId: string) => window.electronAPI.clearGameSandbox(gameId);
