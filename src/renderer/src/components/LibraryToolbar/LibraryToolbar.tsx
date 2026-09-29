import { Search, SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import SortSelect from '../SortSelect/SortSelect';

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
  onResetFilters: () => void;
  /** Nombre d'œuvres affichées après filtrage. */
  resultCount: number;
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
  onResetFilters,
  resultCount
}: LibraryToolbarProps) {
  const tabs = [{ code: 'all', name: 'Tout' }, ...categories];

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
            placeholder="Rechercher un titre, un cercle…"
            value={searchTerm}
            onChange={e => onSearchTermChange(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchTermChange('')}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
            >
              <X size={15} strokeWidth={2.25} />
            </button>
          )}
        </div>

        <SortSelect value={selectedSort} onChange={onSortChange} />

        <button
          type="button"
          onClick={onToggleAdvancedFilters}
          className={`btn ${showAdvancedFilters ? 'btn-primary' : ''}`}
        >
          <SlidersHorizontal size={15} strokeWidth={2.25} />
          Filtres
        </button>

        <button type="button" onClick={onResetFilters} className="btn btn-ghost" title="Réinitialiser les filtres et rescanner">
          <RotateCcw size={15} strokeWidth={2.25} />
          Réinitialiser
        </button>

        <span className="section-title ml-auto">
          {resultCount} œuvre{resultCount > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
