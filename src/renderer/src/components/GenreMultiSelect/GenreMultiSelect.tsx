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
      <div onClick={() => setOpen(prev => !prev)} className="input flex min-w-[200px] cursor-pointer items-center justify-between">
        {label}
        <span className="ml-2 text-xs">▼</span>
      </div>
      {open && (
        <div className="absolute top-full z-[1000] mt-2 max-h-[400px] w-[250px] overflow-y-auto border border-divider bg-surface shadow-lg">
          <div onClick={onReset} className="cursor-pointer border-b border-divider px-4 py-2.5 text-sm font-semibold text-accent">
            Réinitialiser la sélection
          </div>
          {genres.map(genre => (
            <div
              key={genre}
              onClick={() => onToggleGenre(genre)}
              className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-neutral-200"
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
