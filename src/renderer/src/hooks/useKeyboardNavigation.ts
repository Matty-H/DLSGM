import { useEffect } from 'react';

interface KeyboardNavigationOptions {
  displayedGameIds: string[];
  selectedGameId: string | null;
  isLibraryTab: boolean;
  onSelectGame: (gameId: string) => void;
  onClosePanel: () => void;
  onLeaveTab: () => void;
  onLaunchGame: (gameId: string) => void;
  onCarouselPrev: () => void;
  onCarouselNext: () => void;
}

/**
 * Raccourcis clavier globaux : Échap (retour à la bibliothèque depuis un
 * autre onglet, ou fermer le panneau de détail), Entrée (lancer le jeu
 * sélectionné), flèches gauche/droite (carrousel), flèches haut/bas
 * (naviguer dans la liste affichée). La navigation clavier de la
 * bibliothèque (flèches/entrée/carrousel) n'est active que sur l'onglet
 * Bibliothèque.
 */
export function useKeyboardNavigation({
  displayedGameIds,
  selectedGameId,
  isLibraryTab,
  onSelectGame,
  onClosePanel,
  onLeaveTab,
  onLaunchGame,
  onCarouselPrev,
  onCarouselNext
}: KeyboardNavigationOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isPanelOpen = isLibraryTab && selectedGameId !== null;

      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') target.blur();
        return;
      }

      if (e.key === 'Escape') {
        if (!isLibraryTab) {
          onLeaveTab();
        } else if (isPanelOpen) {
          onClosePanel();
        }
        return;
      }

      if (!isLibraryTab) return;

      if (e.key === 'Enter' && isPanelOpen && selectedGameId) {
        e.preventDefault();
        onLaunchGame(selectedGameId);
        return;
      }

      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && isPanelOpen) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') onCarouselPrev();
        else onCarouselNext();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let nextGameId: string | null = null;

        if (!selectedGameId) {
          if (displayedGameIds.length > 0) nextGameId = displayedGameIds[0];
        } else {
          const currentIndex = displayedGameIds.indexOf(selectedGameId);
          if (e.key === 'ArrowDown' && currentIndex < displayedGameIds.length - 1) {
            nextGameId = displayedGameIds[currentIndex + 1];
          } else if (e.key === 'ArrowUp' && currentIndex > 0) {
            nextGameId = displayedGameIds[currentIndex - 1];
          }
        }

        if (nextGameId) onSelectGame(nextGameId);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    displayedGameIds,
    selectedGameId,
    isLibraryTab,
    onSelectGame,
    onClosePanel,
    onLeaveTab,
    onLaunchGame,
    onCarouselPrev,
    onCarouselNext
  ]);
}
