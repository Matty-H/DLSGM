import { useEffect, useState } from 'react';
import type { OsPlatform } from '../../../shared/platforms';

/**
 * Plateformes présentes dans le dossier de chaque jeu (main, d'après ses
 * fichiers .exe / .app / .dmg / .apk), relues après chaque scan.
 */
export function useGamePlatforms(gameIds: string[], scanStatus: string) {
  const [platforms, setPlatforms] = useState<Record<string, OsPlatform[]>>({});
  const key = `${scanStatus}:${gameIds.join('|')}`;

  useEffect(() => {
    if (gameIds.length === 0) return;
    let cancelled = false;
    window.electronAPI
      .detectGamePlatforms(gameIds)
      .then(result => !cancelled && setPlatforms(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return platforms;
}
