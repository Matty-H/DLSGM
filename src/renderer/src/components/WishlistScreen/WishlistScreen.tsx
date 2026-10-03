import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, EyeOff, Plus, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import { PLACEHOLDER_IMAGE } from '../../lib/constants.js';
import { categoryLabel } from '../../lib/metadataManager.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import {
  addToWishlist,
  describeAddResult,
  getWishlist,
  refreshWishlistItem,
  removeFromWishlist,
  wishlistCoverSrc,
  type WishlistItem
} from '../../lib/wishlist.js';
import { t, uiLocale } from '../../lib/i18n.js';
import { isAdultBlurred } from '../../lib/adultContent.js';

export interface WishlistScreenProps {
  /** Dossiers de jeux présents : quand ils changent, la liste est relue (jeux arrivés retirés). */
  gameFolders: string[];
  blurAdultContent: boolean;
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/**
 * Liste de souhaits : IDs DLsite (ou liens) saisis à la main, affichés avec
 * leur couverture et leur fiche. Un jeu en sort à la main, ou tout seul dès
 * que son dossier apparaît dans la bibliothèque.
 */
export default function WishlistScreen({ gameFolders, blurAdultContent }: WishlistScreenProps) {
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    try {
      setItems(await getWishlist());
    } catch (error) {
      setMessage({ text: ipcErrorMessage(error), isError: true });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, gameFolders]);

  const handleAdd = async () => {
    if (!input.trim() || adding) return;
    setAdding(true);
    setMessage(null);
    try {
      const result = await addToWishlist(input);
      setMessage({ text: describeAddResult(result), isError: result.added.length === 0 });
      if (result.added.length > 0) setInput('');
      await reload();
    } catch (error) {
      setMessage({ text: ipcErrorMessage(error), isError: true });
    } finally {
      setAdding(false);
    }
  };

  const runOnItem = async (gameId: string, action: () => Promise<unknown>) => {
    setBusyId(gameId);
    try {
      await action();
      await reload();
    } catch (error) {
      setMessage({ text: ipcErrorMessage(error), isError: true });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div data-scroll-root className="animate-steam-in min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
      <h1 className="mb-1">{t('Liste de souhaits')}</h1>
      <p className="mb-4 mt-0 text-[13px] text-text-muted">
        {t("Les jeux sortent de la liste tout seuls dès qu'ils arrivent dans la bibliothèque.")}
      </p>

      <div className="mb-2 flex max-w-[760px] gap-2">
        <input
          className="input flex-1"
          placeholder={t('ID ou lien DLsite (plusieurs possibles : RJ01234567, RJ01234568…)')}
          aria-label={t('IDs ou liens DLsite à ajouter')}
          spellCheck={false}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button type="button" onClick={handleAdd} disabled={adding || !input.trim()} className="btn btn-primary">
          <Plus size={16} strokeWidth={2.5} />
          {adding ? t('Ajout…') : t('Ajouter')}
        </button>
      </div>
      {message && <p className={`mb-4 mt-0 text-[13px] ${message.isError ? 'text-danger' : 'text-text-secondary'}`}>{message.text}</p>}

      {items && items.length === 0 && <p className="mt-8 text-text-muted">{t('La liste est vide.')}</p>}

      <div className="mt-4 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {items?.map(item => {
          const blurred = isAdultBlurred(item.age_category, blurAdultContent, revealed.has(item.id));
          const release = formatDate(item.release_date);
          const upcoming = item.release_date !== null && new Date(item.release_date) > new Date();
          return (
            <div key={item.id} className="panel flex flex-col overflow-hidden">
              <div className="relative aspect-[4/3] bg-bg-deep">
                <img
                  src={item.hasCover ? wishlistCoverSrc(item.id) : PLACEHOLDER_IMAGE}
                  alt={item.work_name ?? item.id}
                  loading="lazy"
                  onError={e => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = PLACEHOLDER_IMAGE;
                  }}
                  className="h-full w-full object-cover"
                />
                {blurred && (
                  <button
                    type="button"
                    onClick={() => setRevealed(prev => new Set(prev).add(item.id))}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-bg/60 backdrop-blur-2xl"
                  >
                    <EyeOff size={20} strokeWidth={2} className="text-text-secondary" />
                    <span className="text-xs font-bold">R18</span>
                    <span className="text-[11px] text-text-secondary">{t('Cliquer pour révéler')}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="line-clamp-2 text-[14px] font-bold leading-tight" title={item.work_name ?? undefined}>
                  {item.work_name ?? item.id}
                </div>
                <div className="truncate text-[12px] text-text-secondary">
                  {[item.circle, item.category ? categoryLabel(item.category) : null].filter(Boolean).join(' · ') || item.id}
                </div>
                {release && (
                  <div className={`text-[12px] ${upcoming ? 'font-semibold text-accent' : 'text-text-muted'}`}>
                    {upcoming ? t('Sortie le {date}', { date: release }) : t('Sorti le {date}', { date: release })}
                  </div>
                )}
                {item.error && (
                  <div className="flex items-start gap-1 text-[12px] text-danger" title={item.error}>
                    <TriangleAlert size={13} strokeWidth={2.25} className="mt-px flex-shrink-0" />
                    <span className="line-clamp-2">{t('Fiche introuvable (restriction régionale ?) : {error}', { error: item.error })}</span>
                  </div>
                )}
                <div className="mt-auto flex items-center gap-1 pt-2">
                  <span className="mr-auto font-mono text-[11px] text-text-muted">{item.id}</span>
                  <button
                    type="button"
                    onClick={() => window.electronAPI.openExternal(`https://www.dlsite.com/maniax/work/=/product_id/${item.id}.html`)}
                    className="btn btn-ghost btn-icon"
                    title={t('Voir sur DLsite')}
                    aria-label={t('Voir {id} sur DLsite', { id: item.id })}
                  >
                    <ExternalLink size={16} strokeWidth={2.25} />
                  </button>
                  {item.error && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => runOnItem(item.id, () => refreshWishlistItem(item.id))}
                      className="btn btn-ghost btn-icon"
                      title={t('Réessayer')}
                      aria-label={t('Réessayer {id}', { id: item.id })}
                    >
                      <RotateCw size={16} strokeWidth={2.25} className={busyId === item.id ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => runOnItem(item.id, () => removeFromWishlist(item.id))}
                    className="btn btn-ghost btn-icon"
                    title={t('Retirer de la liste')}
                    aria-label={t('Retirer {id} de la liste', { id: item.id })}
                  >
                    <Trash2 size={16} strokeWidth={2.25} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
