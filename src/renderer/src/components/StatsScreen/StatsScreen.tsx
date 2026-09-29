import { useMemo } from 'react';
import type { GameCache, GameCacheEntry } from '../../lib/cacheManager.js';
import { computeLibraryStats } from '../../lib/statsManager.js';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import type { GenreAliasGroups } from '../../lib/genreAliases.js';

export interface StatsScreenProps {
  cache: GameCache;
  getWorkImageSrc: (gameId: string) => string;
  genreAliasGroups: GenreAliasGroups;
  /** Ouvre la page du jeu dans la bibliothèque. */
  onOpenGame: (gameId: string) => void;
}

function StatTile({ kicker, value }: { kicker: string; value: string }) {
  return (
    <div className="panel flex flex-col justify-between gap-4 p-5">
      <div className="section-title">{kicker}</div>
      <div className="text-[40px] font-extrabold leading-none">{value}</div>
    </div>
  );
}

/**
 * Tuile jaquette cliquable (ouvre la page du jeu) : même ratio 4:3 que les
 * jaquettes de la grille, pour que la couverture ne soit jamais recadrée.
 */
function StatCoverTile({ kicker, title, imageSrc, onClick }: { kicker: string; title: string; imageSrc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title} className="capsule block aspect-[4/3] w-full text-left">
      <img
        src={imageSrc}
        alt={title}
        onError={e => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = PLACEHOLDER_IMAGE;
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute left-2 top-2 rounded-sm bg-black/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">
        {kicker}
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pb-2.5 pt-8">
        <span className="line-clamp-2 text-[14px] font-bold leading-tight">{title}</span>
      </span>
    </button>
  );
}

function BarRow({ label, count, width, labelWidthClass }: { label: string; count: number; width: string; labelWidthClass: string }) {
  return (
    <div className={`mb-2.5 grid items-center gap-3 ${labelWidthClass}`}>
      <span className="truncate text-[13px] text-text-secondary">{label}</span>
      <div className="relative h-2 overflow-hidden rounded-full bg-bg-deep">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent-hover" style={{ width }} />
      </div>
      <span className="text-right text-[13px] font-semibold tabular-nums">{count}</span>
    </div>
  );
}

export default function StatsScreen({ cache, getWorkImageSrc, genreAliasGroups, onOpenGame }: StatsScreenProps) {
  const stats = useMemo(() => computeLibraryStats(cache, genreAliasGroups), [cache, genreAliasGroups]);
  const totalHours = Math.round(stats.totalPlayTimeSeconds / 3600);

  const gameIdFor = (entry: GameCacheEntry | null) =>
    entry ? Object.keys(cache).find(id => cache[id] === entry) ?? null : null;
  const topGameId = gameIdFor(stats.topGame);
  const lastAddedId = gameIdFor(stats.lastAdded);

  return (
    <div data-scroll-root className="animate-steam-in min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
      <h1 className="mb-5">Ma collection</h1>

      <div className="mb-5 grid grid-cols-4 items-stretch gap-4">
        <StatTile kicker="Œuvres" value={String(stats.totalGames)} />
        <StatTile kicker="Temps de jeu cumulé" value={`${totalHours} h`} />
        {stats.topGame && topGameId ? (
          <StatCoverTile kicker="La plus jouée" title={stats.topGame.work_name} imageSrc={getWorkImageSrc(topGameId)} onClick={() => onOpenGame(topGameId)} />
        ) : (
          <StatTile kicker="La plus jouée" value="—" />
        )}
        {stats.lastAdded && lastAddedId ? (
          <StatCoverTile kicker="Dernier ajout" title={stats.lastAdded.work_name} imageSrc={getWorkImageSrc(lastAddedId)} onClick={() => onOpenGame(lastAddedId)} />
        ) : (
          <StatTile kicker="Dernier ajout" value="—" />
        )}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-4">
        <div className="panel p-5">
          <div className="section-title mb-4">Répartition par genre</div>
          {stats.genreBreakdown.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune donnée.</p>
          ) : (
            stats.genreBreakdown.map(row => (
              <BarRow key={row.label} {...row} labelWidthClass="grid-cols-[130px_1fr_32px]" />
            ))
          )}
        </div>

        <div className="panel p-5">
          <div className="section-title mb-4">Classification d'âge</div>
          {stats.ageBreakdown.map(row => (
            <BarRow key={row.label} {...row} labelWidthClass="grid-cols-[80px_1fr_32px]" />
          ))}

          <div className="section-title mb-2 mt-6">Par catégorie</div>
          {stats.categoryBreakdown.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune donnée.</p>
          ) : (
            stats.categoryBreakdown.map(row => (
              <div key={row.label} className="flex justify-between border-b border-divider py-2 text-[13px] last:border-0">
                <span className="text-text-secondary">{row.label}</span>
                <span className="font-semibold tabular-nums">{row.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
