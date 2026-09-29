import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Intégration Sandboxie-Plus (Windows) : chaque jeu est lancé dans sa propre
 * sandbox `DLSGM<ID>`, où ses écritures hors de son dossier (AppData,
 * registre HKCU...) sont redirigées au lieu de polluer le système.
 *
 * Le dossier du jeu est déclaré en accès direct (OpenFilePath) : patchs,
 * sauvegardes locales (RPG Maker, Wolf...) et .dlsgm restent de vrais
 * fichiers, visibles de DLSGM et conservés quand on vide la sandbox.
 *
 * Commandes utilisées (doc officielle Sandboxie) :
 *   Start.exe  /box:<nom> /wait <exe>        lance et attend la fin du programme
 *   Start.exe  /box:<nom> delete_sandbox_silent
 *   Start.exe  /reload                       recharge Sandboxie.ini dans le driver
 *   SbieIni.exe query|set <section> <clé> [valeur]
 */

const SBIE_TIMEOUT_MS = 30000;

/** Préfixe des sandboxes gérées par DLSGM : leurs réglages ci-dessous sont réécrits à chaque lancement. */
const BOX_PREFIX = 'DLSGM';

/**
 * Nom de la sandbox d'un jeu. Sandboxie n'accepte que lettres et chiffres
 * (32 caractères max) : l'ID DLsite, déjà validé, s'y concatène tel quel.
 */
export function boxNameFor(gameId: string): string {
  return `${BOX_PREFIX}${gameId}`;
}

interface SbieRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(file: string, args: string[]): Promise<SbieRunResult> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: SBIE_TIMEOUT_MS }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : null) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Dossier d'installation depuis le service SbieSvc (installation dans un dossier personnalisé). */
function installDirFromRegistry(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SbieSvc', '/v', 'ImagePath'], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve(null);
      // Ligne du type : ImagePath    REG_EXPAND_SZ    "C:\Program Files\Sandboxie-Plus\SbieSvc.exe"
      const match = /ImagePath\s+REG_\w+\s+"?([^"\r\n]+?SbieSvc\.exe)/i.exec(String(stdout));
      resolve(match ? path.dirname(match[1]) : null);
    });
  });
}

/**
 * Dossier d'installation de Sandboxie (Plus ou Classic), ou null s'il n'est
 * pas installé. Recalculé à chaque appel : l'utilisateur peut l'installer
 * sans redémarrer DLSGM.
 */
export async function findSandboxieDir(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    await installDirFromRegistry(),
    path.join(programFiles, 'Sandboxie-Plus'),
    path.join(programFiles, 'Sandboxie')
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'Start.exe')) && fs.existsSync(path.join(dir, 'SbieIni.exe'))) return dir;
  }
  return null;
}

async function query(sbieIni: string, section: string, setting: string): Promise<string> {
  const { stdout } = await run(sbieIni, ['query', section, setting]);
  return stdout.trim();
}

/** `Enabled` peut porter une restriction de groupe (ex: "y,Admins") : seul le "y" compte. */
async function boxExists(sbieIni: string, box: string): Promise<boolean> {
  return (await query(sbieIni, box, 'Enabled')).toLowerCase().startsWith('y');
}

async function set(sbieIni: string, section: string, setting: string, value: string): Promise<void> {
  const result = await run(sbieIni, ['set', section, setting, value]);
  if (result.code !== 0) {
    throw new Error(
      `Sandboxie a refusé la modification de sa configuration (${section} ${setting}, code ${result.code}). ` +
      "Vérifie dans Sandboxie-Plus que la configuration n'est pas réservée aux administrateurs ou protégée par mot de passe."
    );
  }
}

/**
 * Crée (si besoin) et configure la sandbox d'un jeu, puis recharge la
 * configuration du driver. Idempotent : appelé avant chaque lancement.
 */
export async function ensureGameBox(sandboxieDir: string, gameId: string, gamePath: string): Promise<string> {
  const sbieIni = path.join(sandboxieDir, 'SbieIni.exe');
  const box = boxNameFor(gameId);

  if (!(await boxExists(sbieIni, box))) {
    await set(sbieIni, box, 'Enabled', 'y');
    // Même niveau de configuration que la sandbox par défaut : évite que
    // Sandboxie-Plus ne "migre" la nouvelle sandbox comme une ancienne.
    const configLevel = await query(sbieIni, 'DefaultBox', 'ConfigLevel');
    if (/^\d+$/.test(configLevel)) await set(sbieIni, box, 'ConfigLevel', configLevel);
    // Pas de fenêtre de récupération de fichiers à chaque sauvegarde.
    await set(sbieIni, box, 'AutoRecover', 'n');
    // Un jeu n'a pas besoin des droits admin ; les retirer durcit l'isolation.
    await set(sbieIni, box, 'DropAdminRights', 'y');

    if (!(await boxExists(sbieIni, box))) {
      throw new Error(`Impossible de créer la sandbox ${box} dans Sandboxie.`);
    }
  }

  // `set` remplace toutes les lignes OpenFilePath de la sandbox : réécrit à
  // chaque lancement, il suit un éventuel déplacement du dossier de jeux.
  // Le "\" final est requis : Sandboxie y ajoute "*" (dossier et tout son contenu).
  await set(sbieIni, box, 'OpenFilePath', `${path.resolve(gamePath)}\\`);

  await run(path.join(sandboxieDir, 'Start.exe'), ['/reload']);
  return box;
}

/** Commande et arguments pour lancer `executablePath` dans la sandbox du jeu, en attendant sa fin. */
export function sandboxedCommand(sandboxieDir: string, box: string, executablePath: string): { command: string; args: string[] } {
  return { command: path.join(sandboxieDir, 'Start.exe'), args: [`/box:${box}`, '/wait', executablePath] };
}

/**
 * Vide la sandbox d'un jeu : tout ce qu'il a écrit hors de son dossier
 * (config, sauvegardes AppData, registre) est supprimé. Le dossier du jeu
 * n'est pas touché (accès direct, hors sandbox).
 */
export async function deleteGameBox(sandboxieDir: string, gameId: string): Promise<void> {
  const result = await run(path.join(sandboxieDir, 'Start.exe'), [`/box:${boxNameFor(gameId)}`, 'delete_sandbox_silent']);
  if (result.code !== 0) throw new Error(`Sandboxie n'a pas pu vider la sandbox (code ${result.code}).`);
}
