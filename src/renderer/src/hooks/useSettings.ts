import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings as persistSettings } from '../lib/settings.js';

export interface AppSettings {
  destinationFolder: string;
  refreshRate: number;
  language: string;
  blurAdultContent: boolean;
  genreAliasGroups: string[][];
  sandboxLaunch: boolean;
  startFullscreen: boolean;
  lanSharePort: number;
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
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await persistSettings(next);
  }, []);

  return { settings, save };
}
