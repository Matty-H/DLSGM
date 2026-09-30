import { ChevronRight } from 'lucide-react';
import GameCard from '../GameCard/GameCard';
import type { Shelf } from '../../lib/collections.js';

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
}

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
  onShowAll
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
            {shelf.total > 0 && (
              <button type="button" onClick={() => onShowAll(shelf.showAll)} className="btn btn-ghost ml-auto py-1 text-[13px]">
                Tout voir
                <ChevronRight size={15} strokeWidth={2.25} />
              </button>
            )}
          </div>

          {shelf.games.length === 0 ? (
            <p className="m-0 text-[13px] text-text-muted">
              Collection vide : ajoute des jeux depuis leur page (section « Collections »).
            </p>
          ) : (
            // Padding : le halo de focus des jaquettes ne doit pas être rogné par le défilement horizontal.
            <div className="-mx-2 flex gap-5 overflow-x-auto px-2 py-2">
              {shelf.games.map(({ id, data }) => (
                <div key={id} className="w-[220px] flex-shrink-0">
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
