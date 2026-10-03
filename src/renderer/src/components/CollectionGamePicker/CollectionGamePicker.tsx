import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, Sparkles, X } from 'lucide-react';
import type { GameListItem } from '../../lib/filterManager.js';
import { t } from '../../lib/i18n.js';

export interface CollectionGamePickerProps {
  collectionName: string;
  games: GameListItem[];
  /** Jeux ajoutés à la main. */
  selectedIds: Set<string>;
  /** Jeux présents par les règles seulement (non décochables ici). */
  ruleIds: Set<string>;
  onToggle: (gameId: string) => void;
  getWorkImageSrc: (gameId: string) => string;
  onClose: () => void;
}

/** Comparaison insensible à la casse et aux accents. */
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Choix des jeux d'une collection : liste cherchable de la bibliothèque, un
 * clic ajoute / retire (écrit tout de suite dans la fiche). Fenêtre marquée
 * `data-nav-scope`/`data-nav-popup` : la manette y reste et B la ferme.
 */
export default function CollectionGamePicker({
  collectionName,
  games,
  selectedIds,
  ruleIds,
  onToggle,
  getWorkImageSrc,
  onClose
}: CollectionGamePickerProps) {
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return games
      .filter(({ id, data }) => {
        if (onlySelected && !selectedIds.has(id) && !ruleIds.has(id)) return false;
        if (!q) return true;
        const texts = [id, data.work_name, data.work_name_en, data.circle, data.circle_en];
        return texts.some(t => typeof t === 'string' && normalize(t).includes(q));
      })
      .sort((a, b) => (a.data.work_name || a.id).localeCompare(b.data.work_name || b.id));
  }, [games, query, onlySelected, selectedIds, ruleIds]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Jeux de la collection {name}', { name: collectionName })}
        data-nav-scope
        data-nav-popup
        onKeyDown={onKeyDown}
        onClick={e => e.stopPropagation()}
        className="panel flex max-h-full w-[640px] max-w-full flex-col p-5"
      >
        <div className="mb-3 flex items-center gap-3">
          <h2 className="m-0 flex-1 truncate text-[18px] font-bold">{collectionName}</h2>
          <span className="section-title">{t('{n} jeux', { n: selectedIds.size + ruleIds.size })}</span>
          <button type="button" onClick={onClose} aria-label={t('Fermer')} className="btn btn-ghost btn-icon">
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('Titre, cercle ou ID…')}
              aria-label={t('Chercher un jeu')}
              className="input w-full pl-9"
            />
          </div>
          <button
            type="button"
            aria-pressed={onlySelected}
            onClick={() => setOnlySelected(v => !v)}
            className={`tag ${onlySelected ? 'tag-accent' : ''}`}
          >
            {t('Dans la collection')}
          </button>
        </div>

        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
          {visible.map(({ id, data }) => {
            const byRules = ruleIds.has(id) && !selectedIds.has(id);
            const checked = selectedIds.has(id) || byRules;
            return (
              <li key={id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={byRules}
                  title={byRules ? t('Ajouté par les règles de la collection') : undefined}
                  onClick={() => onToggle(id)}
                  className="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-white/10 focus-visible:bg-focus focus-visible:text-on-focus disabled:opacity-70"
                >
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border ${
                      checked ? 'border-accent bg-accent text-white' : 'border-divider'
                    }`}
                  >
                    {byRules ? <Sparkles size={12} strokeWidth={2.5} /> : checked && <Check size={13} strokeWidth={3} />}
                  </span>
                  <img
                    src={getWorkImageSrc(id)}
                    alt=""
                    loading="lazy"
                    className={`h-9 w-12 flex-shrink-0 rounded-sm object-cover ${data.age_category === 'R18' ? 'blur-sm' : ''}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{data.work_name || id}</span>
                    <span className="block truncate text-[12px] text-text-muted">
                      {id}
                      {typeof data.circle === 'string' && data.circle ? ` · ${data.circle}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-2 py-4 text-[13px] text-text-muted">{t('Aucun jeu ne correspond.')}</li>}
        </ul>
      </div>
    </div>,
    document.body
  );
}
