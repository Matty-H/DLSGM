import { useEffect } from 'react';

interface KeyboardNavigationOptions {
  displayedGameIds: string[];
  /** Jeu dont la page de détail est ouverte. */
  selectedGameId: string | null;
  /** Jaquette ciblée dans la grille (page de détail fermée). */
  focusedGameId: string | null;
  isLibraryTab: boolean;
  onFocusGame: (gameId: string) => void;
  onOpenGame: (gameId: string) => void;
  onClosePanel: () => void;
  onLeaveTab: () => void;
  onLaunchGame: (gameId: string) => void;
  onCarouselPrev: () => void;
  onCarouselNext: () => void;
}

/** Nombre de colonnes réellement rendues par la grille (auto-fill). */
function gridColumnCount(): number {
  const grid = document.querySelector<HTMLElement>('[data-games-grid]');
  if (!grid) return 1;
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
  return Math.max(1, columns);
}

/**
 * Raccourcis clavier globaux, façon navigation à la manette de SteamOS :
 * - grille : flèches pour déplacer le focus entre les jaquettes (haut/bas
 *   d'une rangée), Entrée pour ouvrir la page du jeu ciblé ;
 * - page d'un jeu : Entrée pour lancer, gauche/droite pour le carrousel
 *   (haut/bas restent au défilement natif), Échap pour revenir à la grille ;
 * - autre onglet : Échap pour revenir à la bibliothèque.
 */
export function useKeyboardNavigation({
  displayedGameIds,
  selectedGameId,
  focusedGameId,
  isLibraryTab,
  onFocusGame,
  onOpenGame,
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

      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
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

      // Entrée sur un bouton focalisé doit activer ce bouton, pas lancer le jeu.
      if (e.key === 'Enter' && target.tagName !== 'BUTTON' && target.tagName !== 'A') {
        if (isPanelOpen && selectedGameId) {
          e.preventDefault();
          onLaunchGame(selectedGameId);
        } else if (!isPanelOpen && focusedGameId) {
          e.preventDefault();
          onOpenGame(focusedGameId);
        }
        return;
      }

      if (isPanelOpen) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (e.key === 'ArrowLeft') onCarouselPrev();
          else onCarouselNext();
        }
        return;
      }

      const deltas: Record<string, () => number> = {
        ArrowLeft: () => -1,
        ArrowRight: () => 1,
        ArrowUp: () => -gridColumnCount(),
        ArrowDown: () => gridColumnCount()
      };
      if (!(e.key in deltas) || displayedGameIds.length === 0) return;
      e.preventDefault();

      const currentIndex = focusedGameId ? displayedGameIds.indexOf(focusedGameId) : -1;
      if (currentIndex === -1) {
        onFocusGame(displayedGameIds[0]);
        return;
      }
      const nextIndex = currentIndex + deltas[e.key]();
      if (nextIndex >= 0 && nextIndex < displayedGameIds.length) {
        onFocusGame(displayedGameIds[nextIndex]);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    displayedGameIds,
    selectedGameId,
    focusedGameId,
    isLibraryTab,
    onFocusGame,
    onOpenGame,
    onClosePanel,
    onLeaveTab,
    onLaunchGame,
    onCarouselPrev,
    onCarouselNext
  ]);
}
