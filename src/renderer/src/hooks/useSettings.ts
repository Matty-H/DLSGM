import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings as persistSettings } from '../lib/settings.js';
import type { AutoClickerSettings, GameCollection, HomeShelfPrefs, MacroRecorderSettings, OcrTranslateSettings, PixelTriggerSettings, ScreenshotSettings } from '../../../shared/ipc-types';

export interface AppSettings {
  destinationFolder: string;
  refreshRate: number;
  language: string;
  blurAdultContent: boolean;
  genreAliasGroups: string[][];
  sandboxLaunch: boolean;
  startFullscreen: boolean;
  lanSharePort: number;
  dlsiteProxy: string;
  collections: GameCollection[];
  homeShelves: Record<string, HomeShelfPrefs>;
  hideCompleted: boolean;
  autoClicker: AutoClickerSettings;
  pixelTrigger: PixelTriggerSettings;
  overlayEnabled: boolean;
  autoBackupSaves: boolean;
  closeToTray: boolean;
  workspaceFolder: string;
  piaRetry: boolean;
  piaRegion: string;
  macroRecorder: MacroRecorderSettings;
  textractorPath: string;
  textractorOutput: 'clipboard' | 'file' | 'both';
  rpgMakerExtractor: boolean;
  ocrTranslate: OcrTranslateSettings;
  localeEmulatorPath: string;
  screenshot: ScreenshotSettings;
  checkUpdatesOnStartup: boolean;
  selectedSort: string;



}

/**
 * Charge/sauvegarde les paramètres de l'application. `settings` est `null`
 * tant que le chargement initial n'est pas terminé.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((loaded: AppSettings) => {
      if (!cancelled) setSettings(loaded);
    });
    // Auto-clicker / détecteur réglés depuis leur témoin (autre fenêtre) : sinon
    // un enregistrement ici remettrait les anciennes valeurs.
    const off = window.electronAPI.onSettingsChanged(() => {
      loadSettings().then((loaded: AppSettings) => {
        if (!cancelled) setSettings(prev => (prev ? { ...prev, autoClicker: loaded.autoClicker, pixelTrigger: loaded.pixelTrigger, checkUpdatesOnStartup: loaded.checkUpdatesOnStartup } : loaded));
      });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const save = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await persistSettings(next);
    // Relecture : main réécrit certaines valeurs à l'enregistrement (mot de
    // passe du proxy remplacé par un masque, chiffré à part).
    setSettings(await loadSettings());
  }, []);

  return { settings, save };
}
