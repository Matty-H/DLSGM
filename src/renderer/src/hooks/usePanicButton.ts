import { useEffect, useState } from 'react';

/**
 * Bascule le "Mode Panique" (Alt+Space, déclenché depuis le processus
 * principal — voir src/main/main.js) : un recouvrement plein écran masque
 * l'application.
 */
export function usePanicButton() {
  const [panicActive, setPanicActive] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onPanicTriggered) return;
    window.electronAPI.onPanicTriggered(() => {
      setPanicActive(prev => !prev);
    });
  }, []);

  return panicActive;
}
