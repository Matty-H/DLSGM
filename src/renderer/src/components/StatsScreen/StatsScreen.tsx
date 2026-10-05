import { useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import type { GameCache, GameCacheEntry } from '../../lib/cacheManager.js';
import { computeLibraryStats, computeWeeklyPlayTime, recentSessions } from '../../lib/statsManager.js';
import { formatSessionDuration } from '../../lib/timeFormatter.js';
import PlayTimeChart from './PlayTimeChart';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import type { GenreNames } from '../../lib/genreNames.js';
import { collectionBytes, formatBytes, summarizeDisks, type DiskUsageReport } from '../../lib/diskUsage.js';
import { t, uiLocale } from '../../lib/i18n.js';
import Trans from '../Trans/Trans';
import { isAdultBlurred } from '../../lib/adultContent.js';

export interface StatsScreenProps {
  cache: GameCache;
  getWorkImageSrc: (gameId: string) => string;
  genreNames: GenreNames;
  /** Ouvre la page du jeu dans la bibliothèque. */
  onOpenGame: (gameId: string) => void;
  /** Tailles sur le disque (null : pas encore reçues). */
  diskUsage: DiskUsageReport | null;
  onRecomputeSizes: () => void;
  /** Flou des jaquettes R18 (Paramètres › Affichage), sauf jeux révélés dans la session. */
  blurAdultContent: boolean;
  revealedGames: Set<string>;
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
function StatCoverTile({ kicker, title, imageSrc, blurred, onClick }: { kicker: string; title: string; imageSrc: string; blurred: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title} className="capsule block aspect-[4/3] w-full text-left">
      <img
        src={imageSrc}
        alt={title}
        onError={e => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = PLACEHOLDER_IMAGE;
        }}
        className={`absolute inset-0 h-full w-full object-cover ${blurred ? 'scale-110 blur-2xl' : ''}`}
      />
      {blurred && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-bg/40">
          <EyeOff size={20} strokeWidth={2} className="text-text-secondary" />
          <span className="text-xs font-bold tracking-wide">R18</span>
        </span>
      )}
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

export default function StatsScreen({ cache, getWorkImageSrc, genreNames, onOpenGame, diskUsage, onRecomputeSizes, blurAdultContent, revealedGames }: StatsScreenProps) {
  const blurredId = (gameId: string) => isAdultBlurred(cache[gameId]?.age_category, blurAdultContent, revealedGames.has(gameId));
  const stats = useMemo(() => computeLibraryStats(cache, genreNames), [cache, genreNames]);
  const totalHours = Math.round(stats.totalPlayTimeSeconds / 3600);
  const weeks = useMemo(() => computeWeeklyPlayTime(cache), [cache]);
  const sessions = useMemo(() => recentSessions(cache), [cache]);

  const gameIdFor = (entry: GameCacheEntry | null) =>
    entry ? Object.keys(cache).find(id => cache[id] === entry) ?? null : null;
  const topGameId = gameIdFor(stats.topGame);
  const lastAddedId = gameIdFor(stats.lastAdded);
  const disks = useMemo(() => (diskUsage ? summarizeDisks(diskUsage) : []), [diskUsage]);
  const measured = diskUsage ? Object.keys(diskUsage.games).length : 0;
  const nameOf = (gameId: string) => cache[gameId]?.work_name || gameId;

  return (
    <div data-scroll-root className="animate-steam-in min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
      <h1 className="mb-5">{t('Ma collection')}</h1>

      <div className="mb-5 grid grid-cols-5 items-stretch gap-4">
        <StatTile kicker={t('Œuvres')} value={String(stats.totalGames)} />
        <StatTile kicker={t('Temps de jeu cumulé')} value={t('{h} h', { h: totalHours })} />
        <StatTile kicker={t('Taille de la collection')} value={diskUsage && measured > 0 ? formatBytes(collectionBytes(diskUsage)) : '…'} />
        {stats.topGame && topGameId ? (
          <StatCoverTile kicker={t('La plus jouée')} title={stats.topGame.work_name} imageSrc={getWorkImageSrc(topGameId)} blurred={blurredId(topGameId)} onClick={() => onOpenGame(topGameId)} />
        ) : (
          <StatTile kicker={t('La plus jouée')} value="—" />
        )}
        {stats.lastAdded && lastAddedId ? (
          <StatCoverTile kicker={t('Dernier ajout')} title={stats.lastAdded.work_name} imageSrc={getWorkImageSrc(lastAddedId)} blurred={blurredId(lastAddedId)} onClick={() => onOpenGame(lastAddedId)} />
        ) : (
          <StatTile kicker={t('Dernier ajout')} value="—" />
        )}
      </div>

      <div className="mb-4 grid grid-cols-[1.4fr_1fr] items-stretch gap-4">
        <div className="panel p-5">
          <div className="section-title mb-4">{t('Temps de jeu par semaine')}</div>
          {sessions.length === 0 ? (
            <p className="text-sm text-text-muted">{t("L'historique des sessions commence à la prochaine partie lancée depuis DLSGM.")}</p>
          ) : (
            <PlayTimeChart weeks={weeks} />
          )}
        </div>

        <div className="panel p-5">
          <div className="section-title mb-3">{t('Dernières sessions')}</div>
          {sessions.length === 0 ? (
            <p className="text-sm text-text-muted">{t('Aucune session enregistrée.')}</p>
          ) : (
            sessions.map(session => (
              <button
                key={`${session.gameId}-${session.start}`}
                type="button"
                onClick={() => onOpenGame(session.gameId)}
                className="flex w-full items-baseline gap-3 border-b border-divider py-2 text-left text-[13px] last:border-0 hover:text-accent"
              >
                <span className="min-w-0 flex-1 truncate">{session.name}</span>
                <span className="flex-shrink-0 text-text-muted">
                  {new Date(session.start).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' })}
                </span>
                <span className="w-[56px] flex-shrink-0 text-right font-semibold tabular-nums">{formatSessionDuration(session.duration)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="panel mb-4 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="section-title flex-1">{t('Place sur le disque')}</div>
          {diskUsage && diskUsage.pending > 0 && (
            <span className="text-[12px] text-text-muted">
              {t('Calcul en cours… ({done}/{total})', { done: measured, total: measured + diskUsage.pending })}
            </span>
          )}
          <button type="button" onClick={onRecomputeSizes} className="btn btn-ghost py-1 text-[12px]" title={t('Remesurer tous les jeux')}>
            {t('Recalculer')}
          </button>
        </div>
        {disks.length === 0 ? (
          <p className="text-sm text-text-muted">{diskUsage ? t('Mesure des dossiers en cours…') : t('Chargement…')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {disks.map(disk => {
              const used = disk.totalBytes !== null && disk.freeBytes !== null ? disk.totalBytes - disk.freeBytes : null;
              return (
                <div key={disk.root}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-bold">{t('Disque {name}', { name: disk.root.replace(/[\\/]$/, '') })}</span>
                    <span className="text-text-secondary">
                      <Trans text={t('Jeux : {size} ({count})')} values={{ size: <span className="font-semibold text-text">{formatBytes(disk.gamesBytes)}</span>, count: disk.games }} />
                      {disk.freeBytes !== null && <> · {t('libre : {size}', { size: formatBytes(disk.freeBytes) })}</>}
                    </span>
                  </div>
                  {disk.totalBytes !== null && used !== null && (
                    <div className="relative mb-3 h-2 overflow-hidden rounded-full bg-bg-deep" title={t('{used} utilisés sur {total}', { used: formatBytes(used), total: formatBytes(disk.totalBytes) })}>
                      <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${(used / disk.totalBytes) * 100}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-accent-hover" style={{ width: `${(disk.gamesBytes / disk.totalBytes) * 100}%` }} />
                    </div>
                  )}
                  {disk.biggest.map(game => (
                    <button
                      key={game.gameId}
                      type="button"
                      onClick={() => onOpenGame(game.gameId)}
                      className="flex w-full items-baseline gap-3 border-b border-divider py-1.5 text-left text-[13px] last:border-0 hover:text-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">{nameOf(game.gameId)}</span>
                      <span className="flex-shrink-0 font-semibold tabular-nums">{formatBytes(game.bytes)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-4">
        <div className="panel p-5">
          <div className="section-title mb-4">{t('Répartition par genre')}</div>

          {stats.genreBreakdown.length === 0 ? (
            <p className="text-sm text-text-muted">{t('Aucune donnée.')}</p>
          ) : (
            stats.genreBreakdown.map(row => (
              <BarRow key={row.label} {...row} labelWidthClass="grid-cols-[130px_1fr_32px]" />
            ))
          )}
        </div>

        <div className="panel p-5">
          <div className="section-title mb-4">{t("Classification d'âge")}</div>
          {stats.ageBreakdown.map(row => (
            <BarRow key={row.label} {...row} labelWidthClass="grid-cols-[80px_1fr_32px]" />
          ))}

          <div className="section-title mb-2 mt-6">{t('Par catégorie')}</div>
          {stats.categoryBreakdown.length === 0 ? (
            <p className="text-sm text-text-muted">{t('Aucune donnée.')}</p>
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
