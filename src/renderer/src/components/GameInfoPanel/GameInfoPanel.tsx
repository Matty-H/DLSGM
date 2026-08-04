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
  onRemoveGame: (gameId: string) => void;
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
    <div className="card blueprint elev-md sticky top-0 w-[380px] flex-shrink-0 pb-4">
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <button type="button" onClick={onClose} aria-label="Fermer" className="btn btn-ghost btn-icon absolute right-2 top-2 z-10">
        <X size={14} strokeWidth={1.5} />
      </button>

      {!gameData ? (
        <p className="p-3">Informations non disponibles pour {gameId}.</p>
      ) : gameData.fetchFailed ? (
        <div className="p-3">
          <FetchFailedView
            gameId={gameId}
            error={gameData.error}
            onClose={onClose}
            onRetry={() => {
              onRemoveGame(gameId);
              fetchGameMetadata(gameId).then(onAfterRetryFetch);
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
          onGenreClick={onGenreClick}
          onEdit={() => setIsEditing(true)}
          genreAliasGroups={genreAliasGroups}
        />
      )}
    </div>
  );
}
