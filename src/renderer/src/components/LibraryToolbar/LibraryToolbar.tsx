import { ChevronDown, X } from 'lucide-react';
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
}

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
  onResetFilters
}: LibraryToolbarProps) {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-divider px-6 py-4">
      <div className="field relative m-0 min-w-[260px]">
        <input
          className="input pr-8"
          placeholder="Rechercher un titre, un cercle…"
          value={searchTerm}
          onChange={e => onSearchTermChange(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchTermChange('')}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-accent"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <select value={selectedCategoryCode} onChange={e => onCategoryChange(e.target.value)} className="input w-auto cursor-pointer">
        <option value="all">Toutes catégories</option>
        {categories.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>

      <SortSelect value={selectedSort} onChange={onSortChange} />

      <button type="button" onClick={onToggleAdvancedFilters} className={`btn btn-secondary ${showAdvancedFilters ? 'border-accent text-accent-700' : ''}`}>
        Filtres avancés
        <ChevronDown size={14} strokeWidth={1.5} className={`transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
      </button>

      <button type="button" onClick={onResetFilters} className="btn btn-ghost ml-auto">
        Réinitialiser
      </button>
    </div>
  );
}
