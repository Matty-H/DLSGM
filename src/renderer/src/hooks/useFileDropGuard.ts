import { useEffect } from 'react';

/**
 * Un fichier lâché hors d'une zone de dépôt ferait naviguer la fenêtre vers
 * ce fichier. main refuse déjà toute navigation (`will-navigate`) ; ceci
 * évite en plus le curseur "déposer" trompeur en dehors des zones prévues
 * (qui, elles, appellent preventDefault et stopPropagation elles-mêmes).
 */
export function useFileDropGuard() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
