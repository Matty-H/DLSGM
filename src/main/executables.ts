import fs from 'fs';
import path from 'path';

/**
 * Recherche heuristique de l'exécutable d'un jeu Windows : le plus gros .exe
 * du premier niveau de dossier qui en contient (hors désinstalleurs, crash
 * handlers et redistribuables).
 */
export function findExe(dir: string, depth = 0): string | null {
  if (depth > 3) return null; // Limite la profondeur
  const files = fs.readdirSync(dir, { withFileTypes: true });

  const ignored = ['unins', 'unitycrashhandler', 'vcredist', 'vc_redist', 'dxsetup', 'dxwebsetup'];
  const exes = files
    .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.exe') && !ignored.some(word => f.name.toLowerCase().includes(word)))
    .map(f => path.join(dir, f.name));

  if (exes.length > 0) {
    // Tri par taille pour trouver l'exécutable principal (souvent le plus gros)
    return exes.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  }

  // Sinon chercher dans les sous-dossiers (hors métadonnées DLSGM et mods :
  // BepInEx/XUnity embarquent leurs propres .exe utilitaires)
  for (const f of files) {
    if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'BepInEx') {
      const found = findExe(path.join(dir, f.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function findMacApp(gamePath: string): string | null {
  const appDirName = fs.readdirSync(gamePath).find(file => file.endsWith('.app'));
  return appDirName ? path.join(gamePath, appDirName) : null;
}
