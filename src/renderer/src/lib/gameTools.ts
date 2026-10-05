import type { GameToolsInfo, InstalledPatch, SandboxieStatus, SaveBackup } from '../../../shared/ipc-types';
import { msg, t, tr, uiLocale } from './i18n.js';

/**
 * Outils par jeu (moteur, sauvegardes, patchs) : fines surcouches IPC, sans
 * DOM. Les erreurs sont propagées telles quelles, à charge du composant de
 * les afficher.
 */

export type { GameToolsInfo, InstalledPatch, SandboxieStatus, SaveBackup };

/** Clés de traduction : afficher avec tr(). */
export const BACKUP_REASON_LABELS: Record<SaveBackup['reason'], string> = {
  auto: msg('Auto'),
  manual: msg('Manuelle'),
  'pre-restore': msg('Avant restauration'),
  'pre-edit': msg('Avant modification')
};

/** Taille lisible (ex: "340 Ko", "1,2 Mo"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${t('o')}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${t('Ko')}`;
  return `${(bytes / 1024 / 1024).toLocaleString(uiLocale(), { maximumFractionDigits: 1 })} ${t('Mo')}`;
}

/**
 * Libellés d'emplacements de sauvegarde envoyés par main (game-tools.ts) :
 * identifiants stables en anglais (une restauration associe une copie à son
 * emplacement par ce libellé), traduits ici à l'affichage.
 */
const SAVE_LOCATION_LABELS: Record<string, string> = {
  Saves: msg('Sauvegardes'),
  'Saves (game)': msg('Sauvegardes (jeu)'),
  'Game folder (SaveNN)': msg('Dossier du jeu (SaveNN)'),
  'Godot (Roaming, dedicated folder)': msg('Godot (Roaming, dossier dédié)'),
  'Unreal (game)': msg('Unreal (jeu)')
};

/** Libellé affiché d'un emplacement de sauvegarde (« … (sandbox) » compris). */
export function saveLocationLabel(label: string): string {
  const sandbox = label.endsWith(' (sandbox)');
  const base = sandbox ? label.slice(0, -' (sandbox)'.length) : label;
  const key = SAVE_LOCATION_LABELS[base];
  const shown = key ? tr(key) : base;
  return sandbox ? `${shown} (sandbox)` : shown;
}

/** Langues cibles proposées pour la traduction automatique (codes XUnity ; `label` : clé, tr()). */
export const TRANSLATION_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: msg('Anglais') },
  { code: 'fr', label: msg('Français') },
  { code: 'es', label: msg('Espagnol') },
  { code: 'de', label: msg('Allemand') },
  { code: 'zh-CN', label: msg('Chinois (simplifié)') },
  { code: 'ko', label: msg('Coréen') }
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
