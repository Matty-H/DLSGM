/**
 * Plateformes dont une version est présente dans le dossier d'un jeu,
 * détectées d'après ses fichiers (src/main/game-platforms.ts) : `.exe` →
 * Windows, `.app` / `.dmg` → Mac, `.apk` → Android. Module sans import
 * (partagé par main et le renderer).
 */

export type OsPlatform = 'windows' | 'mac' | 'android';

export const OS_PLATFORMS: readonly OsPlatform[] = ['windows', 'mac', 'android'];

/** Plateforme de la machine (`process.platform`), ou null si aucune version de jeu ne peut y tourner. */
export function hostPlatform(nodePlatform: string): OsPlatform | null {
  if (nodePlatform === 'win32') return 'windows';
  if (nodePlatform === 'darwin') return 'mac';
  return null;
}
