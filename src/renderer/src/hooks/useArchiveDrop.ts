import { useCallback, useRef, useState, type DragEvent } from 'react';

/** Le glisser en cours porte des fichiers (et pas du texte ou une image de la page). */
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Zone de dépôt d'archives : `handlers` se posent sur le conteneur,
 * `dragging` sert à afficher l'invite. `enabled` à false (import en cours)
 * laisse le garde-fou global refuser le dépôt. Les fichiers sont transmis
 * tels quels : c'est le preload qui lit leur chemin, et main qui décide si ce
 * sont des archives.
 */
export function useArchiveDrop(enabled: boolean, onDrop: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave se déclenchent à chaque élément survolé : on compte.
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      depth.current++;
      setDragging(true);
    },
    [enabled]
  );
  const onDragLeave = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);
  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      // stopPropagation : sinon useFileDropGuard remet le curseur « interdit ».
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    },
    [enabled]
  );
  const handleDrop = useCallback(
    (e: DragEvent) => {
      depth.current = 0;
      setDragging(false);
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      onDrop(Array.from(e.dataTransfer.files));
    },
    [enabled, onDrop]
  );

  return { dragging: dragging && enabled, handlers: { onDragEnter, onDragLeave, onDragOver, onDrop: handleDrop } };
}
