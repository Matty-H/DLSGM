import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import { formatPlayTime } from '../../lib/timeFormatter.js';
import CategoryBadge from '../CategoryBadge/CategoryBadge';

export interface GameCardProps {
  gameId: string;
  gameData: any;
  imageSrc: string;
  isRunning: boolean;
  isAnyGameRunning: boolean;
  isSelected: boolean;
  onOpenInfo: (gameId: string) => void;
  onLaunch: (gameId: string) => void;
}

export default function GameCard({
  gameId,
  gameData,
  imageSrc,
  isRunning,
  isAnyGameRunning,
  isSelected,
  onOpenInfo,
  onLaunch
}: GameCardProps) {
  const gameName = gameData.work_name || gameId;
  const totalPlayTime = gameData.totalPlayTime || 0;
  const rating = gameData.rating || 0;
  const playTimeText = formatPlayTime(totalPlayTime);
  const playDisabled = isAnyGameRunning && !isRunning;

  return (
    <div
      data-game-id={gameId}
      className={`group flex flex-col overflow-hidden rounded-app border-2 bg-surface backdrop-blur-app transition-all duration-300 hover:-translate-y-2 hover:border-white/20 hover:shadow-2xl ${
        isSelected ? 'border-primary shadow-[0_0_15px_rgba(61,90,254,0.4)]' : 'border-transparent'
      }`}
    >
      <div className="relative aspect-video overflow-hidden">
        {gameData.fetchFailed && (
          <div className="absolute left-2.5 top-2.5 z-10 rounded bg-accent/90 px-2 py-1 text-xs font-bold text-white">
            ⚠️ Erreur
          </div>
        )}
        <img
          src={imageSrc}
          alt={gameName}
          onClick={() => onOpenInfo(gameId)}
          onError={e => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = PLACEHOLDER_IMAGE;
          }}
          className="h-full w-full cursor-pointer object-cover"
        />
        <div className="absolute bottom-3 right-3 z-20 flex h-12 w-12 items-center justify-center">
          <button
            onClick={() => onLaunch(gameId)}
            disabled={playDisabled}
            className={`flex h-full w-full scale-75 items-center justify-center rounded-xl text-2xl opacity-0 shadow-lg transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 ${
              playDisabled ? 'cursor-not-allowed bg-neutral-600' : 'bg-success hover:bg-success-hover'
            }`}
          >
            {isRunning ? '⏳' : '▶'}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-4 pt-2.5">
        <CategoryBadge category={gameData.category} />
        {totalPlayTime > 0 ? (
          <div className="flex flex-1 items-center justify-center gap-1 text-xs text-text-secondary">⏳ {playTimeText}</div>
        ) : (
          <div />
        )}
        {rating > 0 ? <div className="text-right text-sm font-bold text-yellow-400">{rating}★</div> : <div />}
      </div>
    </div>
  );
}
