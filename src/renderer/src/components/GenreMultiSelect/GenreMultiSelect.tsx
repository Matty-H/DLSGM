import { useEffect, useRef, useState } from 'react';

export interface GenreMultiSelectProps {
  genres: string[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  onReset: () => void;
}

export default function GenreMultiSelect({ genres, selectedGenres, onToggleGenre, onReset }: GenreMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const label = selectedGenres.length === 0 ? 'Genres' : `Genres (${selectedGenres.length})`;

  return (
    <div ref={rootRef} className="relative">
      <div
        onClick={() => setOpen(prev => !prev)}
        className="flex h-[42px] min-w-[200px] cursor-pointer items-center justify-between rounded-xl border border-border bg-surface px-4 text-sm text-white transition-colors duration-200 hover:border-primary"
      >
        {label}
        <span className="ml-2 text-xs">▼</span>
      </div>
      {open && (
        <div className="absolute top-full z-[1000] mt-2 max-h-[400px] w-[250px] overflow-y-auto rounded-lg border border-glass-border bg-[rgba(15,15,20,0.98)] shadow-2xl backdrop-blur-app">
          <div
            onClick={onReset}
            className="cursor-pointer border-b border-glass-border px-4 py-2.5 text-sm font-bold text-accent"
          >
            Réinitialiser la sélection
          </div>
          {genres.map(genre => (
            <div
              key={genre}
              onClick={() => onToggleGenre(genre)}
              className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-surface-hover"
            >
              <input type="checkbox" checked={selectedGenres.includes(genre)} readOnly className="cursor-pointer" />
              <span>{genre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
