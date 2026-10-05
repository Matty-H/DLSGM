import fs from 'fs';
import path from 'path';
import { findRpgMakerWebRoot } from './game-tools';

/**
 * Mode debug RPG Maker MV/MZ : lancement en mode test. `Utils.isOptionValid`
 * (rpg_core.js 1.6 / rmmz_core.js, lus dans de vrais jeux) regarde le
 * **premier** argument de NW.js : `test` active le playtest — menu de debug
 * F9 sur la carte, outils de développement F8 (si le NW.js livré les a).
 *
 * Certains jeux se lancent par un exe « lanceur » qui ne transmet pas les
 * arguments, le vrai NW.js étant rangé à côté de `www/` (ex: `data/`) : dans
 * ce cas c'est ce NW.js qui est lancé directement.
 */

const IGNORED_EXE = ['unins', 'unitycrashhandler', 'vcredist', 'vc_redist', 'dxsetup', 'dxwebsetup', 'notification_helper'];

/** Exécutable NW.js du dossier (à côté de nw.dll), le plus gros s'il y en a plusieurs. */
function findNwExe(dir: string): string | null {
  if (!fs.existsSync(path.join(dir, 'nw.dll'))) return null;
  const exes = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.exe') && !IGNORED_EXE.some(word => e.name.toLowerCase().includes(word)))
    .map(e => path.join(dir, e.name));
  return exes.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] ?? null;
}

/**
 * Lancement en mode test d'un RPG Maker MV/MZ : exécutable (NW.js si celui
 * choisi est un lanceur) et arguments à mettre **avant** ceux de
 * l'utilisateur. null : pas un RPG Maker MV/MZ.
 */
export function rpgMakerDebugLaunch(executablePath: string): { executablePath: string; args: string[] } | null {
  const web = findRpgMakerWebRoot(path.dirname(executablePath));
  if (!web) return null;
  // MV : NW.js à côté de www/ ; MZ : dans le même dossier que index.html.
  const nwDir = path.basename(web.webDir).toLowerCase() === 'www' ? path.dirname(web.webDir) : web.webDir;
  const sameDir = path.resolve(path.dirname(executablePath)).toLowerCase() === path.resolve(nwDir).toLowerCase();
  const exe = sameDir ? executablePath : findNwExe(nwDir) ?? executablePath;
  return { executablePath: exe, args: ['test'] };
}
