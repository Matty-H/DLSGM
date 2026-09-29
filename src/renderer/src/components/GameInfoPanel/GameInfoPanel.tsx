import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import FetchFailedView from '../FetchFailedView/FetchFailedView';
import ManualEditForm from '../ManualEditForm/ManualEditForm';
import GameInfoDetails from './GameInfoDetails';
import { fetchGameMetadata } from '../../lib/dataFetcher.js';
import type { GenreAliasGroups } from '../../lib/genreAliases.js';

export interface GameInfoPanelProps {
  gameId: string | null;
  gameData: any | undefined;
  carouselIndex: number;
  onCarouselIndexChange: (index: number) => void;
  getWorkImageSrc: (gameId: string) => string;
  getSampleImageSrc: (gameId: string, index: number) => string;
  onClose: () => void;
  onLaunch: (gameId: string) => void;
  isRunning: boolean;
  isAnyGameRunning: boolean;
  onUpdateGame: (gameId: string, patch: Record<string, any>) => void;
  onReplaceGame: (gameId: string, data: Record<string, any>) => void;
  onRemoveGame: (gameId: string) => Promise<void>;
  onChooseExecutable: (gameId: string) => void;
  onOpenFolder: (gameId: string) => void;
  onGenreClick: (genre: string) => void;
  onAfterRetryFetch: () => void;
  genreAliasGroups: GenreAliasGroups;
}

/**
 * Panneau latéral de détail d'un jeu (docké à droite de la grille, comme le
 * mockup) : bascule entre la vue détaillée, la vue d'échec de fetch
 * (avec retry/édition manuelle), et le formulaire d'édition manuelle, selon
 * l'état de la fiche sélectionnée.
 */
export default function GameInfoPanel({
  gameId,
  gameData,
  carouselIndex,
  onCarouselIndexChange,
  getWorkImageSrc,
  getSampleImageSrc,
  onClose,
  onLaunch,
  isRunning,
  isAnyGameRunning,
  onUpdateGame,
  onReplaceGame,
  onRemoveGame,
  onChooseExecutable,
  onOpenFolder,
  onGenreClick,
  onAfterRetryFetch,
  genreAliasGroups
}: GameInfoPanelProps) {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setIsEditing(false);
  }, [gameId]);

  if (!gameId) return null;

  return (
    // Hauteur bornée à la zone visible (sous la barre du haut et la barre
    // d'outils) avec défilement interne : sinon, le panneau étant sticky, sa
    // partie basse n'est atteignable qu'en faisant défiler toute la grille.
    // Le défilement est sur un conteneur intérieur pour ne pas rogner les
    // coins décoratifs, positionnés hors de la carte.
    <div className="card blueprint elev-md sticky top-0 flex max-h-[calc(100vh-11.5rem)] w-[380px] flex-shrink-0 flex-col">
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <button type="button" onClick={onClose} aria-label="Fermer" className="btn btn-ghost btn-icon absolute right-2 top-2 z-10">
        <X size={14} strokeWidth={1.5} />
      </button>

      <div className="-mx-2 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-4">
        {!gameData ? (
          <p className="p-3">Informations non disponibles pour {gameId}.</p>
        ) : gameData.fetchFailed ? (
          <div className="p-3">
            <FetchFailedView
              gameId={gameId}
              error={gameData.error}
              onClose={onClose}
              onRetry={() => {
                onRemoveGame(gameId)
                  .then(() => fetchGameMetadata(gameId))
                  .then(onAfterRetryFetch);
                onClose();
              }}
              onManualEdit={() => setIsEditing(true)}
              onOpenFolder={() => onOpenFolder(gameId)}
            />
          </div>
        ) : isEditing ? (
          <div className="p-3">
            <ManualEditForm
              gameId={gameId}
              gameData={gameData}
              onCancel={() => setIsEditing(false)}
              onSave={data => {
                onReplaceGame(gameId, data);
                setIsEditing(false);
              }}
            />
          </div>
        ) : (
          <GameInfoDetails
            gameId={gameId}
            gameData={gameData}
            carouselIndex={carouselIndex}
            onCarouselIndexChange={onCarouselIndexChange}
            getWorkImageSrc={getWorkImageSrc}
            getSampleImageSrc={getSampleImageSrc}
            onClose={onClose}
            onLaunch={onLaunch}
            isRunning={isRunning}
            isAnyGameRunning={isAnyGameRunning}
            onUpdateGame={onUpdateGame}
            onOpenFolder={onOpenFolder}
            onChooseExecutable={onChooseExecutable}
            onGenreClick={onGenreClick}
            onEdit={() => setIsEditing(true)}
            genreAliasGroups={genreAliasGroups}
          />
        )}
      </div>
    </div>
  );
}
