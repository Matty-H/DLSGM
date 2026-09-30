import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import GameCard from '../GameCard/GameCard';
import type { Shelf, ShelfSize } from '../../lib/collections.js';

export interface HomeScreenProps {
  shelves: Shelf[];
  /** Aucun jeu dans la bibliothèque (dossier vide ou non configuré). */
  isLibraryEmpty: boolean;
  runningGames: Set<string>;
  blurAdultContent: boolean;
  revealedGames: Set<string>;
  getWorkImageSrc: (gameId: string) => string;
  onOpenGame: (gameId: string) => void;
  onReveal: (gameId: string) => void;
  /** "Tout voir" : ouvre la bibliothèque filtrée / triée comme l'étagère. */
  onShowAll: (showAll: Shelf['showAll']) => void;
  /** Ouvre Paramètres › Collections sur cette collection. */
  onEditCollection: (collectionId: string) => void;
}

// Largeur des jaquettes selon la taille choisie pour l'étagère.
const CARD_WIDTH: Record<ShelfSize, string> = { small: 'w-[160px]', medium: 'w-[220px]', large: 'w-[300px]' };

const noop = () => undefined;

/**
 * Accueil façon SteamOS : une étagère horizontale par collection
 * automatique (récemment joués, à finir, ajoutés récemment, jamais lancés)
 * puis par collection de l'utilisateur.
 */
export default function HomeScreen({
  shelves,
  isLibraryEmpty,
  runningGames,
  blurAdultContent,
  revealedGames,
  getWorkImageSrc,
  onOpenGame,
  onReveal,
  onShowAll,
  onEditCollection
}: HomeScreenProps) {
  return (
    <div data-scroll-root className="animate-steam-in min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
      {isLibraryEmpty && (
        <p className="text-text-secondary">Aucun jeu dans la bibliothèque. Choisis ton dossier de jeux dans les paramètres.</p>
      )}

      {shelves.map(shelf => (
        <section key={shelf.key} className="mb-7">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="m-0 text-[20px] font-bold">{shelf.title}</h2>
            <span className="section-title">{shelf.total}</span>
            <div className="ml-auto flex items-center gap-1">
              {shelf.collectionId && (
                <button
                  type="button"
                  onClick={() => onEditCollection(shelf.collectionId!)}
                  aria-label={`Régler la collection ${shelf.title}`}
                  title="Régler la collection (jeux, règles, affichage)"
                  className="btn btn-ghost btn-icon"
                >
                  <SlidersHorizontal size={15} strokeWidth={2.25} />
                </button>
              )}
              {shelf.total > 0 && (
                <button type="button" onClick={() => onShowAll(shelf.showAll)} className="btn btn-ghost py-1 text-[13px]">
                  Tout voir
                  <ChevronRight size={15} strokeWidth={2.25} />
                </button>
              )}
            </div>
          </div>

          {shelf.games.length === 0 ? (
            <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
              Il semblerait que cette collection soit vide.
              {shelf.collectionId && (
                <button type="button" onClick={() => onEditCollection(shelf.collectionId!)} className="btn py-1 text-[13px]">
                  <SlidersHorizontal size={14} strokeWidth={2.25} />
                  Régler ses paramètres dans « Collections »
                </button>
              )}
            </p>
          ) : (
            // Padding : le halo de focus des jaquettes ne doit pas être rogné par le défilement horizontal.
            <div className="-mx-2 flex gap-5 overflow-x-auto px-2 py-2">
              {shelf.games.map(({ id, data }) => (
                <div key={id} className={`${CARD_WIDTH[shelf.size]} flex-shrink-0`}>
                  <GameCard
                    gameId={id}
                    gameData={data}
                    imageSrc={getWorkImageSrc(id)}
                    isRunning={runningGames.has(id)}
                    isFocused={false}
                    isBlurred={data.age_category === 'R18' && blurAdultContent && !revealedGames.has(id)}
                    onOpenInfo={onOpenGame}
                    onReveal={onReveal}
                    onFocusGame={noop}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
