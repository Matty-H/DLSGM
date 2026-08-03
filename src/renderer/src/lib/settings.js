/**
 * Gère la persistance des paramètres de l'application (dossier des jeux,
 * fréquence de rafraîchissement, langue, tri sélectionné) via IPC.
 *
 * La construction de l'UI des paramètres (formulaire, boutons) vit désormais
 * dans le composant SettingsPanel / le hook useSettings ; ce module ne garde
 * que la persistance.
 */

const DEFAULT_SETTINGS = {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US',
  selectedSort: 'name_asc'
};

/**
 * Charge les paramètres depuis le stockage persistant, fusionnés avec les
 * valeurs par défaut.
 */
export async function loadSettings() {
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
export async function saveSettings(settings) {
  try {
    await window.electronAPI.saveSettings(settings);
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des paramètres:', error);
    return false;
  }
}
