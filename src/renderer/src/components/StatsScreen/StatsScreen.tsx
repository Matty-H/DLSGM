import { useMemo } from 'react';
import type { GameCache, GameCacheEntry } from '../../lib/cacheManager.js';
import { computeLibraryStats } from '../../lib/statsManager.js';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import type { GenreAliasGroups } from '../../lib/genreAliases.js';

export interface StatsScreenProps {
  cache: GameCache;
  getWorkImageSrc: (gameId: string) => string;
  genreAliasGroups: GenreAliasGroups;
}

function TileFrame({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div className="card blueprint">
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <div className="card-kicker">{kicker}</div>
      {children}
    </div>
  );
}

function StatTile({ kicker, value }: { kicker: string; value: string }) {
  return (
    <TileFrame kicker={kicker}>
      <div className="flex flex-1 items-center">
        <div className="card-title text-[26px]">{value}</div>
      </div>
    </TileFrame>
  );
}

function StatCoverTile({ kicker, gameId, title, imageSrc }: { kicker: string; gameId: string; title: string; imageSrc: string }) {
  return (
    <TileFrame kicker={kicker}>
      <div className="cover-frame aspect-[16/10] overflow-hidden" title={title}>
        <img
          src={imageSrc}
          alt={title}
          onError={e => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = PLACEHOLDER_IMAGE;
          }}
          className="h-full w-full object-cover"
        />
      </div>
    </TileFrame>
  );
}

function BarRow({ label, count, width, labelWidthClass }: { label: string; count: number; width: string; labelWidthClass: string }) {
  return (
    <div className={`mb-2 grid items-center gap-3 ${labelWidthClass}`}>
      <span className="text-[13px]">{label}</span>
      <div className="relative h-2 bg-neutral-200">
        <div className="absolute inset-y-0 left-0 bg-accent-500" style={{ width }} />
      </div>
      <span className="text-right text-xs opacity-60">{count}</span>
    </div>
  );
}

export default function StatsScreen({ cache, getWorkImageSrc, genreAliasGroups }: StatsScreenProps) {
  const stats = useMemo(() => computeLibraryStats(cache, genreAliasGroups), [cache, genreAliasGroups]);
  const totalHours = Math.round(stats.totalPlayTimeSeconds / 3600);

  const gameIdFor = (entry: GameCacheEntry | null) =>
    entry ? Object.keys(cache).find(id => cache[id] === entry) ?? null : null;
  const topGameId = gameIdFor(stats.topGame);
  const lastAddedId = gameIdFor(stats.lastAdded);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-1 text-[11px] uppercase tracking-widest text-text-secondary opacity-55">Statistiques</div>
      <h1 className="mb-5">Vue d'ensemble de la collection</h1>

      <div className="mb-6 grid grid-cols-4 gap-[var(--space-4)]">
        <StatTile kicker="Œuvres" value={String(stats.totalGames)} />
        <StatTile kicker="Temps de jeu cumulé" value={`${totalHours} h`} />
        {stats.topGame && topGameId ? (
          <StatCoverTile kicker="La plus jouée" gameId={topGameId} title={stats.topGame.work_name} imageSrc={getWorkImageSrc(topGameId)} />
        ) : (
          <StatTile kicker="La plus jouée" value="—" />
        )}
        {stats.lastAdded && lastAddedId ? (
          <StatCoverTile kicker="Dernier ajout" gameId={lastAddedId} title={stats.lastAdded.work_name} imageSrc={getWorkImageSrc(lastAddedId)} />
        ) : (
          <StatTile kicker="Dernier ajout" value="—" />
        )}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-[var(--space-4)]">
        <div className="card blueprint p-5">
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          <div className="card-kicker mb-4">Répartition par genre</div>
          {stats.genreBreakdown.length === 0 ? (
            <p className="text-sm text-text-secondary">Aucune donnée.</p>
          ) : (
            stats.genreBreakdown.map(row => (
              <BarRow key={row.label} {...row} labelWidthClass="grid-cols-[130px_1fr_32px]" />
            ))
          )}
        </div>

        <div className="card blueprint p-5">
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          <div className="card-kicker mb-4">Classification d'âge</div>
          {stats.ageBreakdown.map(row => (
            <BarRow key={row.label} {...row} labelWidthClass="grid-cols-[80px_1fr_32px]" />
          ))}

          <div className="card-kicker mb-3 mt-5">Par catégorie</div>
          {stats.categoryBreakdown.length === 0 ? (
            <p className="text-sm text-text-secondary">Aucune donnée.</p>
          ) : (
            stats.categoryBreakdown.map(row => (
              <div key={row.label} className="flex justify-between border-b border-divider py-1 text-[13px]">
                <span>{row.label}</span>
                <span className="opacity-60">{row.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
