import { useEffect, useState } from 'react';
import FetchFailedView from '../FetchFailedView/FetchFailedView';
import ManualEditForm from '../ManualEditForm/ManualEditForm';
import GameInfoDetails from './GameInfoDetails';
import { fetchGameMetadata } from '../../lib/dataFetcher.js';

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
  onUpdateGame: (gameId: string, patch: Record<string, any>) => void;
  onReplaceGame: (gameId: string, data: Record<string, any>) => void;
  onRemoveGame: (gameId: string) => void;
  onOpenFolder: (gameId: string) => void;
  onGenreClick: (genre: string) => void;
  onAfterRetryFetch: () => void;
}

/**
 * Panneau latéral de détail d'un jeu : bascule entre la vue détaillée, la vue
 * d'échec de fetch (avec retry/édition manuelle), et le formulaire d'édition
 * manuelle, selon l'état de la fiche sélectionnée.
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
  onUpdateGame,
  onReplaceGame,
  onRemoveGame,
  onOpenFolder,
  onGenreClick,
  onAfterRetryFetch
}: GameInfoPanelProps) {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setIsEditing(false);
  }, [gameId]);

  const isOpen = gameId !== null;

  return (
    <aside
      className={`relative z-50 flex-shrink-0 overflow-hidden border-l bg-[#121216] transition-[width,border-left-width] duration-[400ms] ${
        isOpen ? 'pointer-events-auto w-[500px] overflow-y-auto border-glass-border' : 'pointer-events-none w-0 border-transparent'
      }`}
    >
      {isOpen && gameId && (
        <div className="min-w-[400px] p-6">
          {!gameData ? (
            <p>Informations non disponibles pour {gameId}.</p>
          ) : gameData.fetchFailed ? (
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
          ) : isEditing ? (
            <ManualEditForm
              gameId={gameId}
              gameData={gameData}
              onCancel={() => setIsEditing(false)}
              onSave={data => {
                onReplaceGame(gameId, data);
                setIsEditing(false);
              }}
            />
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
              onUpdateGame={onUpdateGame}
              onOpenFolder={onOpenFolder}
              onGenreClick={onGenreClick}
              onEdit={() => setIsEditing(true)}
            />
          )}
        </div>
      )}
    </aside>
  );
}
