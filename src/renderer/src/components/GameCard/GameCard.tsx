import { useEffect, useRef } from 'react';
import { Clock, EyeOff, Play, TriangleAlert } from 'lucide-react';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import { formatPlayTime } from '../../lib/timeFormatter.js';
import { categoryMap } from '../../lib/metadataManager.js';

const AGE_LABELS: Record<string, string> = { R15: 'R15', R18: 'R18' };

export interface GameCardProps {
  gameId: string;
  gameData: any;
  imageSrc: string;
  isRunning: boolean;
  /** Jaquette ciblée par la navigation clavier (halo SteamOS). */
  isFocused: boolean;
  isBlurred: boolean;
  onOpenInfo: (gameId: string) => void;
  onReveal: (gameId: string) => void;
  /** Focus DOM reçu (souris, Tab, manette) : synchronise la jaquette ciblée. */
  onFocusGame: (gameId: string) => void;
}

/**
 * Jaquette de la grille, façon capsule SteamOS : l'image seule, le titre et
 * les infos n'apparaissent qu'au survol / focus dans un bandeau en dégradé.
 */
export default function GameCard({
  gameId,
  gameData,
  imageSrc,
  isRunning,
  isFocused,
  isBlurred,
  onOpenInfo,
  onReveal,
  onFocusGame
}: GameCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gameName = gameData.work_name || gameId;
  const playTimeText = formatPlayTime(gameData.totalPlayTime || 0);
  const categoryLabel = gameData.category ? categoryMap[gameData.category] || gameData.category : 'Inconnu';
  const ageLabel = AGE_LABELS[gameData.age_category || 'ALL_AGES'];

  // Ciblée au clavier : prend aussi le focus DOM, pour que manette, Tab et
  // clavier partent tous du même endroit.
  useEffect(() => {
    if (!isFocused || !rootRef.current) return;
    if (document.activeElement !== rootRef.current) rootRef.current.focus({ preventScroll: true });
    rootRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isFocused]);

  return (
    <div
      ref={rootRef}
      data-game-id={gameId}
      data-nav-default={isFocused || undefined}
      tabIndex={0}
      role="button"
      aria-label={gameName}
      onFocus={() => onFocusGame(gameId)}
      onClick={() => onOpenInfo(gameId)}
      className={`capsule aspect-[4/3] ${isFocused ? 'is-focused' : ''}`}
    >
      <img
        src={imageSrc}
        alt={gameName}
        loading="lazy"
        onError={e => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = PLACEHOLDER_IMAGE;
        }}
        className="h-full w-full object-cover"
      />

      {isBlurred && (
        <div
          data-reveal
          onClick={e => {
            e.stopPropagation();
            onReveal(gameId);
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-bg/60 p-2 text-center backdrop-blur-2xl"
        >
          <EyeOff size={20} strokeWidth={2} className="text-text-secondary" />
          <span className="text-xs font-bold tracking-wide">{ageLabel}</span>
          <span className="text-[11px] text-text-secondary">Cliquer pour révéler</span>
        </div>
      )}

      <div className="absolute left-2 top-2 flex gap-1">
        {gameData.fetchFailed && (
          <span className="flex items-center gap-1 rounded-sm bg-danger px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <TriangleAlert size={11} strokeWidth={2.5} />
            Échec sync
          </span>
        )}
        {isRunning && (
          <span className="flex items-center gap-1 rounded-sm bg-play px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <Play size={10} strokeWidth={0} fill="currentColor" />
            En cours
          </span>
        )}
      </div>

      <div className="capsule-caption pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pb-2.5 pt-10">
        <div className="line-clamp-2 text-[13px] font-bold leading-tight">{gameName}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-text-secondary">
          <span className="truncate">{gameData.circle || categoryLabel}</span>
          {ageLabel && <span className="rounded-sm bg-white/15 px-1 font-bold text-white">{ageLabel}</span>}
          {playTimeText && (
            <span className="ml-auto flex flex-shrink-0 items-center gap-1">
              <Clock size={11} strokeWidth={2.25} />
              {playTimeText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
