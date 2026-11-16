import { useEffect, useState } from 'react';
import { detectNewGames } from '../lib/newGames.js';

/** Durée pendant laquelle un jeu reste « nouveau » : un peu plus que son animation d'entrée. */
const NEW_GAME_MS = 3000;

interface NewGamesState {
  /** `null` tant que la bibliothèque n'a pas été lue une première fois. */
  known: Set<string> | null;
  fresh: Set<string>;
}

/**
 * IDs des jeux qui viennent d'arriver dans la bibliothèque (voir
 * lib/newGames.ts). `ready` : la bibliothèque a été lue une première fois —
 * avant, rien n'est comparé.
 *
 * Calculé **pendant le rendu** (état dérivé : React relance aussitôt le rendu
 * avec le nouvel état), pas dans un effet : la jaquette doit se savoir
 * nouvelle dès son montage — elle fige alors son animation d'entrée, et un
 * effet arriverait un rendu trop tard.
 */
export function useNewGames(ids: string[], ready: boolean): Set<string> {
  const [state, setState] = useState<NewGamesState>(() => ({ known: null, fresh: new Set() }));

  let current = state;
  if (ready) {
    const result = detectNewGames(state.known, ids);
    // Mis à jour dès que la liste des jeux présents change (arrivée ou départ) :
    // un jeu parti puis revenu doit être reconnu comme arrivé.
    const changed = state.known === null || result.known.size !== state.known.size || result.added.length > 0 || ids.some(id => !state.known!.has(id));
    if (changed) {
      current = { known: result.known, fresh: result.added.length > 0 ? new Set([...state.fresh, ...result.added]) : state.fresh };
      setState(current);
    }
  } else if (state.known !== null) {
    // Bibliothèque illisible (dossier non configuré, rechargement) : la
    // prochaine lecture resservira de référence au lieu de tout signaler.
    current = { known: null, fresh: state.fresh };
    setState(current);
  }

  const fresh = current.fresh;
  useEffect(() => {
    if (fresh.size === 0) return;
    const batch = [...fresh];
    const timer = setTimeout(() => {
      setState(previous => {
        const next = new Set(previous.fresh);
        for (const id of batch) next.delete(id);
        return { ...previous, fresh: next };
      });
    }, NEW_GAME_MS);
    return () => clearTimeout(timer);
  }, [fresh]);

  return fresh;
}
