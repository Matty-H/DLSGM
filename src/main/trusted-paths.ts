import type { AppSettings } from '../shared/ipc-types';

/**
 * Réglages qui désignent un programme lancé par DLSGM : dossier de Locale
 * Emulator (LEProc.exe), de Textractor (TextractorCLI.exe), fenêtre de
 * travail du super bouton panique (`shell.openPath`). Le renderer ne peut
 * pas y écrire un chemin de son choix via `save-settings` : un nouveau
 * chemin n'est retenu que s'il vient d'une boîte de dialogue ouverte par
 * main pendant cette session (choix de l'utilisateur). Sinon, une page
 * compromise ferait exécuter n'importe quel fichier du disque.
 */
export class PickedPaths {
  private readonly paths = new Set<string>();

  /** Chemin rendu par une boîte de dialogue de main. */
  add(value: string): string {
    this.paths.add(value);
    return value;
  }

  has(value: string): boolean {
    return this.paths.has(value);
  }
}

const isUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

/** Nouvelle valeur si elle est vide, inchangée ou choisie dans une boîte de dialogue ; sinon l'ancienne. */
function guardPath(next: unknown, previous: string, picked: PickedPaths, allowUrl = false): string {
  if (typeof next !== 'string') return previous;
  if (next === '' || next === previous || picked.has(next) || (allowUrl && isUrl(next))) return next;
  console.warn(`Chemin de programme refusé (non choisi dans une boîte de dialogue) : ${next}`);
  return previous;
}

export function guardExecutablePaths(next: AppSettings, previous: AppSettings, picked: PickedPaths): AppSettings {
  const guarded: AppSettings = {
    ...next,
    localeEmulatorPath: guardPath(next.localeEmulatorPath, previous.localeEmulatorPath ?? '', picked),
    textractorPath: guardPath(next.textractorPath, previous.textractorPath ?? '', picked)
  };
  if (next.superPanic) {
    guarded.superPanic = {
      ...next.superPanic,
      target: guardPath(next.superPanic.target, previous.superPanic?.target ?? '', picked, true)
    };
  }
  return guarded;
}
