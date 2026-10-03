import { loadSettings } from './settings.js';
import type { LaunchGameResult } from '../../../shared/ipc-types';
import { t } from './i18n.js';

/**
 * Gère les interactions avec le système d'exploitation (fichiers, lancements, etc.)
 * via les API exposées par le processus principal.
 *
 * L'état "jeu en cours d'exécution" et le rafraîchissement de l'interface ne
 * sont plus gérés ici : c'est la responsabilité du hook React qui utilise ces
 * fonctions (useGamesLibrary) de les orchestrer autour de l'appel IPC.
 */

/**
 * Récupère le chemin du dossier des jeux depuis les paramètres.
 */
export async function getGamesFolderPath(): Promise<string | null> {
  const settings = await loadSettings();
  return settings.destinationFolder || null;
}

/**
 * Ouvre le dossier d'un jeu dans l'explorateur de fichiers.
 */
export async function openGameFolder(gameId: string): Promise<void> {
  try {
    const success = await window.electronAPI.openGameFolder(gameId);
    if (!success) {
      throw new Error("Impossible d'ouvrir le dossier");
    }
  } catch (error) {
    alert((error as Error).message);
    console.error("Erreur lors de l'ouverture du dossier:", error);
  }
}

/**
 * Lance un jeu. Le temps de jeu de la session est enregistré par le
 * processus principal à la fermeture du jeu.
 */
export async function launchGame(gameId: string): Promise<LaunchGameResult> {
  try {
    const result = await window.electronAPI.launchGame(gameId);
    if (!result.success) {
      alert(t('Impossible de lancer le jeu : {error}', { error: result.error ?? t('erreur inconnue') }));
    }
    return result;
  } catch (error) {
    alert((error as Error).message);
    console.error('Erreur lors du lancement du jeu:', error);
    throw error;
  }
}

/**
 * Ouvre un sélecteur dans le dossier du jeu pour choisir (et mémoriser)
 * l'exécutable à lancer. Renvoie le chemin relatif choisi, ou null si annulé.
 */
export async function chooseGameExecutable(gameId: string): Promise<string | null> {
  try {
    return await window.electronAPI.chooseGameExecutable(gameId);
  } catch (error) {
    alert((error as Error).message);
    console.error("Erreur lors du choix de l'exécutable:", error);
    return null;
  }
}
