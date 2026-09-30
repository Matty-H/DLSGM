import { Search, SlidersHorizontal, RotateCcw, X, PackagePlus } from 'lucide-react';
import SortSelect from '../SortSelect/SortSelect';
import Select from '../Select/Select';
import { CREATOR_FIELD_LABELS, type CreatorFilter } from '../../lib/filterManager.js';

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
  collectionFilter: string;
  collectionOptions: { value: string; label: string }[];
  onCollectionFilterChange: (value: string) => void;
  /** Filtre "même cercle / auteur..." posé depuis la page d'un jeu. */
  creatorFilter: CreatorFilter | null;
  onClearCreatorFilter: () => void;
  onImport: () => void;
  /** Texte du bouton pendant un import (ex: "Import 1/3…"), null sinon. */
  importStatus: string | null;
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
  resultCount,
  collectionFilter,
  collectionOptions,
  onCollectionFilterChange,
  creatorFilter,
  onClearCreatorFilter,
  onImport,
  importStatus
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

        <Select
          value={collectionFilter}
          options={collectionOptions}
          onChange={onCollectionFilterChange}
          aria-label="Collection"
          className="w-[210px]"
        />

        <SortSelect value={selectedSort} onChange={onSortChange} />

        <button
          type="button"
          onClick={onToggleAdvancedFilters}
          className={`btn ${showAdvancedFilters ? 'btn-primary' : ''}`}
        >
          <SlidersHorizontal size={15} strokeWidth={2.25} />
          Filtres
        </button>

        <button
          type="button"
          onClick={onImport}
          disabled={importStatus !== null}
          className="btn"
          title="Extraire des archives de jeux (.zip, .rar, .7z, .part1.exe) dans le dossier de la bibliothèque"
        >
          <PackagePlus size={15} strokeWidth={2.25} />
          {importStatus ?? 'Importer'}
        </button>

        <button type="button" onClick={onResetFilters} className="btn btn-ghost" title="Réinitialiser les filtres et rescanner">

          <RotateCcw size={15} strokeWidth={2.25} />
          Réinitialiser
        </button>

        {creatorFilter && (
          <span className="tag tag-accent pr-1.5 text-[13px]">
            {CREATOR_FIELD_LABELS[creatorFilter.field]} : {creatorFilter.value}
            <button
              type="button"
              onClick={onClearCreatorFilter}
              aria-label={`Retirer le filtre ${creatorFilter.value}`}
              className="rounded-sm p-0.5 hover:bg-white/10"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </span>
        )}

        <span className="section-title ml-auto">

          {resultCount} œuvre{resultCount > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
