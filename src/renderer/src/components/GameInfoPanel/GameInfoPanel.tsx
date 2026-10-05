import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import FetchFailedView from '../FetchFailedView/FetchFailedView';
import ManualEditForm from '../ManualEditForm/ManualEditForm';
import GameInfoDetails from './GameInfoDetails';
import type { OsPlatform } from '../../../../shared/platforms';
import { fetchGameMetadata, refetchGameMetadata, retryThroughVpn } from '../../lib/dataFetcher.js';
import type { GenreNames } from '../../lib/genreNames.js';
import type { CreatorFilter } from '../../lib/filterManager.js';
import type { GameCollection } from '../../lib/collections.js';
import { t } from '../../lib/i18n.js';
import { isAdultBlurred } from '../../lib/adultContent.js';

export interface GameInfoPanelProps {
  gameId: string | null;
  gameData: any | undefined;
  /** Plateformes dont une version est dans le dossier du jeu (undefined : pas encore détectées). */
  platforms?: OsPlatform[];
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
  onCreatorClick: (filter: CreatorFilter) => void;
  onAfterRetryFetch: () => void;
  genreNames: GenreNames;
  /** Genres existants dans la bibliothèque (sélection dans l'édition manuelle). */
  allGenres: string[];
  /** PIA installé : bouton « Réessayer via le VPN » sur une fiche en échec. */
  vpnAvailable: boolean;
  collections: GameCollection[];
  onCreateCollection: (name: string) => string | null;
  /** Flou des images R18 (Paramètres › Affichage) et jeux déjà révélés dans la session. */
  blurAdultContent: boolean;
  revealedGames: Set<string>;
  onReveal: (gameId: string) => void;
}

/**
 * Page de détail d'un jeu, affichée par-dessus la grille (qui reste montée,
 * pour conserver sa position de défilement au retour) comme la page de jeu
 * de SteamOS. Bascule entre la vue détaillée, la vue d'échec de fetch (avec
 * retry/édition manuelle), et le formulaire d'édition manuelle, selon l'état
 * de la fiche sélectionnée.
 */
export default function GameInfoPanel({
  gameId,
  gameData,
  platforms,
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
  onCreatorClick,
  onAfterRetryFetch,
  genreNames,
  allGenres,
  collections,
  onCreateCollection,
  vpnAvailable,
  blurAdultContent,
  revealedGames,
  onReveal
}: GameInfoPanelProps) {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setIsEditing(false);
  }, [gameId]);

  if (!gameId) return null;

  const showDetails = gameData && !gameData.fetchFailed && !isEditing;

  return (
    // data-nav-scope : la manette ne navigue que dans cette page tant qu'elle
    // est ouverte (pas dans la grille cachée dessous).
    <div key={gameId} data-nav-scope className="animate-steam-in absolute inset-0 z-20 overflow-y-auto bg-bg">
      <button
        type="button"
        onClick={onClose}
        className="btn absolute left-6 top-4 z-30 rounded-full bg-black/55 pl-2.5 backdrop-blur-md"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
        {t('Bibliothèque')}
      </button>

      {showDetails ? (
        <GameInfoDetails
          gameId={gameId}
          gameData={gameData}
          platforms={platforms ?? []}
          carouselIndex={carouselIndex}
          onCarouselIndexChange={onCarouselIndexChange}
          getWorkImageSrc={getWorkImageSrc}
          getSampleImageSrc={getSampleImageSrc}
          onLaunch={onLaunch}
          isRunning={isRunning}
          isAnyGameRunning={isAnyGameRunning}
          onUpdateGame={onUpdateGame}
          onOpenFolder={onOpenFolder}
          onChooseExecutable={onChooseExecutable}
          onGenreClick={onGenreClick}
          onCreatorClick={onCreatorClick}
          onEdit={() => setIsEditing(true)}
          genreNames={genreNames}
          collections={collections}
          onCreateCollection={onCreateCollection}
          isBlurred={isAdultBlurred(gameData.age_category, blurAdultContent, revealedGames.has(gameId))}
          onReveal={onReveal}
        />
      ) : (
        <div className="mx-auto max-w-[760px] px-8 pb-10 pt-20">
          {!gameData ? (
            <p className="text-text-secondary">{t('Informations non disponibles pour {id}.', { id: gameId })}</p>
          ) : gameData.fetchFailed && !isEditing ? (
            <FetchFailedView
              gameId={gameId}
              error={gameData.error}
              onRetry={() => {
                onRemoveGame(gameId)
                  .then(() => fetchGameMetadata(gameId))
                  .then(onAfterRetryFetch);
                onClose();
              }}
              onRetryVpn={
                vpnAvailable
                  ? async () => {
                      await retryThroughVpn({ failedEntries: [gameId] });
                      onAfterRetryFetch();
                    }
                  : undefined
              }
              onManualEdit={() => setIsEditing(true)}
              onOpenFolder={() => onOpenFolder(gameId)}
            />
          ) : (
            <ManualEditForm
              gameId={gameId}
              gameData={gameData}
              getWorkImageSrc={getWorkImageSrc}
              getSampleImageSrc={getSampleImageSrc}
              allGenres={allGenres}
              onCancel={() => setIsEditing(false)}
              onSave={data => {
                onReplaceGame(gameId, data);
                setIsEditing(false);
              }}
              onRefetch={async () => {
                await refetchGameMetadata(gameId);
                setIsEditing(false);
                onAfterRetryFetch();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
