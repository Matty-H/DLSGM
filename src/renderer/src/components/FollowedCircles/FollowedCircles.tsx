import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, ExternalLink, Heart, RotateCw, X } from 'lucide-react';
import Select from '../Select/Select';
import { categoryLabel } from '../../lib/metadataManager.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { addToWishlist, describeAddResult } from '../../lib/wishlist.js';
import { dlsiteWorkUrl, splitFeed, type CircleWork, type FollowedCircle, type LibraryCircle } from '../../lib/followedCircles.js';
import { t, uiLocale } from '../../lib/i18n.js';

export interface FollowedCirclesProps {
  /** Cercles des jeux de la bibliothèque (proposés au suivi). */
  libraryCircles: LibraryCircle[];
  /** Jeux présents : jamais proposés comme nouveautés. */
  gameFolders: string[];
  /** IDs déjà dans la liste de souhaits. */
  wishlistIds: Set<string>;
  onWishlistChanged: () => void;
  followLibraryCircles: boolean;
  onFollowLibraryCirclesChange: (value: boolean) => void;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });

/**
 * Onglet Souhaits › Cercles suivis : annonces et sorties récentes des cercles
 * suivis (à la main, ou ceux de la bibliothèque), vérifiées une fois par
 * jour en tâche de fond, avec « Ajouter aux souhaits ».
 */
export default function FollowedCircles({ libraryCircles, gameFolders, wishlistIds, onWishlistChanged, followLibraryCircles, onFollowLibraryCirclesChange }: FollowedCirclesProps) {
  const [circles, setCircles] = useState<FollowedCircle[]>([]);
  const [feed, setFeed] = useState<CircleWork[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [picked, setPicked] = useState('');
  const [showCircles, setShowCircles] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const reload = useCallback(async () => {
    try {
      const state = await window.electronAPI.getFollowedCircles();
      setCircles(state.circles);
      setFeed(state.feed);
      setChecking(state.checking);
    } catch (error) {
      setMessage({ text: ipcErrorMessage(error), isError: true });
    }
  }, []);

  useEffect(() => {
    reload();
    return window.electronAPI.onFollowedCirclesChanged(next => {
      setProgress(next);
      setChecking(next !== null);
      if (next === null || next.done === next.total) reload();
    });
  }, [reload]);

  const inLibrary = useMemo(() => new Set(gameFolders), [gameFolders]);
  const { releases, announces } = useMemo(() => splitFeed(feed, inLibrary), [feed, inLibrary]);
  const followed = new Set(circles.map(c => c.makerId));
  const candidates = libraryCircles.filter(c => !followed.has(c.makerId));

  const run = async (action: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await action();
      await reload();
    } catch (error) {
      setMessage({ text: ipcErrorMessage(error), isError: true });
    }
  };

  const follow = (makerId: string) => {
    const circle = libraryCircles.find(c => c.makerId === makerId);
    if (circle) run(() => window.electronAPI.followCircle(circle.makerId, circle.site, circle.name)).then(() => setPicked(''));
  };

  const addWish = (work: CircleWork) =>
    run(async () => {
      setMessage({ text: describeAddResult(await addToWishlist(work.id)), isError: false });
      onWishlistChanged();
    });

  const workRow = (work: CircleWork) => (
    <li key={work.id} className="flex items-center gap-3 rounded-sm bg-bg-deep px-3 py-2 text-[13px]">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold" title={work.title}>{work.title}</span>
        <span className="block truncate text-[12px] text-text-secondary">
          {[work.circle, work.category ? categoryLabel(work.category) : null, work.kind === 'announce' ? work.expected : t('vu le {date}', { date: formatDate(work.firstSeen) })]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="font-mono text-[11px] text-text-muted">{work.id}</span>
      <button type="button" onClick={() => window.electronAPI.openExternal(dlsiteWorkUrl(work))} className="btn btn-ghost btn-icon" title={t('Voir sur DLsite')} aria-label={t('Voir {id} sur DLsite', { id: work.id })}>
        <ExternalLink size={16} strokeWidth={2.25} />
      </button>
      {wishlistIds.has(work.id) ? (
        <span className="w-[34px] text-center text-accent" title={t('Dans la liste de souhaits')}>
          <Heart size={16} strokeWidth={2.25} fill="currentColor" className="inline" />
        </span>
      ) : (
        <button type="button" onClick={() => addWish(work)} className="btn btn-ghost btn-icon" title={t('Ajouter aux souhaits')} aria-label={t('Ajouter aux souhaits')}>
          <Heart size={16} strokeWidth={2.25} />
        </button>
      )}
    </li>
  );

  return (
    <section className="mt-10">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <BellRing size={18} strokeWidth={2.25} className="text-accent" />
        <h2 className="m-0 text-[20px]">{t('Cercles suivis')}</h2>
        <button type="button" onClick={() => setShowCircles(v => !v)} className="btn btn-ghost py-1 text-[12px]">
          {circles.length > 1 ? t('{n} cercles', { n: circles.length }) : t('{n} cercle', { n: circles.length })}
        </button>
        <button type="button" onClick={() => run(() => window.electronAPI.checkFollowedCircles())} disabled={checking || circles.length === 0 && !followLibraryCircles} className="btn btn-ghost ml-auto py-1 text-[12px]">
          <RotateCw size={14} strokeWidth={2.25} className={checking ? 'animate-spin' : ''} />
          {progress ? t('Vérification {done}/{total}…', { done: progress.done, total: progress.total }) : t('Vérifier maintenant')}
        </button>
      </div>
      <p className="mb-3 mt-0 text-[13px] text-text-muted">
        {t('Annonces et nouvelles sorties des cercles suivis, lues sur leur page DLsite une fois par jour. Le catalogue existant au moment du suivi ne compte pas comme nouveauté.')}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" className="toggle" checked={followLibraryCircles} onChange={e => onFollowLibraryCirclesChange(e.target.checked)} />
          {t('Suivre automatiquement les cercles de ma bibliothèque')}
        </label>
        {candidates.length > 0 && (
          <div className="w-[320px] max-w-full">
          <Select
            value={picked}
            options={[{ value: '', label: t('Suivre un cercle de la bibliothèque…') }, ...candidates.map(c => ({ value: c.makerId, label: c.name }))]}
            onChange={follow}
            aria-label={t('Suivre un cercle de la bibliothèque')}
            className="w-full"
          />
          </div>
        )}
      </div>

      {showCircles && circles.length > 0 && (
        <ul className="m-0 mb-4 flex list-none flex-wrap gap-2 p-0">
          {circles.map(circle => (
            <li key={circle.makerId} className="flex items-center gap-1 rounded-full bg-bg-deep py-1 pl-3 pr-1 text-[12px]" title={circle.error ?? (circle.lastCheck ? t('Vérifié le {date}', { date: new Date(circle.lastCheck).toLocaleString(uiLocale()) }) : t('Pas encore vérifié'))}>
              <span className={circle.error ? 'text-danger' : ''}>{circle.name}</span>
              <button type="button" onClick={() => run(() => window.electronAPI.unfollowCircle(circle.makerId))} className="btn btn-ghost btn-icon h-6 w-6" aria-label={t('Ne plus suivre {name}', { name: circle.name })} title={t('Ne plus suivre')}>
                <X size={13} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className={`mb-3 mt-0 text-[13px] ${message.isError ? 'text-danger' : 'text-text-secondary'}`}>{message.text}</p>}

      {circles.length > 0 && releases.length === 0 && announces.length === 0 && (
        <p className="text-[13px] text-text-muted">{t('Rien de nouveau pour le moment.')}</p>
      )}
      {releases.length > 0 && (
        <>
          <div className="section-title mb-2">{t('Nouvelles sorties')}</div>
          <ul className="m-0 mb-5 flex list-none flex-col gap-1.5 p-0">{releases.map(workRow)}</ul>
        </>
      )}
      {announces.length > 0 && (
        <>
          <div className="section-title mb-2">{t('Annonces')}</div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{announces.map(workRow)}</ul>
        </>
      )}
    </section>
  );
}
