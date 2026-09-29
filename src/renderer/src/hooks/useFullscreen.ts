import { useCallback, useEffect, useState } from 'react';

/**
 * État du plein écran de la fenêtre (piloté par main : F11, bouton de la
 * barre du haut, bouton View de la manette, paramètre de démarrage).
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.isFullscreen().then(value => !cancelled && setIsFullscreen(value));
    const unsubscribe = window.electronAPI.onFullscreenChange(setIsFullscreen);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const toggle = useCallback(() => {
    window.electronAPI.toggleFullscreen().then(setIsFullscreen);
  }, []);

  return { isFullscreen, toggle };
}
