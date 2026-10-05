import fs from 'fs';
import path from 'path';
import type { OsPlatform } from '../shared/platforms';

// Profondeur explorée sous le dossier du jeu (archives souvent emballées dans
// un ou deux dossiers) et nombre d'entrées lues au plus : un jeu aux milliers
// de fichiers ne doit pas bloquer la détection des autres.
const MAX_DEPTH = 3;
const MAX_ENTRIES = 5000;

// .exe qui ne sont pas le jeu : désinstalleurs, redistribuables, crash handlers.
const IGNORED_EXE = ['unins', 'unitycrashhandler', 'vcredist', 'vc_redist', 'dxsetup', 'dxwebsetup'];

/** Plateforme d'un fichier ou dossier d'après son nom, sinon null. */
export function platformOfEntry(name: string, isDirectory: boolean): OsPlatform | null {
  const lower = name.toLowerCase();
  if (isDirectory) return lower.endsWith('.app') ? 'mac' : null;
  if (lower.endsWith('.exe')) return IGNORED_EXE.some(word => lower.includes(word)) ? null : 'windows';
  if (lower.endsWith('.dmg') || lower.endsWith('.app')) return 'mac';
  if (lower.endsWith('.apk')) return 'android';
  return null;
}

/**
 * Plateformes dont une version est présente dans le dossier du jeu, d'après
 * ses fichiers (`.exe`, `.app`/`.dmg`, `.apk`), dans l'ordre Windows, Mac,
 * Android. Ni les dossiers cachés (`.dlsgm`), ni BepInEx (ses outils .exe),
 * ni l'intérieur d'un `.app` ne sont explorés.
 */
export async function detectPlatforms(gamePath: string): Promise<OsPlatform[]> {
  const found = new Set<OsPlatform>();
  let budget = MAX_ENTRIES;
  let level = [gamePath];
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0 && budget > 0; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (--budget < 0) break;
        const platform = platformOfEntry(entry.name, entry.isDirectory());
        if (platform) found.add(platform);
        else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'BepInEx') next.push(path.join(dir, entry.name));
      }
      if (found.size === 3) break;
    }
    if (found.size === 3) break;
    level = next;
  }
  return (['windows', 'mac', 'android'] as const).filter(platform => found.has(platform));
}
