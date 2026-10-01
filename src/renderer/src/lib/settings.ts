import type { AppSettings } from '../../../shared/ipc-types';

/**
 * Gère la persistance des paramètres de l'application (dossier des jeux,
 * fréquence de rafraîchissement, langue, tri sélectionné) via IPC.
 *
 * La construction de l'UI des paramètres (formulaire, boutons) vit désormais
 * dans le composant SettingsPanel / le hook useSettings ; ce module ne garde
 * que la persistance.
 */

export interface Settings extends AppSettings {
  selectedSort: string;
}

const DEFAULT_SETTINGS: Settings = {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US',
  blurAdultContent: true,
  // Obsolète (remplacé par le dictionnaire des tags) : lu une fois par main pour l'amorcer.
  genreAliasGroups: [],
  sandboxLaunch: false,
  startFullscreen: false,
  lanSharePort: 47821,
  dlsiteProxy: '',
  collections: [],
  homeShelves: {},
  hideCompleted: false,
  autoClicker: { enabled: false, hotkey: 'F6', intervalMs: 100, button: 'left', double: false, repeat: 0, position: null },
  pixelTrigger: { enabled: false, hotkey: 'F7' },
  overlayEnabled: true,
  autoBackupSaves: true,
  closeToTray: false,
  checkUpdatesOnStartup: true,
  workspaceFolder: '',
  piaRetry: false,
  piaRegion: 'jp-tokyo',
  macroRecorder: { enabled: false, recordHotkey: 'F8', playHotkey: 'F9' },
  textractorPath: '',
  textractorOutput: 'both',
  rpgMakerExtractor: false,
  ocrTranslate: { enabled: false, hotkey: 'F10', source: 'ja', target: 'fr', engine: 'dictionary', localUrl: 'http://127.0.0.1:11434/v1', localModel: '' },
  localeEmulatorPath: '',
  screenshot: { enabled: true, hotkey: 'Ctrl+F8' },
  selectedSort: 'name_asc'



};

/**
 * Charge les paramètres depuis le stockage persistant, fusionnés avec les
 * valeurs par défaut.
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const savedSettings = await window.electronAPI.getSettings();
    return { ...DEFAULT_SETTINGS, ...savedSettings };
  } catch (error) {
    console.error('Erreur lors du chargement des paramètres:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Sauvegarde l'intégralité des paramètres.
 */
export async function saveSettings(settings: Settings): Promise<boolean> {
  try {
    await window.electronAPI.saveSettings(settings);
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des paramètres:', error);
    return false;
  }
}
