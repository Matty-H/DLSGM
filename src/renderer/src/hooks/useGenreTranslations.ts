import { useCallback, useEffect, useState } from 'react';
import type { GenreTranslations } from '../lib/genreNames.js';

/**
 * Dictionnaire des tags JP → EN (tenu par main, enrichi à chaque fetch).
 * Relu quand `refreshKey` change (le cache, après un scan ou une mise à
 * jour : de nouveaux genres ont pu être appris).
 */
export function useGenreTranslations(refreshKey: unknown) {
  const [translations, setTranslations] = useState<GenreTranslations>({});

  const reload = useCallback(async () => {
    try {
      setTranslations(await window.electronAPI.getGenreTranslations());
    } catch (error) {
      console.error('Lecture du dictionnaire des tags impossible:', error);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  /** Traduction manuelle d'un tag (`null` : rendre la main à DLsite). */
  const setTranslation = useCallback(async (japanese: string, english: string | null) => {
    setTranslations(await window.electronAPI.setGenreTranslation(japanese, english));
  }, []);

  return { translations, reload, setTranslation };
}
