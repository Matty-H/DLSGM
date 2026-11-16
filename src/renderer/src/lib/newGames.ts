/**
 * Jeux qui viennent d'arriver dans la bibliothèque (import d'archive,
 * réception réseau, dossier ajouté) : leur jaquette entre avec une animation à
 * part (animations.css, card-new).
 *
 * `known` = les jeux présents au rendu précédent, `null` tant que la
 * bibliothèque n'a pas été lue : ce premier contenu sert de référence, rien
 * n'y est nouveau. Est nouveau tout jeu présent maintenant et absent juste
 * avant — y compris un jeu supprimé puis réimporté (sa fiche reste dans le
 * cache, mais c'est bien une arrivée).
 *
 * Au-delà de `MAX_NEW_AT_ONCE` arrivées d'un coup, ce n'est pas un import
 * (les jeux arrivent un par un) mais une autre bibliothèque qui s'affiche —
 * dossier changé, disque rebranché : rien n'est signalé.
 */
export const MAX_NEW_AT_ONCE = 8;

export function detectNewGames(known: ReadonlySet<string> | null, ids: readonly string[]): { known: Set<string>; added: string[] } {
  const next = new Set(ids);
  if (known === null) return { known: next, added: [] };
  const added = ids.filter(id => !known.has(id));
  return { known: next, added: added.length > MAX_NEW_AT_ONCE ? [] : added };
}
