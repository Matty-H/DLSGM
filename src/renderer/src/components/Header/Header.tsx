export interface HeaderProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  selectedCategoryCode: string;
  onCategoryChange: (value: string) => void;
  categories: { code: string; name: string }[];
  showAdvancedFilters: boolean;
  onToggleAdvancedFilters: () => void;
  onResetFilters: () => void;
  onOpenSettings: () => void;
}

export default function Header({
  searchTerm,
  onSearchTermChange,
  selectedCategoryCode,
  onCategoryChange,
  categories,
  showAdvancedFilters,
  onToggleAdvancedFilters,
  onResetFilters,
  onOpenSettings
}: HeaderProps) {
  return (
    <header className="z-[100] flex h-20 items-center justify-between border-b border-glass-border bg-glass px-8 backdrop-blur-app">
      <div>
        <h1 className="m-0 text-2xl font-bold tracking-tight">
          DLS <span className="text-primary">Manager</span>
        </h1>
      </div>

      <div className="flex flex-1 items-center justify-end gap-4">
        <div className="relative w-full max-w-[400px]">
          <input
            type="text"
            value={searchTerm}
            onChange={e => onSearchTermChange(e.target.value)}
            placeholder="Rechercher un jeu, un cercle..."
            className="h-[42px] w-full rounded-xl border border-border bg-surface pl-4 pr-10 text-sm text-white outline-none transition-colors duration-300 focus:border-primary"
          />
          <button
            onClick={onResetFilters}
            title="Réinitialiser les filtres"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-3">
          <select
            value={selectedCategoryCode}
            onChange={e => onCategoryChange(e.target.value)}
            className="flex h-[42px] cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm text-white outline-none transition-colors duration-300 hover:border-primary hover:bg-surface-hover"
          >
            <option value="all">Toutes catégories</option>
            {categories.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={onToggleAdvancedFilters}
            className={`flex h-[42px] items-center justify-center rounded-xl border bg-surface px-4 text-sm text-white transition-colors duration-300 hover:border-primary hover:bg-surface-hover ${
              showAdvancedFilters ? 'border-primary' : 'border-border'
            }`}
          >
            Filtrage Avancé{' '}
            <span
              className={`ml-2 text-xs transition-transform duration-300 ${showAdvancedFilters ? 'rotate-180' : ''}`}
            >
              ▼
            </span>
          </button>
        </div>

        <button
          data-settings-toggle
          onClick={onOpenSettings}
          title="Paramètres"
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-border bg-surface text-lg transition-colors duration-300 hover:bg-surface-hover"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
