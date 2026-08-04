import { Clock } from 'lucide-react';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import { formatPlayTime } from '../../lib/timeFormatter.js';
import { categoryMap } from '../../lib/metadataManager.js';

const AGE_LABELS: Record<string, string> = { R15: 'R15', R18: 'R18' };

export interface GameCardProps {
  gameId: string;
  gameData: any;
  imageSrc: string;
  isRunning: boolean;
  isSelected: boolean;
  isBlurred: boolean;
  onOpenInfo: (gameId: string) => void;
  onReveal: (gameId: string) => void;
}

export default function GameCard({
  gameId,
  gameData,
  imageSrc,
  isRunning,
  isSelected,
  isBlurred,
  onOpenInfo,
  onReveal
}: GameCardProps) {
  const gameName = gameData.work_name || gameId;
  const totalPlayTime = gameData.totalPlayTime || 0;
  const rating = gameData.rating || 0;
  const playTimeText = formatPlayTime(totalPlayTime);
  const categoryLabel = gameData.category ? categoryMap[gameData.category] || gameData.category : 'Inconnu';
  const ageCategory: string = gameData.age_category || 'ALL_AGES';
  const ageLabel = AGE_LABELS[ageCategory];

  return (
    <div
      data-game-id={gameId}
      onClick={() => onOpenInfo(gameId)}
      className="card blueprint elev-sm relative cursor-pointer pb-3"
      style={isSelected ? { borderColor: 'var(--color-accent-600)' } : undefined}
    >
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />

      {gameData.fetchFailed && (
        <span className="tag tag-outline absolute -top-2 left-3 z-10 bg-bg">Échec sync</span>
      )}
      {isRunning && !gameData.fetchFailed && (
        <span className="tag tag-outline absolute -top-2 left-3 z-10 bg-bg">En cours</span>
      )}

      <div className="cover-frame relative aspect-[16/10] overflow-hidden">
        <img
          src={imageSrc}
          alt={gameName}
          onError={e => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = PLACEHOLDER_IMAGE;
          }}
          className="h-full w-full object-cover"
        />
        {isBlurred && (
          <div
            onClick={e => {
              e.stopPropagation();
              onReveal(gameId);
            }}
            className="absolute inset-0 flex items-center justify-center p-2 text-center backdrop-blur-2xl"
            style={{ background: 'color-mix(in oklab, var(--color-neutral-100) 70%, transparent)' }}
          >
            <span className="text-xs leading-snug text-white">
              {ageLabel}
              <br />
              Cliquer pour révéler
            </span>
          </div>
        )}
      </div>

      <div className="card-kicker mt-3">{gameData.circle || gameData.author || ''}</div>
      <div className="card-title text-base">{gameName}</div>

      <div className="my-2 flex flex-wrap gap-1">
        <span className="tag tag-neutral text-[10px]">{categoryLabel}</span>
        {ageLabel && <span className="tag tag-outline text-[10px]">{ageLabel}</span>}
      </div>

      <div className="card-meta">
        <Clock size={12} strokeWidth={1.5} />
        <span>{playTimeText}</span>
        {rating > 0 && <span className="ml-auto text-accent-700">{'★'.repeat(rating)}</span>}
      </div>
    </div>
  );
}
