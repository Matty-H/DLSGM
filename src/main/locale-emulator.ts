import { spawn as nodeSpawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { listGameProcesses } from './textractor';
import type { LaunchGameResult } from '../shared/ipc-types';

/**
 * Lancement en locale japonaise avec Locale Emulator (Windows), option par
 * jeu : règle les textes illisibles (mojibake), les plantages au démarrage
 * et les noms de fichiers cassés des jeux qui supposent un Windows japonais,
 * sans changer la langue de tout le PC.
 *
 * `LEProc.exe <exe> [args]` lance avec le premier profil global, à défaut le
 * profil ja-JP par défaut (lu dans le source de LEProc). Surtout pas
 * `-run` : il utilise le profil propre à l'exécutable et, faute d'en avoir
 * un, ouvre l'éditeur de profil au lieu de lancer — en silence (vérifié).
 *
 * LEProc rend la main dès le jeu créé : la partie est suivie ensuite par
 * les processus dont l'exécutable est dans le dossier du jeu, pour que le
 * temps de jeu, l'overlay et la copie des sauvegardes restent justes.
 */

/** LEProc.exe dans le dossier de Locale Emulator, ou null. */
export function findLeProc(dir: string): string | null {
  if (!dir) return null;
  const exe = path.join(dir, 'LEProc.exe');
  return fs.existsSync(exe) ? exe : null;
}

/**
 * LE installé pour de bon : `LEInstaller.exe` écrit `LECommonLibrary.dll`
 * à côté de LEProc (l'archive ne la contient pas ; sans elle, LEProc
 * plante au démarrage).
 */
export function leInstalled(dir: string): boolean {
  return findLeProc(dir) !== null && fs.existsSync(path.join(dir, 'LECommonLibrary.dll'));
}

export interface LeLaunchOptions {
  leProc: string;
  executablePath: string;
  gameDir: string;
  /** Processus du jeu (pid → exécutable) ; par défaut via PowerShell. */
  listProcesses?: (gameDir: string) => Promise<Map<number, string>>;
  spawn?: typeof nodeSpawn;
  /** Délai d'apparition du jeu après la sortie de LEProc. */
  appearTimeoutMs?: number;
  pollMs?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Lance le jeu via LEProc et résout à la fin de la partie (plus aucun processus du jeu). */
export async function runWithLocaleEmulator({
  leProc,
  executablePath,
  gameDir,
  listProcesses = listGameProcesses,
  spawn = nodeSpawn,
  appearTimeoutMs = 20_000,
  pollMs = 2_000
}: LeLaunchOptions): Promise<LaunchGameResult> {
  const startedAt = Date.now();
  // LEProc peut rendre la main tout de suite ou rester ouvert tant que le jeu
  // tourne (mesuré : les deux arrivent) : on ne l'attend pas, on suit le jeu.
  let launcherFailure: string | null = null;
  const child = spawn(leProc, [executablePath], { cwd: path.dirname(executablePath), stdio: 'ignore' });
  child.on('error', (error: Error) => {
    launcherFailure = `Locale Emulator n'a pas pu démarrer : ${error.message}`;
  });
  child.on('exit', (code: number | null) => {
    if (code !== 0) {
      launcherFailure = `Locale Emulator a échoué (code ${code}). S'il vient d'être décompressé, lance une fois LEInstaller.exe ; sinon décoche « Lancer en japonais » pour ce jeu.`;
    }
  });

  // Le jeu doit apparaître, puis on attend qu'il n'en reste plus aucun processus.
  let seenAt = 0;
  while (Date.now() - startedAt < appearTimeoutMs) {
    if ((await listProcesses(gameDir)).size > 0) {
      seenAt = Date.now();
      break;
    }
    if (launcherFailure) return { success: false, error: launcherFailure };
    await sleep(Math.min(pollMs, 500));
  }
  if (!seenAt && launcherFailure) return { success: false, error: launcherFailure };
  if (!seenAt) {
    return { success: false, error: "Le jeu n'a pas démarré sous Locale Emulator (profil japonais manquant, ou jeu 64 bits : Locale Emulator ne gère que les jeux 32 bits)." };
  }
  for (;;) {
    await sleep(pollMs);
    if ((await listProcesses(gameDir)).size === 0) break;
    seenAt = Date.now();
  }
  return { success: true, duration: Math.floor((seenAt - startedAt) / 1000) };
}
