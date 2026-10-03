import { CircleCheck, EyeOff, Search, SlidersHorizontal, X } from 'lucide-react';
import SortSelect from '../SortSelect/SortSelect';
import Select from '../Select/Select';
import { CREATOR_FIELD_LABELS, type CreatorFilter } from '../../lib/filterManager.js';
import { t, tr } from '../../lib/i18n.js';

export interface LibraryToolbarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  selectedCategoryCode: string;
  onCategoryChange: (value: string) => void;
  categories: { code: string; name: string }[];
  selectedSort: string;
  onSortChange: (value: string) => void;
  showAdvancedFilters: boolean;
  onToggleAdvancedFilters: () => void;
  /** Nombre d'œuvres affichées après filtrage. */
  resultCount: number;
  collectionFilter: string;
  collectionOptions: { value: string; label: string }[];
  onCollectionFilterChange: (value: string) => void;
  /** Filtre "même cercle / auteur..." posé depuis la page d'un jeu. */
  creatorFilter: CreatorFilter | null;
  onClearCreatorFilter: () => void;
  /** Masquer les jeux marqués finis (paramètre enregistré). */
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
}

/**
 * Barre de la bibliothèque façon SteamOS : les catégories sont des onglets
 * pilules (comme les collections du Deck), la recherche et le tri à droite.
 */
export default function LibraryToolbar({
  searchTerm,
  onSearchTermChange,
  selectedCategoryCode,
  onCategoryChange,
  categories,
  selectedSort,
  onSortChange,
  showAdvancedFilters,
  onToggleAdvancedFilters,
  resultCount,
  collectionFilter,
  collectionOptions,
  onCollectionFilterChange,
  creatorFilter,
  onClearCreatorFilter,
  hideCompleted,
  onHideCompletedChange
}: LibraryToolbarProps) {
  const tabs = [{ code: 'all', name: t('Tout') }, ...categories];

  return (
    <div className="flex flex-shrink-0 flex-col gap-3 px-6 pb-3 pt-2">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {tabs.map(({ code, name }) => (
          <button
            key={code}
            type="button"
            onClick={() => onCategoryChange(code)}
            className={`pill-tab ${selectedCategoryCode === code ? 'is-active' : ''}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1 basis-[280px] max-w-[420px]">
          <Search size={16} strokeWidth={2.25} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            data-search-input
            className="input pl-9 pr-8"
            placeholder={t('Rechercher un titre, un cercle…')}
            value={searchTerm}
            onChange={e => onSearchTermChange(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchTermChange('')}
              aria-label={t('Effacer la recherche')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
            >
              <X size={15} strokeWidth={2.25} />
            </button>
          )}
        </div>

        <Select
          value={collectionFilter}
          options={collectionOptions}
          onChange={onCollectionFilterChange}
          aria-label={t('Collection')}
          className="w-[210px]"
        />

        <SortSelect value={selectedSort} onChange={onSortChange} />

        <button
          type="button"
          onClick={onToggleAdvancedFilters}
          className={`btn ${showAdvancedFilters ? 'btn-primary' : ''}`}
        >
          <SlidersHorizontal size={15} strokeWidth={2.25} />
          {t('Filtres')}
        </button>

        {/* Bouton bascule, comme « Filtres » : actif = jeux finis masqués. */}
        <button
          type="button"
          onClick={() => onHideCompletedChange(!hideCompleted)}
          aria-pressed={hideCompleted}
          title={hideCompleted ? t('Les jeux finis sont masqués — cliquer pour les afficher') : t('Masquer les jeux marqués finis')}
          className={`btn ${hideCompleted ? 'btn-primary' : ''}`}
        >
          {hideCompleted ? <EyeOff size={15} strokeWidth={2.25} /> : <CircleCheck size={15} strokeWidth={2.25} />}
          {hideCompleted ? t('Finis masqués') : t('Masquer les finis')}
        </button>

        {creatorFilter && (
          <span className="tag tag-accent pr-1.5 text-[13px]">
            {t('{field} : {value}', { field: tr(CREATOR_FIELD_LABELS[creatorFilter.field]), value: creatorFilter.value })}
            <button
              type="button"
              onClick={onClearCreatorFilter}
              aria-label={t('Retirer le filtre {value}', { value: creatorFilter.value })}
              className="rounded-sm p-0.5 hover:bg-white/10"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </span>
        )}

        <span className="section-title ml-auto">

          {resultCount > 1 ? t('{n} œuvres', { n: resultCount }) : t('{n} œuvre', { n: resultCount })}
        </span>
      </div>
    </div>
  );
}
